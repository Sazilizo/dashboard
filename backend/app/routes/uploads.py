import os
import uuid
import magic
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app.models import Student, Worker, User
from app.extensions import db
from utils.decorators import role_required
from flask_cors import cross_origin

upload_bp = Blueprint('uploads', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
ALLOWED_MIME_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'application/pdf'
}

def allowed_file(file):
    filename_ok = '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    mime = magic.from_buffer(file.read(2048), mime=True)
    file.seek(0)
    return filename_ok and mime in ALLOWED_MIME_TYPES

def save_file(file, folder, old_path=None):
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{filename}"
    upload_folder = os.path.join(current_app.config.get('UPLOAD_FOLDER', 'static/uploads'), folder)
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, unique_filename)
    file.save(filepath)

    # Optionally delete the old file
    if old_path and os.path.exists(old_path) and old_path.startswith(upload_folder):
        try:
            os.remove(old_path)
        except Exception:
            pass  # silently ignore errors

    return filepath.replace('\\', '/')  # for frontend/browser

def serve_file(path):
    directory, filename = os.path.split(path)
    return send_from_directory(directory, filename)
@upload_bp.route('/student/files/<int:student_id>', methods=['POST'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def upload_student_files(student_id):
    student = Student.query.get_or_404(student_id)
    user = User.query.get(get_jwt_identity())

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    file_fields = ['photo', 'parent_permission_pdf']
    updated_files = {}

    for file_key in file_fields:
        file = request.files.get(file_key)
        if file and allowed_file(file):
            old_path = getattr(student, file_key, None)
            new_path = save_file(file, 'students', old_path)
            setattr(student, file_key, new_path)
            updated_files[file_key] = new_path

    if not updated_files:
        return jsonify({"error": "No valid files uploaded"}), 400

    db.session.commit()
    return jsonify({
        "message": "Student files uploaded successfully",
        "updated_files": updated_files
    }), 200

@upload_bp.route('/worker/files/<int:worker_id>', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser')
def upload_worker_files(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())

    if user.school_id != worker.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    file_fields = ['cv_pdf', 'clearance_pdf', 'child_protection_pdf', 'photo']
    updated_files = {}

    for file_key in file_fields:
        file = request.files.get(file_key)
        if file and allowed_file(file):
            old_path = getattr(worker, file_key, None)
            new_path = save_file(file, 'workers', old_path)
            setattr(worker, file_key, new_path)
            updated_files[file_key] = new_path

    if not updated_files:
        return jsonify({"error": "No valid files uploaded"}), 400

    db.session.commit()
    return jsonify({
        "message": "Files uploaded successfully",
        "updated_files": updated_files
    }), 200
