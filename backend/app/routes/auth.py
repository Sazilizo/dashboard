from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash
from app.models import User, db
import re

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON in request"}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')

        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        # Optional: basic username format check
        if not re.match(r'^[\w.@+-]{3,}$', username):
            return jsonify({"error": "Invalid username format"}), 400

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            access_token = create_access_token(
                identity=user.id,
                additional_claims={"role_id": user.role_id, "school_id": user.school_id}
            )
            return jsonify(access_token=access_token), 200

        return jsonify({"error": "Invalid username or password"}), 401

    except Exception as e:
        return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500
