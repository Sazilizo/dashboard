from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Worker, TrainingRecord, User
from app.extensions import db
from werkzeug.utils import secure_filename
from datetime import datetime
import os
from flask_cors import cross_origin
from utils.maintenance import maintenance_guard
from utils.formSchema import generate_schema_from_model

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

@worker_trainings_bp.route("/form_schema", methods=["GET"])
@jwt_required()
def form_schema():
    model_name = request.args.get("model")

    MODEL_MAP = {
        "TrainingRecord": TrainingRecord,
        "Worker": Worker,
        "User": User,
        # Add others only if you want to support them from this blueprint
    }

    model_class = MODEL_MAP.get(model_name)
    if not model_class:
        return jsonify({"error": f"Model '{model_name}' is not supported in this route."}), 400

    current_user = User.query.get(get_jwt_identity())
    schema = generate_schema_from_model(model_class, model_name, current_user=current_user)
    return jsonify(schema)

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
