from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import os
from app.models import db, Student, Worker

upload_bp = Blueprint('uploads', __name__)

UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Upload a student photo and create student
@upload_bp.route('/upload/students', methods=['POST'])
def upload_student_photo():
    file = request.files['photo']
    full_name = request.form['full_name']
    grade = request.form['grade']
    school_id = request.form['school_id']

    filename = secure_filename(file.filename)
    folder = os.path.join(UPLOAD_FOLDER, 'students')
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, filename)
    file.save(file_path)

    student = Student(
        full_name=full_name,
        grade=grade,
        school_id=school_id,
        photo=file_path
    )
    db.session.add(student)
    db.session.commit()
    return jsonify({"message": "Student added with photo"}), 201

# Upload a worker photo and create worker
@upload_bp.route('/upload/workers', methods=['POST'])
def upload_worker_photo():
    file = request.files['photo']
    name = request.form['name']
    role_id = request.form['role_id']
    school_id = request.form['school_id']

    filename = secure_filename(file.filename)
    folder = os.path.join(UPLOAD_FOLDER, 'workers')
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, filename)
    file.save(file_path)

    worker = Worker(
        name=name,
        role_id=role_id,
        school_id=school_id,
        photo=file_path
    )
    db.session.add(worker)
    db.session.commit()
    return jsonify({"message": "Worker added with photo"}), 201

# Upload worker PDFs (CV, clearance, child protection)
@upload_bp.route('/upload/workers/<int:worker_id>/documents', methods=['POST'])
def upload_worker_documents(worker_id):
    worker = Worker.query.get(worker_id)
    if not worker:
        return jsonify({"error": "Worker not found"}), 404

    folder = os.path.join(UPLOAD_FOLDER, 'workers')
    os.makedirs(folder, exist_ok=True)

    for doc_field in ['cv_pdf', 'clearance_pdf', 'child_protection_pdf']:
        file = request.files.get(doc_field)
        if file and allowed_file(file.filename):
            filename = secure_filename(f"{worker_id}_{doc_field}_{file.filename}")
            file_path = os.path.join(folder, filename)
            file.save(file_path)
            setattr(worker, doc_field, file_path)

    db.session.commit()
    return jsonify({"message": "Documents uploaded successfully."}), 200
