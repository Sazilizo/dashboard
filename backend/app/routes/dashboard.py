from flask import Blueprint, request, jsonify
from app.models import School, Student, Worker, Role
from app.extensions import db

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/api/dashboard/summary')
def summary():
    site_id = request.args.get('site_id')
    
    base_student_query = Student.query
    base_worker_query = Worker.query.join(Role) 

    if site_id and site_id != "all":
        base_student_query = base_student_query.filter_by(school_id=site_id)
        base_worker_query = base_worker_query.filter(Worker.school_id == site_id)

    return jsonify({
        "totalStudents": base_student_query.count(),
        "totalTutors": base_worker_query.filter(Role.name == "tutor").count(),
        "totalCoaches": base_worker_query.filter(Role.name == "coach").count(),
        "totalCleaners": base_worker_query.filter(Role.name == "cleaner").count(),
        "totalWorkers": base_worker_query.count(),
    })
