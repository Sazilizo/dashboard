from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Student, User, StudentSession, CategoryEnum, Assessment
from utils.decorators import role_required, session_role_required, get_allowed_site_ids
from werkzeug.utils import secure_filename
from datetime import datetime
import os
from io import BytesIO
import zipfile, pandas as pd
from app.extensions import db
from flask_cors import cross_origin
from utils.formSchema import generate_schema_from_model
from utils.maintenance import maintenance_guard
from utils.specs_config import SPEC_OPTIONS
from collections import defaultdict
import statistics
import json
from sqlalchemy.orm import joinedload

student_sessions_bp = Blueprint('studentsessions', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@student_sessions_bp.route("/form_schema", methods=["GET"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def form_schema():
    model_name = request.args.get("model")

    MODEL_MAP = {
        "StudentSession": StudentSession,
        "Student": Student,
        "User": User,
        "Assessment":Assessment
    }

    model_class = MODEL_MAP.get(model_name)
    if not model_class:
        return jsonify({"error": f"Model '{model_name}' is not supported in this route."}), 400

    current_user = User.query.get(get_jwt_identity())
    schema = generate_schema_from_model(model_class, model_name, current_user=current_user)
    return jsonify(schema)

@student_sessions_bp.route('/create', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@session_role_required()
def create_session():
    # Required fields
    required_fields = ['student_id', 'session_name', 'date', 'duration_hours']
    missing_fields = [f for f in required_fields if f not in request.form]
    if missing_fields:
        return jsonify({"error": f"Missing fields: {missing_fields}"}), 400

    # Parse and validate inputs
    try:
        student_id = int(request.form['student_id'])
        session_name = request.form['session_name'].strip()
        date_obj = datetime.strptime(request.form['date'], '%Y-%m-%d').date()
        duration_hours = float(request.form['duration_hours'])
    except (ValueError, TypeError) as e:
        return jsonify({"error": "Invalid data types or formats", "details": str(e)}), 400

    # Optional specs (expected as JSON string)
    specs = None
    specs_raw = request.form.get('specs')
    if specs_raw:
        try:
            specs = json.loads(specs_raw)
            if not isinstance(specs, dict):
                raise ValueError("Specs must be a JSON object")
        except Exception as e:
            return jsonify({"error": "Invalid specs JSON", "details": str(e)}), 400

    outcomes = request.form.get('outcomes', '').strip()
    photo_file = request.files.get('photo')

    # Authenticated user
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Student access
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    allowed_site_ids = get_allowed_site_ids(user)
    if student.school_id not in allowed_site_ids:
        return jsonify({"error": "Forbidden: You are not allowed to access this student's school"}), 403

    # Validate spec keys based on category
    if specs:
        category_key = student.category.value if student.category else None
        allowed_keys = {item['key'] for item in SPEC_OPTIONS.get(category_key, [])}
        invalid_keys = set(specs.keys()) - allowed_keys
        if invalid_keys:
            return jsonify({
                "error": "Invalid spec keys",
                "invalid_keys": list(invalid_keys),
                "allowed_keys": list(allowed_keys)
            }), 400

    # Handle file upload
    filename = None
    if photo_file:
        if allowed_file(photo_file.filename):
            filename = secure_filename(photo_file.filename)
            upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'session_photos')
            os.makedirs(upload_folder, exist_ok=True)
            photo_path = os.path.join(upload_folder, filename)
            photo_file.save(photo_path)
        else:
            return jsonify({"error": "Invalid file type"}), 400

    # Create session record
    session = StudentSession(
        student_id=student.id,
        user_id=user.id,
        session_name=session_name,
        date=date_obj,
        duration_hours=duration_hours,
        photo=filename,
        outcomes=outcomes,
        category=student.category,
        physical_education=student.physical_education,
        specs=specs
    )

    db.session.add(session)
    db.session.commit()

    return jsonify({
        "message": "Session created successfully",
        "session_id": session.id,
        "category": session.category.value if session.category else None,
        "physical_education": session.physical_education,
        "specs": session.specs
    }), 201

@student_sessions_bp.route('/sessions', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@session_role_required()
def list_sessions():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    allowed_site_ids = get_allowed_site_ids(user)

    grade = request.args.get('grade')
    category = request.args.get('category')
    pe_filter = request.args.get('pe')
    search = request.args.get('search', '').strip().lower()
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = StudentSession.query.join(Student).filter(
        Student.school_id.in_(allowed_site_ids),
        Student.deleted == False
    )

    if grade:
        query = query.filter(Student.grade == grade)

    if category:
        try:
            category_enum = CategoryEnum(category)
            query = query.filter(Student.category == category_enum)
        except ValueError:
            return jsonify({"error": f"Invalid category: {category}"}), 400

    if pe_filter is not None:
        pe_bool = pe_filter.lower() in ['true', '1', 'yes']
        query = query.filter(Student.physical_education == pe_bool)

    if search:
        query = query.filter(Student.full_name.ilike(f"%{search}%"))

    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(StudentSession.date >= start_date_obj)
        except ValueError:
            return jsonify({"error": "Invalid start_date format, use YYYY-MM-DD"}), 400

    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(StudentSession.date <= end_date_obj)
        except ValueError:
            return jsonify({"error": "Invalid end_date format, use YYYY-MM-DD"}), 400

    paginated = query.order_by(StudentSession.date.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "sessions": [{
            "id": s.id,
            "student_id": s.student_id,
            "student_name": s.student.full_name,
            "session_name": s.session_name,
            "date": s.date.isoformat(),
            "duration_hours": s.duration_hours,
            "category": s.category.value,
            "grade": s.student.grade,
            "physical_education": s.student.physical_education,
            "photo": s.photo,
            "outcomes": s.outcomes
        } for s in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages
    }), 200

@student_sessions_bp.route('/stats/<int:student_id>', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
def student_stats(student_id):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    allowed_site_ids = get_allowed_site_ids(user)

    student = Student.query.get(student_id)
    if not student or student.school_id not in allowed_site_ids:
        return jsonify({"error": "Student not found or access denied"}), 404

    sessions = StudentSession.query.filter_by(student_id=student_id).all()
    if not sessions:
        return jsonify({"specs": {}, "session_count": 0})

    # Aggregate specs (e.g., average)
    from collections import defaultdict
    import statistics

    spec_accumulator = defaultdict(list)
    for session in sessions:
        if session.specs:
            for key, value in session.specs.items():
                try:
                    spec_accumulator[key].append(float(value))
                except ValueError:
                    continue

    averaged_specs = {
        key: round(statistics.mean(values), 2)
        for key, values in spec_accumulator.items() if values
    }

    return jsonify({
        "student_id": student_id,
        "student_name": student.full_name,
        "specs": averaged_specs,
        "session_count": len(sessions)
    })


@student_sessions_bp.route('/stats', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
def all_students_stats():
    user = User.query.get(get_jwt_identity())
    allowed_site_ids = get_allowed_site_ids(user)

    students = Student.query.filter(Student.school_id.in_(allowed_site_ids)).all()
    results = []

    for student in students:
        sessions = StudentSession.query.filter_by(student_id=student.id).all()
        if not sessions:
            continue

        spec_accumulator = defaultdict(list)
        for session in sessions:
            if session.specs:
                for key, value in session.specs.items():
                    try:
                        spec_accumulator[key].append(float(value))
                    except ValueError:
                        continue

        averaged_specs = {
            key: round(statistics.mean(values), 2)
            for key, values in spec_accumulator.items() if values
        }

        results.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "specs": averaged_specs,
            "session_count": len(sessions)
        })

    return jsonify(results)


@student_sessions_bp.route('/specs/summary', methods=['GET'])
@jwt_required()
def get_specs_summary():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # Support ?school_id=... (multi) and ?group_by=grade|category
    raw_site_ids = request.args.getlist("school_id", type=int)
    group_by = request.args.get("group_by")  # 'grade', 'category', or None

    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    # Load sessions with student info
    sessions = (
        StudentSession.query
        .join(Student)
        .options(joinedload(StudentSession.student))
        .filter(Student.school_id.in_(allowed_site_ids))
        .all()
    )

    # Group: student ID (default), or by grade/category
    grouped_specs = defaultdict(lambda: defaultdict(list))  # e.g., {"grade 3": {"reading": [80, 90]}}

    for session in sessions:
        student = session.student
        if not student or not session.specs or not isinstance(session.specs, dict):
            continue

        if group_by == "grade":
            key = student.grade
        elif group_by == "category":
            key = student.category.value if student.category else "Unknown"
        else:
            key = str(student.id)  # default: per student

        for spec_key, val in session.specs.items():
            if isinstance(val, (int, float)):
                grouped_specs[key][spec_key].append(val)

    # Compute means
    response = []
    for group_key, spec_dict in grouped_specs.items():
        averages = {
            spec_name: round(statistics.mean(values), 2)
            for spec_name, values in spec_dict.items()
        }
        response.append({
            "group": group_key,
            "averages": averages
        })

    return jsonify(response), 200


@student_sessions_bp.route('/bulkupload', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def bulk_upload_sessions():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if 'file' not in request.files:
        return jsonify({"error": "Missing CSV/XLSX file"}), 400

    file = request.files['file']
    photo_zip = request.files.get('photos')  # Optional

    # Filters
    grade_filter = request.form.get('grade')
    category_filter = request.form.get('category')
    pe_filter = request.form.get('pe')

    allowed_site_ids = get_allowed_site_ids(user)

    # Student filtering
    student_query = Student.query.filter(
        Student.school_id.in_(allowed_site_ids),
        Student.deleted == False
    )
    if grade_filter:
        student_query = student_query.filter(Student.grade == grade_filter)
    if category_filter:
        try:
            category_enum = CategoryEnum(category_filter)
            student_query = student_query.filter(Student.category == category_enum)
        except ValueError:
            return jsonify({"error": "Invalid category filter"}), 400
    if pe_filter:
        pe_bool = pe_filter.lower() in ['true', '1', 'yes']
        student_query = student_query.filter(Student.physical_education == pe_bool)

    student_map = {s.id: s for s in student_query.all()}
    if not student_map:
        return jsonify({"error": "No students matched the filters"}), 400

    ext = file.filename.rsplit('.', 1)[1].lower()
    try:
        if ext == 'csv':
            df = pd.read_csv(file)
        elif ext in ['xls', 'xlsx']:
            df = pd.read_excel(file)
        else:
            return jsonify({"error": "Unsupported file format. Use CSV or Excel."}), 400
    except Exception as e:
        return jsonify({"error": "Failed to read file", "details": str(e)}), 400

    # Photo handling
    photo_files = {}
    if photo_zip:
        try:
            zip_data = zipfile.ZipFile(BytesIO(photo_zip.read()))
            for name in zip_data.namelist():
                photo_files[name] = zip_data.read(name)
        except Exception as e:
            return jsonify({"error": "Failed to read ZIP file", "details": str(e)}), 400

    created_sessions = []

    for idx, row in df.iterrows():
        student_id = row.get('student_id')
        if student_id not in student_map:
            continue

        try:
            date_obj = datetime.strptime(str(row['date']), '%Y-%m-%d').date()
            duration = float(row['duration_hours'])
        except Exception:
            continue

        photo_filename = row.get('photo_filename')
        saved_photo = None
        if photo_filename and photo_filename in photo_files:
            secure_name = secure_filename(photo_filename)
            photo_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'session_photos')
            os.makedirs(photo_path, exist_ok=True)
            with open(os.path.join(photo_path, secure_name), 'wb') as f:
                f.write(photo_files[photo_filename])
            saved_photo = secure_name

        student = student_map[student_id]
        session = StudentSession(
            student_id=student_id,
            user_id=user.id,
            session_name=row.get('session_name', '').strip(),
            date=date_obj,
            duration_hours=duration,
            outcomes=row.get('outcomes'),
            photo=saved_photo,
            category=student.category,
            physical_education=student.physical_education
        )
        db.session.add(session)
        created_sessions.append(session)

    db.session.commit()

    return jsonify({
        "message": f"{len(created_sessions)} sessions created successfully."
    }), 201
