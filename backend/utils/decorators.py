# utils/decorators.py

from functools import wraps
from flask_jwt_extended import get_jwt_identity
from flask import jsonify
from app.models import User

def role_required(*allowed_roles):
    """
    Decorator to restrict access to users with specific roles.

    Usage:
      @role_required('admin', 'superuser')
    """
    allowed_roles = set(role.lower() for role in allowed_roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user_id = get_jwt_identity()
            if not user_id:
                return jsonify({"error": "Missing or invalid JWT token"}), 401

            user = User.query.get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 401

            user_role_name = user.role.name.lower() if user.role else ""
            if user_role_name not in allowed_roles:
                return jsonify({"error": "Access forbidden: insufficient permissions"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
