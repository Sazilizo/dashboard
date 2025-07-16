from datetime import datetime
from app.extensions import db, jwt, limiter
from app.models import Student, User, CategoryEnum, AttendanceRecord
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search
from utils.access_control import get_allowed_site_ids

students_bp = Blueprint('students', __name__)

@students_bp.route('/', methods=['GET'])
@jwt_required()
def list_students():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Check role
    allowed_roles = ['admin', 'superuser', 'viewer']
    user_is_elevated = user.role in allowed_roles

    # Get site_id(s) from query
    site_param = request.args.get("site_id")
    if site_param:
        try:
            requested_site_ids = [int(s.strip()) for s in site_param.split(",")]
        except ValueError:
            return jsonify({"error": "Invalid site_id(s)"}), 400
    else:
        requested_site_ids = [user.school_id]  # default

    # 🔐 Enforce access control
    if not user_is_elevated:
        # Force to only their assigned school
        if any(site_id != user.school_id for site_id in requested_site_ids):
            return jsonify({"error": "Access denied to one or more requested sites"}), 403
        requested_site_ids = [user.school_id]

    # Pagination & filters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    search_term = request.args.get('search', type=str)
    grade_filter = request.args.get('grade', type=str)
    category_filter = request.args.get('category', type=str)
    year_filter = request.args.get('year', type=int)
    pe_filter = request.args.get('pe')

    # Query filtered by allowed school_ids
    query = Student.query.filter(
        Student.school_id.in_(requested_site_ids),
        Student.deleted == False
    )

    # Extra filters
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

    if pe_filter is not None:
        pe_bool = pe_filter.lower() in ['true', '1', 'yes']
        query = query.filter(Student.physical_education == pe_bool)

    # Pagination + Search
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

@students_bp.route('/create', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def create_students():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

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

@limiter.limit("10 per minute")
@students_bp.route('/<int:student_id>', methods=['PUT'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def update_student(student_id):
    student = Student.query.filter_by(id=student_id, deleted=False).first_or_404()
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

@students_bp.route('/attendance/mark', methods=['POST'])
@jwt_required()
def mark_attendance():
    data = request.get_json()
    records = data.get('records', [])
    date_str = data.get('date')
    if not date_str or not records:
        return jsonify({"error": "Missing data"}), 400

    date = datetime.strptime(date_str, '%Y-%m-%d').date()
    user_id = get_jwt_identity()

    for record in records:
        student_id = record['student_id']
        status = record['status']  # 'present', 'absent', etc.

        existing = AttendanceRecord.query.filter_by(student_id=student_id, date=date).first()
        if existing:
            existing.status = status
            existing.recorded_by = user_id
        else:
            new = AttendanceRecord(
                student_id=student_id,
                date=date,
                status=status,
                recorded_by=user_id
            )
            db.session.add(new)

    db.session.commit()
    return jsonify({"message": "Attendance recorded"}), 200


@students_bp.route('/attendance/summary', methods=['GET'])
@jwt_required()
def get_attendance_summary():
    school_id = request.args.get('school_id', type=int)
    grade = request.args.get('grade')
    start = request.args.get('start_date')
    end = request.args.get('end_date')

    try:
        start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else None
        end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else None
    except:
        return jsonify({"error": "Invalid date format"}), 400

    query = db.session.query(
        Student.id.label("student_id"),
        Student.full_name,
        AttendanceRecord.date,
        AttendanceRecord.status
    ).join(AttendanceRecord).filter(Student.deleted == False)

    if school_id:
        query = query.filter(Student.school_id == school_id)
    if grade:
        query = query.filter(Student.grade == grade)
    if start_date:
        query = query.filter(AttendanceRecord.date >= start_date)
    if end_date:
        query = query.filter(AttendanceRecord.date <= end_date)

    records = query.order_by(AttendanceRecord.date).all()

    result = {}
    for r in records:
        if r.student_id not in result:
            result[r.student_id] = {
                "student_name": r.full_name,
                "attendance": []
            }
        result[r.student_id]["attendance"].append({
            "date": r.date.isoformat(),
            "status": r.status
        })

    return jsonify(result)


@students_bp.route('/<int:student_id>/attendance', methods=['GET'])
@jwt_required()
def get_student_attendance(student_id):
    student = Student.query.get_or_404(student_id)

    attendance = AttendanceRecord.query.filter_by(student_id=student_id).order_by(AttendanceRecord.date.desc()).all()

    return jsonify([
        {
            "date": record.date.isoformat(),
            "status": record.status,
            "recorded_by": record.recorded_by
        } for record in attendance
    ])

@students_bp.route('/attendance/stats', methods=['GET'])
@jwt_required()
def attendance_stats():
    school_id = request.args.get('school_id', type=int)
    grade = request.args.get('grade')

    query = db.session.query(
        AttendanceRecord.status,
        func.count(AttendanceRecord.id)
    ).join(Student)

    if school_id:
        query = query.filter(Student.school_id == school_id)
    if grade:
        query = query.filter(Student.grade == grade)

    query = query.group_by(AttendanceRecord.status)
    stats = query.all()

    total = sum(count for _, count in stats)
    result = []
    for status, count in stats:
        percent = (count / total) * 100 if total else 0
        result.append({
            "status": status,
            "count": count,
            "percentage": round(percent, 2)
        })

    return jsonify(result)

@students_bp.route('/attendance/<int:attendance_id>', methods=['DELETE'])
@jwt_required()
def delete_attendance(attendance_id):
    attendance = AttendanceRecord.query.get_or_404(attendance_id)
    db.session.delete(attendance)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
 
@limiter.limit("3 per minute")
@students_bp.route('/<int:student_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin', 'superuser')
def delete_student(student_id):
    student = Student.query.filter_by(id=student_id, deleted=False).first_or_404()
    user = User.query.get(get_jwt_identity())

    if not user or user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    student.soft_delete()
    db.session.commit()
    return jsonify({"message": "Student soft-deleted"}), 200


@students_bp.route('/deleted', methods=['GET'])
@jwt_required()
@role_required('admin', 'superuser')
def list_deleted_students():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    deleted_students = Student.query.filter_by(school_id=user.school_id, deleted=True).all()

    return jsonify({
        "deleted_students": [{
            "id": s.id,
            "full_name": s.full_name,
            "grade": s.grade,
            "year": s.year,
            "category": s.category.value,
            "deleted_at": s.deleted_at.isoformat() if s.deleted_at else None
        } for s in deleted_students]
    }), 200


@students_bp.route('/<int:student_id>/restore', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser')
def restore_student(student_id):
    student = Student.query.filter_by(id=student_id, deleted=True).first()
    if not student:
        return jsonify({"error": "Deleted student not found"}), 404

    user = User.query.get(get_jwt_identity())
    if not user or user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    student.restore()
    db.session.commit()
    return jsonify({"message": "Student restored successfully"}), 200
