from functools import wraps
from flask_jwt_extended import get_jwt_identity
from flask import jsonify, request
from app.models import User, Student
from utils.access_control import get_allowed_site_ids

def role_required(*allowed_roles):
    """
    Restrict access to users with specific roles.
    Usage: @role_required("admin", "superuser")
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

def school_access_required():
    """
    Restricts access to students or schools the user is allowed to access.
    Automatically resolves student_id or school_id from request.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = User.query.get(get_jwt_identity())
            if not user:
                return jsonify({"error": "User not found"}), 401

            allowed_site_ids = get_allowed_site_ids(user)
            school_id = None

            # From query param
            if 'school_id' in request.args:
                school_id = request.args.get('school_id', type=int)

            # From JSON body
            elif request.is_json:
                data = request.get_json(silent=True) or {}
                school_id = data.get('school_id')

            # From student object (via kwargs or JSON)
            student_id = kwargs.get('student_id') or (request.get_json(silent=True) or {}).get('student_id')

            if student_id:
                student = Student.query.get(student_id)
                if not student or student.school_id not in allowed_site_ids:
                    return jsonify({"error": "Unauthorized access to this student"}), 403

            elif school_id:
                if school_id not in allowed_site_ids:
                    return jsonify({"error": "Unauthorized access to this school"}), 403

            elif not allowed_site_ids:
                return jsonify({"error": "No valid school access."}), 403

            return f(*args, **kwargs)
        return wrapper
    return decorator

def role_and_school_required(*allowed_roles):
    """
    Combined decorator for role + school access.
    Usage: @role_and_school_required("admin", "head_tutor")
    """
    def decorator(fn):
        @wraps(fn)
        @role_required(*allowed_roles)
        @school_access_required()
        def wrapper(*args, **kwargs):
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def session_role_required():
    """
    Restricts access to recording academic vs PE sessions.
    - PE sessions ➜ allowed: head_coach, admin, superuser
    - Academic sessions ➜ allowed: head_tutor, admin, superuser
    Also enforces school access for the student.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Extract student_id safely
            student_id = request.form.get('student_id')
            if not student_id and request.is_json:
                student_id = (request.get_json(silent=True) or {}).get('student_id')

            if not student_id:
                return jsonify({"error": "Missing student_id for role verification"}), 400

            student = Student.query.get(student_id)
            if not student:
                return jsonify({"error": "Student not found"}), 404

            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404

            # Enforce school-level access
            allowed_site_ids = get_allowed_site_ids(user)
            if student.school_id not in allowed_site_ids:
                return jsonify({"error": "Access denied to this school"}), 403

            # Role check based on student type
            user_role = user.role.name.lower()
            if student.physical_education:
                if user_role not in {"head_coach", "admin", "superuser"}:
                    return jsonify({"error": "Only head coaches, admins, or superusers can record PE sessions"}), 403
            else:
                if user_role not in {"head_tutor", "admin", "superuser"}:
                    return jsonify({"error": "Only head tutors, admins, or superusers can record academic sessions"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
