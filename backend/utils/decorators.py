# utils/decorators.py

from functools import wraps
from flask_jwt_extended import get_jwt_identity
from flask import jsonify
from app.models import User, Student

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

def session_role_required():
    """
    Enforces role-based access for recording sessions:
    - If student has physical_education=True ➜ allowed roles: head_coach, admin, superuser
    - If student has physical_education=False ➜ allowed roles: head_tutor, admin, superuser
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            from flask import request  # import locally to avoid circular imports

            student_id = request.form.get('student_id') or request.json.get('student_id')
            if not student_id:
                return jsonify({"error": "Missing student_id for role verification"}), 400

            student = Student.query.get(student_id)
            if not student:
                return jsonify({"error": "Student not found"}), 404

            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404

            pe_roles = {'head_coach', 'admin', 'superuser'}
            academic_roles = {'head_tutor', 'admin', 'superuser'}

            if student.physical_education:
                if user.role.name.lower() not in pe_roles:
                    return jsonify({"error": "Only head coaches, admins, or superusers can record PE sessions"}), 403
            else:
                if user.role.name.lower() not in academic_roles:
                    return jsonify({"error": "Only head tutors, admins, or superusers can record academic sessions"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
