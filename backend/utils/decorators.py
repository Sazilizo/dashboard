# # utils/decorators.py

# from functools import wraps
# from flask_jwt_extended import get_jwt_identity
# from flask import jsonify
# from app.models import User, Student

# def role_required(*allowed_roles):
#     """
#     Decorator to restrict access to users with specific roles.

#     Usage:
#       @role_required('admin', 'superuser')
#     """
#     allowed_roles = set(role.lower() for role in allowed_roles)

#     def decorator(fn):
#         @wraps(fn)
#         def wrapper(*args, **kwargs):
#             user_id = get_jwt_identity()
#             if not user_id:
#                 return jsonify({"error": "Missing or invalid JWT token"}), 401

#             user = User.query.get(user_id)
#             if not user:
#                 return jsonify({"error": "User not found"}), 401

#             user_role_name = user.role.name.lower() if user.role else ""
#             if user_role_name not in allowed_roles:
#                 return jsonify({"error": "Access forbidden: insufficient permissions"}), 403

#             return fn(*args, **kwargs)
#         return wrapper
#     return decorator

# def session_role_required():
#     """
#     Enforces role-based access for recording sessions:
#     - If student has physical_education=True ➜ allowed roles: head_coach, admin, superuser
#     - If student has physical_education=False ➜ allowed roles: head_tutor, admin, superuser
#     """
#     def decorator(fn):
#         @wraps(fn)
#         def wrapper(*args, **kwargs):
#             from flask import request  # import locally to avoid circular imports

#             student_id = request.form.get('student_id') or request.json.get('student_id')
#             if not student_id:
#                 return jsonify({"error": "Missing student_id for role verification"}), 400

#             student = Student.query.get(student_id)
#             if not student:
#                 return jsonify({"error": "Student not found"}), 404

#             user_id = get_jwt_identity()
#             user = User.query.get(user_id)
#             if not user:
#                 return jsonify({"error": "User not found"}), 404

#             pe_roles = {'head_coach', 'admin', 'superuser'}
#             academic_roles = {'head_tutor', 'admin', 'superuser'}

#             if student.physical_education:
#                 if user.role.name.lower() not in pe_roles:
#                     return jsonify({"error": "Only head coaches, admins, or superusers can record PE sessions"}), 403
#             else:
#                 if user.role.name.lower() not in academic_roles:
#                     return jsonify({"error": "Only head tutors, admins, or superusers can record academic sessions"}), 403

#             return fn(*args, **kwargs)
#         return wrapper
#     return decorator

# utils/decorators.py

from functools import wraps
from flask_jwt_extended import get_jwt_identity
from flask import jsonify, request
from app.models import User, Student, School
from utils.access_control import get_allowed_site_ids

def role_required(*allowed_roles):
    """
    Decorator to restrict access to users with specific roles.
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
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            current_user = User.query.get(get_jwt_identity())
            allowed_site_ids = current_user.get_allowed_site_ids()

            school_id = None

            # 1. First check query params (e.g., ?school_id=19)
            if 'school_id' in request.args:
                school_id = request.args.get('school_id', type=int)

            # 2. Check for 'school_id' in JSON body (safely)
            elif request.is_json:
                data = request.get_json(silent=True) or {}
                if 'school_id' in data:
                    school_id = data.get('school_id')

            # 3. If accessing a specific student (validate school through that)
            student_id = kwargs.get('student_id')
            if not student_id and request.is_json:
                json_data = request.get_json(silent=True) or {}
                student_id = json_data.get('student_id')

            if student_id:
                student = Student.query.get(student_id)
                if not student or student.school_id not in allowed_site_ids:
                    return jsonify({"error": "Unauthorized access to this student."}), 403

            elif school_id:
                if school_id not in allowed_site_ids:
                    return jsonify({"error": "Unauthorized access to this school."}), 403

            # No school_id or student_id present, and user isn't privileged
            elif not allowed_site_ids:
                return jsonify({"error": "No valid school access."}), 403

            return f(*args, **kwargs)
        return wrapper
    return decorator

def role_and_school_required(*allowed_roles):
    """
    Combined decorator that checks both role and school access.
    This is your universal, reusable solution.
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
    Enforces role-based access for recording sessions with school validation.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Get student_id from request
            student_id = request.form.get('student_id') or (request.get_json() or {}).get('student_id')
            if not student_id:
                return jsonify({"error": "Missing student_id for role verification"}), 400

            student = Student.query.get(student_id)
            if not student:
                return jsonify({"error": "Student not found"}), 404

            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404

            # Check school access first
            try:
                allowed_site_ids = get_allowed_site_ids(user, [student.school_id])
                if student.school_id not in allowed_site_ids:
                    return jsonify({"error": "Access denied to this school"}), 403
            except (ValueError, PermissionError) as e:
                return jsonify({"error": str(e)}), 403

            # Then check role-based access
            pe_roles = {'head_coach', 'admin', 'superuser'}
            academic_roles = {'head_tutor', 'admin', 'superuser'}

            user_role = user.role.name.lower()
            
            if student.physical_education:
                if user_role not in pe_roles:
                    return jsonify({"error": "Only head coaches, admins, or superusers can record PE sessions"}), 403
            else:
                if user_role not in academic_roles:
                    return jsonify({"error": "Only head tutors, admins, or superusers can record academic sessions"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
