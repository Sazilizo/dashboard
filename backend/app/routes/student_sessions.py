
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Student, User, StudentSession, CategoryEnum
from utils.decorators import role_required, session_role_required
from werkzeug.utils import secure_filename
from datetime import datetime
import os
from io import BytesIO
import zipfile, pandas as pd
from app.extensions import db

student_sessions_bp = Blueprint('student_sessions', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@student_sessions_bp.route('/create_session', methods=['POST'])
@jwt_required()
@session_role_required()
def create_session():
    required_fields = ['student_id', 'session_name', 'date', 'duration_hours']
    if not all(f in request.form for f in required_fields):
        return jsonify({"error": "Missing required form fields"}), 400

    try:
        student_id = int(request.form['student_id'])
        session_name = request.form['session_name'].strip()
        date_obj = datetime.strptime(request.form['date'], '%Y-%m-%d').date()
        duration_hours = float(request.form['duration_hours'])
    except (ValueError, TypeError) as e:
        return jsonify({"error": "Invalid data types or formats", "details": str(e)}), 400

    photo_file = request.files.get('photo')
    outcomes = request.form.get('outcomes', '').strip()

    # Fetch student and validate access
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if student.school_id != user.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    # File upload handling
    filename = None
    if photo_file:
        if allowed_file(photo_file.filename):
            filename = secure_filename(photo_file.filename)
            upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'session_photos')
            os.makedirs(upload_path, exist_ok=True)
            photo_path = os.path.join(upload_path, filename)
            photo_file.save(photo_path)
        else:
            return jsonify({"error": "Invalid file type"}), 400

    # Capture category + PE status
    category = student.category
    pe_flag = student.physical_education

    session = StudentSession(
        student_id=student.id,
        user_id=user_id,
        session_name=session_name,
        date=date_obj,
        duration_hours=duration_hours,
        photo=filename,
        outcomes=outcomes,
        category=category,
        physical_education=pe_flag
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({
        "message": "Session recorded",
        "session_id": session.id,
        "category": category.value,
        "physical_education": pe_flag
    }), 201


@student_sessions_bp.route('/list_sessions', methods=['GET'])
@jwt_required()
@session_role_required()
def list_sessions():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    grade = request.args.get('grade')
    category = request.args.get('category')
    pe_filter = request.args.get('pe')
    search = request.args.get('search', '').strip().lower()
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = StudentSession.query.join(Student).filter(
        Student.school_id == user.school_id,
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
   
@student_sessions_bp.route('/bulk_ upload', methods=['POST'])
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

    # Validate filters
    grade_filter = request.form.get('grade')
    category_filter = request.form.get('category')
    pe_filter = request.form.get('pe')


    # Load student map (filtered)
    student_query = Student.query.filter(Student.school_id == user.school_id, Student.deleted == False)
    if grade_filter:
        student_query = student_query.filter(Student.grade == grade_filter)
    if category_filter:
        from app.models import CategoryEnum
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

    # Extract CSV
    ext = file.filename.rsplit('.', 1)[1].lower()
    if ext == 'csv':
        df = pd.read_csv(file)
    elif ext in ['xls', 'xlsx']:
        df = pd.read_excel(file)
    else:
        return jsonify({"error": "Unsupported file format. Use CSV or Excel."}), 400

    # Load ZIP photos if provided
    photo_files = {}
    if photo_zip:
        zip_data = zipfile.ZipFile(BytesIO(photo_zip.read()))
        for name in zip_data.namelist():
            photo_files[name] = zip_data.read(name)

    created_sessions = []

    for idx, row in df.iterrows():
        student_id = row.get('student_id')
        if student_id not in student_map:
            continue

        try:
            date_obj = datetime.strptime(str(row['date']), '%Y-%m-%d').date()
            duration = float(row['duration_hours'])
        except Exception as e:
            continue  # Skip malformed rows

        photo_filename = row.get('photo_filename')
        saved_photo = None

        if photo_filename and photo_filename in photo_files:
            secure_name = secure_filename(photo_filename)
            photo_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'session_photos')
            os.makedirs(photo_path, exist_ok=True)
            with open(os.path.join(photo_path, secure_name), 'wb') as f:
                f.write(photo_files[photo_filename])
            saved_photo = secure_name

        session = StudentSession(
            student_id=student_id,
            user_id=user.id,
            session_name=row.get('session_name', '').strip(),
            date=date_obj,
            duration_hours=duration,
            outcomes=row.get('outcomes'),
            photo=saved_photo
        )
        db.session.add(session)
        created_sessions.append(session)

    db.session.commit()

    return jsonify({
        "message": f"{len(created_sessions)} sessions created successfully."
    }), 201
