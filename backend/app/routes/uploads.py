# app/routes/upload.py

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
import os
from app.models import db, Student, Worker

upload_bp = Blueprint('uploads', __name__)

UPLOAD_FOLDER = 'static/uploads'

@upload_bp.route('/upload/students', methods=['POST'])
def upload_student_photo():
    file = request.files['photo']
    full_name = request.form['full_name']
    grade = request.form['grade']
    school_id = request.form['school_id']

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, 'students', filename)
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

@upload_bp.route('/upload/workers', methods=['POST'])
def upload_worker_photo():
    file = request.files['photo']
    name = request.form['name']
    role = request.form['role']
    school_id = request.form['school_id']

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, 'workers', filename)
    file.save(file_path)

    worker = Worker(
        name=name,
        role=role,
        school_id=school_id,
        photo=file_path
    )
    db.session.add(worker)
    db.session.commit()
    return jsonify({"message": "Worker added with photo"}),201