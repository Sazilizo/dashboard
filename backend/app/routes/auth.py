from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt,
)
from werkzeug.security import check_password_hash
from app.models import User, Role, School, TokenBlocklist
from app.extensions import db, jwt, limiter
from utils.audit import log_event
import re
from datetime import datetime, timedelta
from flask_cors import cross_origin
from utils.maintenance import maintenance_guard

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
@limiter.limit("5 per minute", override_defaults=False)
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role_name = data.get('role', '')  # e.g. 'admin'
    school_name = data.get('school', '')  # e.g. 'My School'

    if not username or not password or not role_name or not school_name:
        return jsonify({"error": "Username, password, role and school are required"}), 400

    # Check if username already exists
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    # Find role by name
    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return jsonify({"error": f"Role '{role_name}' not found"}), 400

    # Find school by name
    school = School.query.filter_by(name=school_name).first()
    if not school:
        return jsonify({"error": f"School '{school_name}' not found"}), 400

    # Create user with hashed password
    user = User(
        username=username,
        role_id=role.id,
        school_id=school.id,
    )
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "User created", "user_id": user.id}), 201


@auth_bp.route('/login', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
@limiter.limit("5 per minute", override_defaults=False)
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON in request"}), 400

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
                additional_claims={
                    "role_id": user.role_id,
                    "school_id": user.school_id
                }
            )
            refresh_token = create_refresh_token(identity=str(user.id))

            log_event("LOGIN_SUCCESS", user_id=user.id, ip=ip, description=f"{username} logged in")
            return jsonify({
                "access_token": access_token,
                "refresh_token": refresh_token
            }), 200

        log_event("LOGIN_FAILED", ip=ip, description=f"Failed login attempt for {username}")
        return jsonify({"error": "Invalid username or password"}), 401

    except Exception as e:
        log_event("LOGIN_ERROR", ip=request.remote_addr, description=str(e))
        return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500


@auth_bp.route('/me', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
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
@maintenance_guard()
@jwt_required(refresh=True)
def refresh_access_token():
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={
                "role_id": user.role_id,
                "school_id": user.school_id
            }
        )

        log_event("REFRESH_TOKEN", user_id=user.id, ip=request.remote_addr)

        return jsonify({"access_token": access_token}), 200

    except Exception as e:
        log_event("REFRESH_TOKEN_ERROR", user_id=user_id, ip=request.remote_addr, description=str(e))
        return jsonify({"error": "Failed to refresh token", "details": str(e)}), 500

@auth_bp.route("/logout", methods=["POST"])
@maintenance_guard()
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    token_type = get_jwt()["type"]
    user_id = get_jwt_identity()
    expires = datetime.fromtimestamp(get_jwt()["exp"])

    block_token = TokenBlocklist(
        jti=jti,
        token_type=token_type,
        user_id=user_id,
        expires_at=expires
    )
    db.session.add(block_token)
    db.session.commit()

    return jsonify(msg="Successfully logged out"), 200