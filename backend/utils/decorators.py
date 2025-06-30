from flask_jwt_extended import verify_jwt_in_request, get_jwt
from flask import jsonify
from functools import wraps
from app.models import Role

ROLE_MAP = {
    "superuser": 1,
    "admin": 2,
    "viewer": 3,
    "tutor": 4,
    "coach": 5,
    "cleaner": 6,
    "general": 7
}

def get_role_ids(*role_names):
    return [ROLE_MAP[name] for name in role_names if name in ROLE_MAP]

def role_required(*allowed_role_names):
    allowed_role_ids = get_role_ids(*allowed_role_names)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user_role_id = claims.get("role_id")

            print("User role ID from JWT claims:", user_role_id)
            print("Allowed role IDs:", allowed_role_ids)

            if user_role_id not in allowed_role_ids:
                return jsonify({"error": "Access forbidden"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
