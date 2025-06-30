
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from app.models import db, Worker
import os

worker_bp = Blueprint('worker', __name__)

ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@worker_bp.route('/upload/<int:worker_id>', methods=['POST'])
def upload_worker_files(worker_id):
    worker = Worker.query.get(worker_id)
    if not worker:
        return jsonify({"error": "Worker not found"}), 404

    for file_key in ['cv_pdf', 'clearance_pdf', 'child_protection_pdf']:
        file = request.files.get(file_key)
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            upload_folder = current_app.config['UPLOAD_FOLDER']
            os.makedirs(upload_folder, exist_ok=True)
            filepath = os.path.join(upload_folder, filename)
            file.save(filepath)
            setattr(worker, file_key, filename)

    db.session.commit()
    return jsonify({"message": "Files uploaded successfully."})
