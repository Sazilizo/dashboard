from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import Worker, TrainingRecord
from app.extensions import db
from werkzeug.utils import secure_filename
from datetime import datetime
import os
from flask_cors import cross_origin
from utils.maintenance import maintenance_guard

worker_trainings_bp = Blueprint('workertrainings', __name__)
UPLOAD_FOLDER = 'uploads/trainings'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def save_training_photo(file, prefix="training"):
    if file:
        filename = secure_filename(f"{prefix}_{file.filename}")
        path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(path)
        return path
    return None

@worker_trainings_bp.route('/record/<int:worker_id>/', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def add_training(worker_id):
    worker = Worker.query.get_or_404(worker_id)

    title = request.form.get('title')
    date_str = request.form.get('date')
    photo = request.files.get('photo')
    training_description = request.form.get('training_description')
    training_outcomes = request.form.get('training_outcomes')
    venue = request.form.get('venue')
    accredited = request.form.get('training_outcomes')
    if not title or not date_str:
        return jsonify({"error": "Missing title or date"}), 400

    try:
        date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Invalid date format"}), 400

    photo_path = save_training_photo(photo, prefix=worker.name)

    training = TrainingRecord(
        worker_id=worker.id,
        title=title,
        date=date,
        photo=photo_path,
        training_description=training_description,
        training_outcomes = training_outcomes,
        venue = venue,
        accredited = accredited
    )
    db.session.add(training)
    db.session.commit()

    return jsonify({"message": "Training added"}), 201


@worker_trainings_bp.route('list/<int:worker_id>/', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def list_trainings(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    trainings = [{
        "id": t.id,
        "title": t.title,
        "date": t.date.isoformat(),
        "photo": t.photo,
        "training_description":t.training_description,
        "training_outcomes":t.training_outcomes,
        "venue":t.venue,
        "accredited":t.accredited
    } for t in worker.trainings]

    return jsonify({
        "worker_id": worker.id,
        "name": worker.name,
        "story": worker.story,
        "trainings": trainings
    }), 200
