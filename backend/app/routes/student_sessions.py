from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import StudentSession, Student, User, db
from utils.decorators import role_required
from datetime import datetime
import os
from werkzeug.utils import secure_filename

student_sessions_bp = Blueprint('student_sessions', __name__)


ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@student_sessions_bp.route('/', methods=['POST'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def create_session():
    # Use form-data: fields + file upload
    if 'student_id' not in request.form or \
       'session_name' not in request.form or \
       'date' not in request.form or \
       'duration_hours' not in request.form:
        return jsonify({"error": "Missing required form fields"}), 400

    student_id = request.form.get('student_id')
    session_name = request.form.get('session_name').strip()
    date_str = request.form.get('date')
    duration_hours = request.form.get('duration_hours')
    photo_file = request.files.get('photo')  # file is optional
    outcomes = request.form.get('outcomes')

    try:
        student_id = int(student_id)
        duration_hours = float(duration_hours)
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError) as e:
        return jsonify({"error": "Invalid data types or formats", "details": str(e)}), 400

    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    filename = None
    if photo_file and allowed_file(photo_file.filename):
        filename = secure_filename(photo_file.filename)
        upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'session_photos')
        os.makedirs(upload_path, exist_ok=True)
        photo_file.save(os.path.join(upload_path, filename))
    elif photo_file:
        return jsonify({"error": "Invalid file type"}), 400

    session = StudentSession(
        student_id=student_id,
        user_id=user_id,
        session_name=session_name,
        date=date_obj,
        duration_hours=duration_hours,
        photo=filename,
        outcomes=outcomes
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({"message": "Session recorded", "session_id": session.id}), 201


@student_sessions_bp.route('/', methods=['GET'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def list_sessions():
    student_id = request.args.get('student_id', type=int)
    if not student_id:
        return jsonify({"error": "student_id query parameter is required"}), 400

    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    sessions = StudentSession.query.filter_by(student_id=student_id).order_by(StudentSession.date.desc()).all()
    result = []
    for s in sessions:
        result.append({
            "id": s.id,
            "session_name": s.session_name,
            "date": s.date.isoformat(),
            "duration_hours": s.duration_hours,
            "photo": s.photo,
            "outcomes": s.outcomes,
            "logged_by": s.user.username,
            "created_at": s.created_at.isoformat()
        })

    return jsonify(result), 200

@student_sessions_bp.route('/total_hours/<int:student_id>', methods=['GET'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def total_hours(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    total = db.session.query(db.func.sum(StudentSession.duration_hours)).filter_by(student_id=student_id).scalar() or 0

    return jsonify({"student_id": student_id, "total_hours": total}), 200
