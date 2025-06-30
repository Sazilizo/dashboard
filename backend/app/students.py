from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Student, User, db
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search
import csv
import io

students_bp = Blueprint('students', __name__)

# List students for the user's assigned school only, with pagination and optional grade search
@students_bp.route('/', methods=['GET'])
@jwt_required()
def list_students():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 10))
    search_term = request.args.get('search')
    grade_filter = request.args.get('grade')

    query = Student.query.filter_by(school_id=user.school_id)

    if grade_filter:
        query = query.filter(Student.grade == grade_filter)

    paginated = apply_pagination_and_search(query, Student, search_term, ['full_name'], page, per_page)

    return jsonify({
        'students': [{
            'id': s.id,
            'full_name': s.full_name,
            'grade': s.grade,
            'category': s.category,
            'year': s.year,
            'physical_education': s.physical_education,
            'school_id': s.school_id,
            'photo': s.photo,
            'parent_permission_pdf': s.parent_permission_pdf
        } for s in paginated.items],
        'total': paginated.total,
        'page': paginated.page,
        'pages': paginated.pages
    }), 200

# Create a student
@students_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser')
def create_student():
    data = request.get_json()
    user = User.query.get(get_jwt_identity())

    required_fields = ['full_name', 'grade', 'category', 'year']
    missing_fields = [f for f in required_fields if f not in data]
    if missing_fields:
        return jsonify({"error": f"Missing fields: {', '.join(missing_fields)}"}), 400

    student = Student(
        full_name=data['full_name'],
        grade=data['grade'],
        category=data['category'],
        year=data['year'],
        physical_education=data.get('physical_education', False),
        school_id=user.school_id,
        photo=data.get('photo'),
        parent_permission_pdf=data.get('parent_permission_pdf')
    )

    db.session.add(student)
    db.session.commit()

    return jsonify({"message": "Student created successfully", "student_id": student.id}), 201

# Bulk create students via CSV upload
@students_bp.route('/bulk_upload', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser')
def bulk_upload_students():
    user = User.query.get(get_jwt_identity())
    if 'file' not in request.files:
        return jsonify({"error": "CSV file is required"}), 400

    file = request.files['file']
    if not file.filename.endswith('.csv'):
        return jsonify({"error": "Only CSV files are allowed"}), 400

    stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
    csv_input = csv.DictReader(stream)

    created = 0
    for row in csv_input:
        if 'full_name' in row and 'grade' in row and 'category' in row and 'year' in row:
            student = Student(
                full_name=row['full_name'],
                grade=row['grade'],
                category=row['category'],
                year=int(row['year']),
                physical_education=row.get('physical_education', 'false').lower() == 'true',
                school_id=user.school_id,
                photo=row.get('photo'),
                parent_permission_pdf=row.get('parent_permission_pdf')
            )
            db.session.add(student)
            created += 1
    db.session.commit()
    return jsonify({"message": f"{created} students uploaded successfully."}), 201

# Update student
@students_bp.route('/<int:student_id>', methods=['PUT'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def update_student(student_id):
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    data = request.get_json()
    student.full_name = data.get('full_name', student.full_name)
    student.grade = data.get('grade', student.grade)
    student.category = data.get('category', student.category)
    student.year = data.get('year', student.year)
    student.physical_education = data.get('physical_education', student.physical_education)
    student.photo = data.get('photo', student.photo)
    student.parent_permission_pdf = data.get('parent_permission_pdf', student.parent_permission_pdf)

    db.session.commit()
    return jsonify({"message": "Student updated"}), 200

# Delete student
@students_bp.route('/<int:student_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin', 'superuser')
def delete_student(student_id):
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    db.session.delete(student)
    db.session.commit()
    return jsonify({"message": "Student deleted"}), 200
