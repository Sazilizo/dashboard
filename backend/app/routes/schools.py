from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.decorators import role_required, session_role_required
from app.models import School, Student, Worker, MealDistribution, User, AcademicSession, PESession
from app.extensions import db

schools_bp = Blueprint('schools', __name__)

@schools_bp.route('/summary', methods=['GET'])
@jwt_required()
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
            school_data["students"] = [
                {
                    "id": s.id,
                    "full_name": s.full_name,
                    "grade": s.grade,
                    "category": s.category.value if s.category else None,
                    "academic_session_count": AcademicSession.query.filter_by(student_id=s.id).count(),
                    "physical_session_count": PESession.query.filter_by(student_id=s.id).count() if PESession else None
                } for s in students
            ]

            school_data["workers"] = [
                {
                    "id": w.id,
                    "full_name": w.name + " " + w.last_name,
                    "role": w.role.name if w.role else None
                } for w in workers
            ]

            school_data["users"] = [
                {
                    "id": u.id,
                    "username": u.username,
                    "role": u.role.name if u.role else None
                } for u in users
            ]
            school_data["meals"] = [m.id for m in meals]
        result.append(school_data)
    return jsonify(result)
