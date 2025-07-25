from datetime import datetime
from app.extensions import db, jwt, limiter
from app.models import Student, User, CategoryEnum, AttendanceRecord, AcademicSession, PESession,Assessment
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, inspect
from utils.decorators import role_required, session_role_required
from utils.pagination import apply_pagination_and_search
from utils.access_control import get_allowed_site_ids
from flask_cors import cross_origin, CORS
from utils.formSchema import generate_schema_from_model
from utils.maintenance import maintenance_guard
from werkzeug.datastructures import FileStorage

students_bp = Blueprint("students", __name__)
# students_bp.strict_slashes = False
# CORS(students_bp, origins="http://localhost:3000", supports_credentials=True)

def str_to_bool(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes", "on")
    return bool(val)

@students_bp.route('/list', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
def list_students():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 10, type=int)
    search_term = request.args.get("search", type=str)

    raw_site_ids = request.args.getlist("school_id", type=int)
    grades = request.args.getlist("grade")
    categories = request.args.getlist("category")
    session_types = request.args.getlist("session_type")

    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids if raw_site_ids else None)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    # Start query with base filters
    query = Student.query.filter(
        Student.deleted == False,
        Student.school_id.in_(allowed_site_ids)
    )

    # Map and apply grade filter if any grades selected
    if grades:
        mapped_grades = [g if g.startswith("Grade") else f"Grade {g}" for g in grades]
        query = query.filter(Student.grade.in_(mapped_grades))

    # Category filter
    if categories:
        query = query.filter(Student.category.in_(categories))

    # Session type logic
    if session_types:
        pe_selected = "PE" in session_types
        acad_selected = "Academics" in session_types

        if pe_selected and not acad_selected:
            query = query.filter(Student.physical_education.is_(True))
        elif acad_selected and not pe_selected:
            query = query.filter(Student.physical_education.is_(False))
        # If both or none selected, no filter applied

    paginated = apply_pagination_and_search(
        query,
        Student,
        search_term,
        ["name", "surname", "parent_name", "parent_contact"],
        page,
        per_page
    )

    return jsonify({
        "students": [s.to_dict() for s in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages
    }), 200


@students_bp.route('/<int:student_id>', methods=['GET'])
@jwt_required()
@role_required("superuser", "admin", "head_tutor", "head_coach")
def get_student(student_id):
    user = User.query.get(get_jwt_identity())
    student = Student.query.filter_by(id=student_id, deleted=False).first()

    if not student:
        return jsonify({"error": "Student not found"}), 404

    if student.school_id not in get_allowed_site_ids(user):
        return jsonify({"error": "Not authorized"}), 403

    return jsonify(student.to_dict(include_related=True)), 200

@students_bp.route("/form_schema", methods=["GET"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def form_schema():
    model_name = request.args.get("model")

    MODEL_MAP = {
        "AcademicSession": AcademicSession,
        "Student": Student,
        "User": User,
        "Assessment":Assessment,
        "PESession":PESession
    }

    model_class = MODEL_MAP.get(model_name)
    if not model_class:
        return jsonify({"error": f"Model '{model_name}' is not supported in this route."}), 400

    current_user = User.query.get(get_jwt_identity())
    schema = generate_schema_from_model(model_class, model_name, current_user=current_user)
    return jsonify(schema)

@students_bp.route("/create", methods=["POST"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
@role_required("superuser", "admin", "head_tutor", "head_coach")
def create_student():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    model_fields = {
        c.name
        for c in Student.__table__.columns
        if c.name not in {"id", "created_at", "updated_at", "deleted", "photo", "birth_cert_pdf", "id_copy_pdf"}
    }

    student_data = {}

    for field in model_fields:
        value = data.get(field)
        if value is None:
            continue

        if field == "school_id":
            try:
                student_data[field] = int(value)
            except ValueError:
                return jsonify({"error": "school_id must be an integer"}), 400

        elif field == "date_of_birth":
            try:
                student_data[field] = datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"error": "Invalid date format for date_of_birth. Use YYYY-MM-DD"}), 400

        elif field in {"physical_education", "has_disability", "is_orphan"}:  # Add your known boolean fields here
            student_data[field] = str_to_bool(value)

        else:
            student_data[field] = value

    # Check for duplicate id_number if provided
    id_number = student_data.get("id_number")
    if id_number and Student.query.filter_by(id_number=id_number).first():
        return jsonify({"error": "Student with this id_number already exists"}), 400

    # Check school access permission
    try:
        allowed_site_ids = get_allowed_site_ids(user, [student_data["school_id"]])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    student = Student(**student_data)
    db.session.add(student)
    db.session.commit()

    return jsonify({
        "message": "Student created successfully",
        "student": student.to_dict()
    }), 201


@limiter.limit("10 per minute")
@students_bp.route('/update/<int:student_id>', methods=['PUT'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def update_student(student_id):
    student = Student.query.filter_by(id=student_id, deleted=False).first_or_404()
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        allowed_site_ids = get_allowed_site_ids(user, [student.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    data = request.form
    file = request.files.get("permission_pdf")

    if 'name' in data:
        student.name = data.get('name').strip()
    if 'surname' in data:
        student.surname = data.get('surname').strip()
    if 'grade' in data:
        student.grade = data.get('grade')
    if 'category' in data:
        try:
            student.category = CategoryEnum(data.get('category'))
        except ValueError:
            return jsonify({"error": "Invalid category"}), 400
    if 'parent_name' in data:
        student.parent_name = data.get('parent_name')
    if 'parent_contact' in data:
        student.parent_contact = data.get('parent_contact')
    if 'start_date' in data:
        try:
            student.start_date = datetime.strptime(data.get('start_date'), "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid start date format"}), 400
    if file:
        student.permission_pdf = file.read()

    db.session.commit()
    return jsonify({"message": "Student updated successfully"}), 200

@students_bp.route('/attendance/mark', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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


@students_bp.route('/attendance/<int:student_id>', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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

@students_bp.route('/attendance/delete/<int:attendance_id>', methods=['DELETE'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def delete_attendance(attendance_id):
    attendance = AttendanceRecord.query.get_or_404(attendance_id)
    db.session.delete(attendance)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
 

@students_bp.route("/remove/<int:student_id>", methods=["DELETE"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required("superuser", "admin", "head_tutor")
def delete_student(student_id):
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    student = Student.query.get_or_404(student_id)

    try:
        allowed_site_ids = get_allowed_site_ids(user, [student.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    student.soft_delete()
    db.session.commit()
    return jsonify({"message": "Student soft-deleted successfully"}), 200


@students_bp.route("/deleted", methods=["GET"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required("superuser", "admin", "head_tutor")
def list_deleted_students():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    raw_site_ids = request.args.getlist("school_id", type=int)

    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    students = Student.query.filter(
        Student.deleted == True,
        Student.school_id.in_(allowed_site_ids)
    ).all()

    return jsonify([s.to_dict() for s in students]), 200
@students_bp.route("/restore/<int:student_id>", methods=["POST"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required("superuser", "admin", "head_tutor")
def restore_student(student_id):
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    student = Student.query.get_or_404(student_id)

    try:
        allowed_site_ids = get_allowed_site_ids(user, [student.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    student.deleted = False
    student.deleted_at = None
    db.session.commit()
    return jsonify({"message": "Student restored successfully"}), 200

