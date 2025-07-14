from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Meal, MealDistribution, Student, User, School
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
    # other_description = data.get('other_description')
    ingredients = data.get('ingredients')


    meal = Meal(
        name=name,
        has_fruit=has_fruit,
        # other_description=other_description,
        ingredients=ingredients,
    )
    db.session.add(meal)
    db.session.commit()
    return jsonify({"message": "Meal created", "meal_id": meal.id}), 201

@limiter.limit("10 per minute")
@meals_bp.route('/record-meal', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser', 'head_coach', 'head_tutor')
def record_meal():
    try:
        data = request.form
        student_id = int(data.get('student_id'))
        meal_id = int(data.get('meal_id'))
        date_str = data.get("date")
        quantity=int(data.get("quantity"))
        is_fruit = data.get('is_fruit', 'false').lower() in ['true', '1', 'yes']
        fruit_type = data.get('fruit_type') or None
        fruit_other_description = data.get('fruit_other_description') or None
        user_id= get_jwt_identity()
        user = User.query.get(user_id)
        student = Student.query.get(student_id)
        meal = Meal.query.get(meal_id)

        date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else datetime.utcnow().date()

        file = request.files.get('photo')
        photo_filename = None

        if file and allowed_file(file.filename):
            photo_filename = secure_filename(file.filename)
            upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], UPLOAD_FOLDER)
            os.makedirs(upload_path, exist_ok=True)
            file.save(os.path.join(upload_path, photo_filename))

        if not all([user, student, meal]):
            return jsonify({"error": "Invalid or missing student, meal, or user"}), 400

        if student.school_id != user.school_id:
            return jsonify({"error": "Access forbidden: school mismatch"}), 403

        distribution = MealDistribution(
            date=date,
            student_id=student_id,
            meal_id=meal_id,
            school_id=student.school_id,
            quantity=quantity,
            is_fruit=is_fruit,
            fruit_type=fruit_type,
            fruit_other_description=fruit_other_description,
            recorded_by=user.id,
            photo=photo_filename
        )
        db.session.add(distribution)
        db.session.commit()
        return jsonify({
            "message": "Meal distribution recorded",
            "distribution_id":distribution.id
        }), 201
    
    except ValueError as ve:
        return jsonify({"error": "Invalid input types", "details": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": "Server error", "details": str(e)}), 500