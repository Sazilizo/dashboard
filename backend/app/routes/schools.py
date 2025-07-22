from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.decorators import role_required, session_role_required
from app.models import School, Student, Worker, MealDistribution, User
from app.extensions import db

schools_bp = Blueprint('schools', __name__)

@schools_bp.route('/summary', methods=['GET'])
@jwt_required()
@session_role_required()
@role_required('admin', 'superuser', 'head_tutor', 'head_coach')
def schools_summary():
    school_ids = request.args.getlist('school_id')
    include_details = request.args.get('include_details', 'false').lower() == 'true'
    
    if school_ids:
        school_ids = [int(sid) for sid in school_ids]
        schools = School.query.filter(School.id.in_(school_ids)).all()
    else:
        schools = School.query.all()

    result = []
    for school in schools:
        students = school.students
        workers = school.workers
        meals = school.meals_given
        users = school.users
        school_data = {
            "id": school.id,
            "name": school.name,
            "address": school.address,
            "contact_number": school.contact_number,
            "email": school.email,
            "stats": {
                "student_count": len(students),
                "worker_count": len(workers),
                "meal_count": len(meals),
                "user_count": len(users)
            }
        }
        if include_details:
            school_data["students"] = [s.id for s in students]
            school_data["workers"] = [w.id for w in workers]
            school_data["meals"] = [m.id for m in meals]
            school_data["users"] = [u.id for u in users]
        result.append(school_data)
    return jsonify(result)
