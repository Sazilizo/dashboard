from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Meal, Student, User, MealDistribution
from app.extensions import db
from sqlalchemy import func
from datetime import datetime
from utils.decorators import role_required
from utils.access_control import get_allowed_site_ids
from flask_cors import cross_origin
from utils.maintenance import maintenance_guard


meal_stats_bp = Blueprint('meal_stats', __name__)

@meal_stats_bp.route('/daily', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def daily_stats():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Missing required ?date=YYYY-MM-DD"}), 400

    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    # Handle multiple site IDs
    site_param = request.args.get("site_id")
    try:
        requested_site_ids = [int(s.strip()) for s in site_param.split(",")] if site_param else []
        allowed_site_ids = get_allowed_site_ids(user, requested_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    # 🔍 Filter by allowed school_ids
    stats = db.session.query(
        Meal.type.label("meal_type"),
        func.count(MealDistribution.id).label("count")
    ).join(Student).filter(
        Student.school_id.in_(allowed_site_ids),
        MealDistribution.date == date_obj
    ).group_by(Meal.type).all()

    result = {row.meal_type or "unspecified": row.count for row in stats}
    return jsonify(result), 200

@meal_stats_bp.route('/monthly', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def monthly_stats():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    site_param = request.args.get("site_id")

    # Validate required params
    if not year or not month:
        return jsonify({"error": "Provide year and month (e.g. ?year=2025&month=7)"}), 400

    # Parse and validate date range
    try:
        start_date = datetime(year, month, 1).date()
        end_month = month % 12 + 1
        end_year = year + (month // 12)
        end_date = datetime(end_year, end_month, 1).date()
    except Exception as e:
        return jsonify({"error": f"Invalid year/month: {e}"}), 400

    # Parse and validate site access
    try:
        requested_site_ids = [int(s.strip()) for s in site_param.split(",")] if site_param else []
        allowed_site_ids = get_allowed_site_ids(user, requested_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    # Query stats across all allowed sites
    stats = db.session.query(
        MealDistribution.date,
        Meal.type.label("meal_type"),
        func.count(MealDistribution.id).label("count")
    ).join(Meal).join(Student).filter(
        Student.school_id.in_(allowed_site_ids),
        MealDistribution.date >= start_date,
        MealDistribution.date < end_date
    ).group_by(MealDistribution.date, Meal.type).order_by(MealDistribution.date).all()

    # Group results by date → meal_type → count
    result = {}
    for row in stats:
        date = row.date.isoformat()
        if date not in result:
            result[date] = {}
        result[date][row.meal_type or "unspecified"] = row.count

    return jsonify(result), 200

@meal_stats_bp.route('/student/<int:student_id>', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
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


@meal_stats_bp.route('/type/breakdown', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def type_breakdown():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Parse site IDs
    site_param = request.args.get("site_id")
    try:
        requested_site_ids = [int(s.strip()) for s in site_param.split(",")] if site_param else []
        allowed_site_ids = get_allowed_site_ids(user, requested_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    student_id = request.args.get('student_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = db.session.query(
        Meal.type.label('meal_type'),
        func.count(MealDistribution.id).label('count')
    ).join(Meal).join(Student)

    # Filter by allowed schools
    query = query.filter(Student.school_id.in_(allowed_site_ids))

    if student_id:
        query = query.filter(Student.id == student_id)

    if start_date:
        try:
            query = query.filter(MealDistribution.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        except ValueError:
            return jsonify({"error": "Invalid start_date"}), 400

    if end_date:
        try:
            query = query.filter(MealDistribution.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        except ValueError:
            return jsonify({"error": "Invalid end_date"}), 400

    results = query.group_by(Meal.type).all()

    breakdown = {row.meal_type or "unspecified": row.count for row in results}
    return jsonify(breakdown), 200
