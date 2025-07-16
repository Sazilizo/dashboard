from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import  Student, Worker, User
from app.extensions import db
from utils.decorators import role_required
from flask_cors import cross_origin

upload_bp = Blueprint('uploads', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_file(file, folder):
    filename = secure_filename(file.filename)
    upload_folder = os.path.join(current_app.config.get('UPLOAD_FOLDER', 'static/uploads'), folder)
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, filename)
    file.save(filepath)
    return filepath.replace('\\', '/')  # normalize path for JSON

@upload_bp.route('/student/photo/<int:student_id>', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def upload_student_photo(student_id):
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())
    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    if 'photo' not in request.files:
        return jsonify({"error": "No photo part in request"}), 400

    file = request.files['photo']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if file and allowed_file(file.filename):
        filepath = save_file(file, 'students')
        student.photo = filepath
        db.session.commit()
        return jsonify({"message": "Student photo uploaded", "photo": filepath}), 200

    return jsonify({"error": "Invalid file type"}), 400

@upload_bp.route('/worker/files/<int:worker_id>', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
@role_required('admin', 'superuser')
def upload_worker_files(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    if user.school_id != worker.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    updated_files = []
    for file_key in ['cv_pdf', 'clearance_pdf', 'child_protection_pdf', 'photo']:
        file = request.files.get(file_key)
        if file and allowed_file(file.filename):
            filepath = save_file(file, 'workers')
            setattr(worker, file_key, filepath)
            updated_files.append(file_key)

    if not updated_files:
        return jsonify({"error": "No valid files uploaded"}), 400

    db.session.commit()
    return jsonify({"message": "Files uploaded", "updated_files": updated_files}), 200
