from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, Meal, MealDistribution, Student, User, School
from app.extensions import db, jwt, limiter
from utils.decorators import role_required
import os
from werkzeug.utils import secure_filename
from datetime import datetime

meals_bp = Blueprint('meals', __name__)

UPLOAD_FOLDER = 'uploads/meal_photos'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@meals_bp.route('/create-meal', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
@role_required('admin', 'superuser', 'head_coach', 'head_tutor')
def create_meal():
    data = request.form
    name = data.get('name')
    has_fruit = data.get('has_fruit', 'false').lower() in ['true', '1', 'yes']
    fruit_type = data.get('fruit_type')
    other_description = data.get('other_description')
    ingredients = data.get('ingredients')

    file = request.files.get('photo')
    photo_filename = None

    if file and allowed_file(file.filename):
        photo_filename = secure_filename(file.filename)
        upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], UPLOAD_FOLDER)
        os.makedirs(upload_path, exist_ok=True)
        file.save(os.path.join(upload_path, photo_filename))

    meal = Meal(
        name=name,
        has_fruit=has_fruit,
        fruit_type=fruit_type,
        other_description=other_description,
        ingredients=ingredients,
        photo=photo_filename
    )
    db.session.add(meal)
    db.session.commit()
    return jsonify({"message": "Meal created", "meal_id": meal.id}), 201

@limiter.limit("10 per minute")
@meals_bp.route('/record-meal', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser', 'head_coach', 'head_tutor')
def record_meal():
    data = request.get_json()
    student_id = data.get('student_id')
    meal_id = data.get('meal_id')

    student = Student.query.get(student_id)
    meal = Meal.query.get(meal_id)
    user = User.query.get(get_jwt_identity())

    if not student or not meal or not user:
        return jsonify({"error": "Missing or invalid student, meal, or user"}), 400

    if student.school_id != user.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    distribution = MealDistribution(
        student_id=student_id,
        meal_id=meal_id,
        school_id=student.school_id,
        distributed_by=user.id
    )
    db.session.add(distribution)
    db.session.commit()
    return jsonify({"message": "Meal distribution recorded"}), 201
