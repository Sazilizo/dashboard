from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Student, User, CategoryEnum, db
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search

students_bp = Blueprint('students', __name__)

@students_bp.route('/', methods=['GET'])
@jwt_required()
def list_students():
    """
    List students for the current user's school with optional filters, search, and pagination.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    search_term = request.args.get('search', type=str)
    grade_filter = request.args.get('grade', type=str)
    category_filter = request.args.get('category', type=str)
    year_filter = request.args.get('year', type=int)

    query = Student.query.filter_by(school_id=user.school_id)

    if grade_filter:
        query = query.filter(Student.grade == grade_filter)
    if category_filter:
        try:
            category_enum = CategoryEnum(category_filter)
            query = query.filter(Student.category == category_enum)
        except ValueError:
            return jsonify({"error": "Invalid category filter"}), 400
    if year_filter:
        query = query.filter(Student.year == year_filter)

    paginated = apply_pagination_and_search(query, Student, search_term, ['full_name'], page, per_page)

    return jsonify({
        'students': [{
            'id': s.id,
            'full_name': s.full_name,
            'grade': s.grade,
            'category': s.category.value,
            'physical_education': s.physical_education,
            'year': s.year,
            'school_id': s.school_id,
            'photo': s.photo,
            'parent_permission_pdf': s.parent_permission_pdf
        } for s in paginated.items],
        'total': paginated.total,
        'page': paginated.page,
        'pages': paginated.pages
    }), 200


@students_bp.route('/', methods=['POST'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def create_students():
    """
    Create one or multiple students for the current user's school.
    Expects JSON object or list of objects with required fields.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

    # Normalize data to list
    students_data = data if isinstance(data, list) else [data]
    created_students = []

    for idx, item in enumerate(students_data, start=1):
        required = ['full_name', 'grade', 'category', 'year']
        missing = [field for field in required if field not in item]
        if missing:
            return jsonify({"error": f"Missing required fields in entry {idx}: {missing}"}), 400

        try:
            category_enum = CategoryEnum(item['category'])
        except ValueError:
            return jsonify({"error": f"Invalid category value in entry {idx}: {item['category']}"}), 400

        pe_value = item.get('physical_education', False)
        if isinstance(pe_value, str):
            pe_value = pe_value.strip().lower() in ['true', '1', 'yes']

        student = Student(
            full_name=item['full_name'].strip(),
            grade=item['grade'].strip(),
            category=category_enum,
            physical_education=pe_value,
            year=int(item['year']),
            school_id=user.school_id,
            photo=item.get('photo'),
            parent_permission_pdf=item.get('parent_permission_pdf')
        )
        db.session.add(student)
        created_students.append(student)

    db.session.commit()

    return jsonify({
        "message": f"{len(created_students)} student(s) created successfully.",
        "students": [{"id": s.id, "full_name": s.full_name} for s in created_students]
    }), 201


@students_bp.route('/<int:student_id>', methods=['PUT'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def update_student(student_id):
    """
    Update student details if the user belongs to the same school.
    """
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())

    if not user or user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

    if 'full_name' in data:
        student.full_name = data['full_name'].strip()
    if 'grade' in data:
        student.grade = data['grade'].strip()
    if 'category' in data:
        try:
            student.category = CategoryEnum(data['category'])
        except ValueError:
            return jsonify({"error": "Invalid category"}), 400
    if 'physical_education' in data:
        pe_val = data['physical_education']
        if isinstance(pe_val, str):
            pe_val = pe_val.strip().lower() in ['true', '1', 'yes']
        student.physical_education = pe_val
    if 'year' in data:
        try:
            student.year = int(data['year'])
        except (ValueError, TypeError):
            return jsonify({"error": "Year must be an integer"}), 400
    if 'photo' in data:
        student.photo = data['photo']
    if 'parent_permission_pdf' in data:
        student.parent_permission_pdf = data['parent_permission_pdf']

    db.session.commit()
    return jsonify({"message": "Student updated"}), 200


@students_bp.route('/<int:student_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin', 'superuser')
def delete_student(student_id):
    """
    Delete student if user is admin or superuser and belongs to the same school.
    """
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())

    if not user or user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    db.session.delete(student)
    db.session.commit()
    return jsonify({"message": "Student deleted"}), 200
