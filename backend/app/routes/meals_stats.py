from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Meal, Student, User, db
from sqlalchemy import func
from datetime import datetime
from utils.decorators import role_required

meal_stats_bp = Blueprint('meal_stats', __name__)

@meal_stats_bp.route('/daily', methods=['GET'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def daily_stats():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Missing required ?date=YYYY-MM-DD"}), 400

    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    stats = db.session.query(
        Student.school_id,
        func.count(Meal.id).label('total_meals'),
        func.sum(Meal.sandwiches).label('total_sandwiches'),
        func.sum(func.cast(Meal.fruit, db.Integer)).label('fruit_given')
    ).join(Student).filter(Meal.date == date_obj).group_by(Student.school_id).all()

    result = [
        {
            "school_id": row.school_id,
            "total_meals": row.total_meals,
            "total_sandwiches": row.total_sandwiches,
            "fruit_given": row.fruit_given
        } for row in stats
    ]
    return jsonify(result), 200

@meal_stats_bp.route('/monthly', methods=['GET'])
@jwt_required()
def monthly_stats():
    school_id = request.args.get('school_id')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)

    if not school_id or not year or not month:
        return jsonify({"error": "Provide school_id, year, and month"}), 400

    try:
        start_date = datetime(year, month, 1).date()
        if month == 12:
            end_date = datetime(year + 1, 1, 1).date()
        else:
            end_date = datetime(year, month + 1, 1).date()
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    stats = db.session.query(
        Meal.date,
        func.count(Meal.id).label('meals_given'),
        func.sum(Meal.sandwiches).label('sandwiches_given'),
        func.sum(func.cast(Meal.fruit, db.Integer)).label('fruit_given')
    ).join(Student).filter(
        Student.school_id == int(school_id),
        Meal.date >= start_date,
        Meal.date < end_date
    ).group_by(Meal.date).order_by(Meal.date).all()

    return jsonify([
        {
            "date": row.date.isoformat(),
            "meals_given": row.meals_given,
            "sandwiches_given": row.sandwiches_given,
            "fruit_given": row.fruit_given
        } for row in stats
    ]), 200

@meal_stats_bp.route('/student/<int:student_id>', methods=['GET'])
@jwt_required()
def student_meal_stats(student_id):
    student = Student.query.get_or_404(student_id)

    meals = Meal.query.filter_by(student_id=student_id).order_by(Meal.date.desc()).all()

    return jsonify([
        {
            "date": meal.date.isoformat(),
            "sandwiches": meal.sandwiches,
            "fruit": meal.fruit,
            "fruit_type": meal.fruit_type,
            "other": meal.other,
            "photo": meal.photo
        } for meal in meals
    ]), 200

@meal_stats_bp.route('/school/<int:school_id>', methods=['GET'])
@jwt_required()
def school_meal_aggregate(school_id):
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = db.session.query(
        func.count(Meal.id).label('meals_given'),
        func.sum(Meal.sandwiches).label('sandwiches_given'),
        func.sum(func.cast(Meal.fruit, db.Integer)).label('fruit_given')
    ).join(Student).filter(Student.school_id == school_id)

    if start_date:
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(Meal.date >= start)
        except ValueError:
            return jsonify({"error": "Invalid start_date"}), 400

    if end_date:
        try:
            end = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(Meal.date <= end)
        except ValueError:
            return jsonify({"error": "Invalid end_date"}), 400

    result = query.first()
    return jsonify({
        "meals_given": result.meals_given or 0,
        "sandwiches_given": result.sandwiches_given or 0,
        "fruit_given": result.fruit_given or 0
    }), 200
