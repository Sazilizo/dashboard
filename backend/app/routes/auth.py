from flask import Blueprint, request, jsonify, current_app, make_response
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt
)
from werkzeug.security import check_password_hash
from app.models import User, Role, School, TokenBlocklist
from app.extensions import db, jwt, limiter
from utils.audit import log_event
from utils.maintenance import maintenance_guard
from datetime import datetime, timedelta
from flask_cors import cross_origin
import re

auth_bp = Blueprint('auth', __name__)
PRIVILEGED_ROLES = {"superuser", "admin", "hr", "guest"}


@auth_bp.route('/register', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@limiter.limit("5 per minute", override_defaults=False)
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role_name = data.get('role', '').strip()
    school_name = data.get('school', '').strip()

    if not username or not password or not role_name:
        return jsonify({"error": "Username, password, and role are required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return jsonify({"error": f"Role '{role_name}' not found"}), 400

    school = None
    if role_name not in PRIVILEGED_ROLES:
        if not school_name:
            return jsonify({"error": "School is required for this role"}), 400
        school = School.query.filter_by(name=school_name).first()
        if not school:
            return jsonify({"error": f"School '{school_name}' not found"}), 400

    user = User(username=username, role_id=role.id, school_id=school.id if school else None)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "User created",
        "user_id": user.id,
        "school_id": user.school_id,
        "role": role_name
    }), 201


@auth_bp.route('/login', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@limiter.limit("5 per minute", override_defaults=False)
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    ip = request.remote_addr

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if not re.match(r'^[\w.@+-]{3,}$', username):
        return jsonify({"error": "Invalid username format"}), 400

    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        access_token = create_access_token(
            identity=str(user.id),
            expires_delta=timedelta(hours=1),
            additional_claims={"role_id": user.role_id, "school_id": user.school_id}
        )
        refresh_token = create_refresh_token(
            identity=str(user.id),
            expires_delta=timedelta(days=7)
        )

        response = make_response(jsonify({"message": "Login successful"}))
        # Pull `secure` and `samesite` from your Config
        secure_flag = current_app.config["JWT_COOKIE_SECURE"]
        same_site = current_app.config["JWT_COOKIE_SAMESITE"]

        response.set_cookie(
            "access_token_cookie",
            access_token,
            max_age=60 * 60,  # 1 hour
            httponly=True,
            secure=secure_flag,
            samesite=same_site,
            path="/"
        )
        response.set_cookie(
            "refresh_token_cookie",
            refresh_token,
            max_age=60 * 60 * 24 * 7,  # 7 days
            httponly=True,
            secure=secure_flag,
            samesite=same_site,
            path="/auth/refresh"
        )

        log_event("LOGIN_SUCCESS", user_id=user.id, ip=ip, description=f"{username} logged in")
        return response

    log_event("LOGIN_FAILED", ip=ip, description=f"Failed login attempt for {username}")
    return jsonify({"error": "Invalid username or password"}), 401


@auth_bp.route('/me', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)

    log_event("VIEW_CURRENT_USER", user_id=user.id, ip=request.remote_addr)

    return jsonify({
        "id": user.id,
        "username": user.username,
        "role": user.role.name if user.role else None,
        "role_id": user.role_id,
        "school": user.school.name if user.school else None,
        "school_id": user.school_id
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required(refresh=True, locations=["cookies"])
def refresh_access_token():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    access_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(hours=1),
        additional_claims={"role_id": user.role_id, "school_id": user.school_id}
    )

    response = make_response(jsonify({"message": "Token refreshed"}))
    secure_flag = current_app.config["JWT_COOKIE_SECURE"]
    same_site = current_app.config["JWT_COOKIE_SAMESITE"]

    response.set_cookie(
        "access_token_cookie",
        access_token,
        max_age=60 * 60,  # 1 hour
        httponly=True,
        secure=secure_flag,
        samesite=same_site,
        path="/"
    )

    log_event("REFRESH_TOKEN", user_id=user.id, ip=request.remote_addr)
    return response


@auth_bp.route("/logout", methods=["POST"])
@maintenance_guard()
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    user_id = get_jwt_identity()
    expires = datetime.fromtimestamp(get_jwt()["exp"])

    token_block = TokenBlocklist(jti=jti, user_id=user_id, expires_at=expires)
    db.session.add(token_block)
    db.session.commit()

    response = make_response(jsonify({"message": "Successfully logged out"}))
    response.delete_cookie("access_token_cookie", path="/")
    response.delete_cookie("refresh_token_cookie", path="/auth/refresh")

    log_event("LOGOUT", user_id=user_id, ip=request.remote_addr)
    return response


@auth_bp.route('/debug/cookies', methods=['GET', 'OPTIONS'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
def debug_cookies():
    current_app.logger.debug("Incoming cookies: %r", request.cookies)
    return jsonify({"received_cookies": request.cookies}), 200
