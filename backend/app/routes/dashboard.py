from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app.models import School, Student, Worker, Role, MealDistribution
from app.extensions import db
from utils.maintenance import maintenance_guard

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/summary')
@maintenance_guard()
def summary():
    site_ids = request.args.get('site_id')

    # Convert comma-separated list of site_ids into integers
    site_ids = [int(sid) for sid in site_ids.split(',')] if site_ids and site_ids != "all" else None

    # Base queries
    base_student_query = Student.query
    base_worker_query = Worker.query.join(Role)
    base_meal_query = MealDistribution.query
    base_school_query = School.query

    if site_ids:
        base_student_query = base_student_query.filter(Student.school_id.in_(site_ids))
        base_worker_query = base_worker_query.filter(Worker.school_id.in_(site_ids))
        base_meal_query = base_meal_query.filter(MealDistribution.school_id.in_(site_ids))
        base_school_query = base_school_query.filter(School.id.in_(site_ids))

    # Totals
    total_students = base_student_query.count()
    total_workers = base_worker_query.count()
    total_grades = (
        db.session.query(func.count(func.distinct(Student.grade)))
        .filter(Student.school_id.in_(site_ids)) if site_ids else
        db.session.query(func.count(func.distinct(Student.grade)))
    ).scalar()

    total_meals = base_meal_query.count()
    total_sites = base_school_query.count()

    # Count by role
    total_tutors = base_worker_query.filter(Role.name == "tutor").count()
    total_coaches = base_worker_query.filter(Role.name == "coach").count()
    total_cleaners = base_worker_query.filter(Role.name == "cleaner").count()

    # Students by category
    category_counts = {
        str(category): count
        for category, count in base_student_query
        .with_entities(Student.category, func.count(Student.id))
        .group_by(Student.category)
        .all()
    }

    # Schools data for frontend filter checkboxes
    school_list = [
        {
            "id": school.id,
            "name": school.name,
            "address": school.address,
            "email": school.email,
            "contact_number": school.contact_number,
        }
        for school in base_school_query.order_by(School.name).all()
    ]

    return jsonify({
        "totalStudents": total_students,
        "totalWorkers": total_workers,
        "totalTutors": total_tutors,
        "totalCoaches": total_coaches,
        "totalCleaners": total_cleaners,
        "totalGrades": total_grades,
        "totalMeals": total_meals,
        "totalSites": total_sites,
        "studentsByCategory": category_counts,
        "sites": school_list
    })
