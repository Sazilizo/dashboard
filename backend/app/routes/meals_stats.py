from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Meal, Student, User, MealDistribution
from app.extensions import db
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
        Meal.type.label("meal_type"),
        func.count(MealDistribution.id).label("count")
    ).join(Student).filter(MealDistribution.date == date_obj).group_by(Meal.type).all()

    result = {row.meal_type or "unspecified": row.count for row in stats}
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
        end_date = datetime(year + (month // 12), (month % 12) + 1, 1).date()
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    stats = db.session.query(
        MealDistribution.date,
        Meal.type.label("meal_label"),
        func.count(MealDistribution.id).label("count")
    ).join(Meal).join(Student).filter(
        Student.school_id == int(school_id),
        MealDistribution.date >= start_date,
        MealDistribution.date < end_date
    ).group_by(MealDistribution.date, Meal.type).order_by(MealDistribution.date).all()

    result = {}

    for row in stats:
        date = row.date.isoformat()
        if date not in result:
            result[date] = {}
        result[date][row.meal_type or "unspecified"] = row.count

    return jsonify(result), 200

@meal_stats_bp.route('/student/<int:student_id>', methods=['GET'])
@jwt_required()
def student_meal_stats(student_id):
    student = Student.query.get_or_404(student_id)

    meal_distributions = db.session.query(
        MealDistribution.date,
        Meal.type.label("meal_type"),
        MealDistribution.photo
    ).join(Meal).filter(MealDistribution.student_id == student.id).order_by(MealDistribution.date.desc()).all()

    return jsonify([
        {
            "date": row.date.isoformat(),
            "meal_type": row.meal_type,
            "photo": row.photo
        } for row in meal_distributions
    ]), 200

@meal_stats_bp.route('/school/<int:school_id>', methods=['GET'])
@jwt_required()
def school_meal_aggregate(school_id):
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = db.session.query(
        func.count(MealDistribution.id).label('meals_given'),
        func.sum(MealDistribution.sandwiches).label('sandwiches_given'),
        func.sum(func.cast(MealDistribution.fruit, db.Integer)).label('fruit_given')
    ).join(Student).filter(Student.school_id == school_id)

    if start_date:
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(MealDistribution.date >= start)
        except ValueError:
            return jsonify({"error": "Invalid start_date"}), 400

    if end_date:
        try:
            end = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(MealDistribution.date <= end)
        except ValueError:
            return jsonify({"error": "Invalid end_date"}), 400

    result = query.first()
    return jsonify({
        "meals_given": result.meals_given or 0,
        "sandwiches_given": result.sandwiches_given or 0,
        "fruit_given": result.fruit_given or 0
    }), 200

@meal_stats_bp.route('/type-breakdown', methods=['GET'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def type_breakdown():
    school_id = request.args.get('school_id', type=int)
    student_id = request.args.get('student_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = db.session.query(
        Meal.type.label('meal_type'),
        func.count(MealDistribution.id).label('count')
    ).join(Meal).join(Student)

    # Filters
    if school_id:
        query = query.filter(Student.school_id == school_id)
    if student_id:
        query = query.filter(Student.id == student_id)
    if start_date:
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(MealDistribution.date >= start)
        except ValueError:
            return jsonify({"error": "Invalid start_date"}), 400
    if end_date:
        try:
            end = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(MealDistribution.date <= end)
        except ValueError:
            return jsonify({"error": "Invalid end_date"}), 400

    query = query.group_by(Meal.type)

    results = query.all()

    # Format output as type → count
    breakdown = {row.meal_type or "unspecified": row.count for row in results}
    return jsonify(breakdown), 200
