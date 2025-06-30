from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Worker, Student, User, db
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search
from sqlalchemy import or_

workers_bp = Blueprint('workers', __name__)

# Combined data filter for students and workers based on selected sites and type
@workers_bp.route('/filter', methods=['GET'])
@jwt_required()
def filter_people():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({'error': 'User not found'}), 404

    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 10))
    search_term = request.args.get('search')
    site_ids = request.args.getlist('site_id')  # Accepts multiple site IDs
    data_types = request.args.getlist('type')   # ['students', 'workers'] or both

    results = {}

    if 'workers' in data_types:
        worker_query = Worker.query
        if site_ids:
            worker_query = worker_query.filter(Worker.school_id.in_(site_ids))
        worker_query = worker_query.filter(Worker.role_id != 1)  # exclude superuser
        paginated_workers = apply_pagination_and_search(worker_query, Worker, search_term, ['name'], page, per_page)
        results['workers'] = [{
            'id': w.id,
            'name': w.name,
            'role_id': w.role_id,
            'school_id': w.school_id,
            'photo': w.photo,
            'cv_pdf': w.cv_pdf,
            'clearance_pdf': w.clearance_pdf,
            'child_protection_pdf': w.child_protection_pdf
        } for w in paginated_workers.items]
        results['workers_meta'] = {
            'total': paginated_workers.total,
            'page': paginated_workers.page,
            'pages': paginated_workers.pages
        }

    if 'students' in data_types:
        student_query = Student.query
        if site_ids:
            student_query = student_query.filter(Student.school_id.in_(site_ids))
        paginated_students = apply_pagination_and_search(student_query, Student, search_term, ['full_name'], page, per_page)
        results['students'] = [{
            'id': s.id,
            'full_name': s.full_name,
            'grade': s.grade,
            'school_id': s.school_id,
            'photo': s.photo,
            'parent_permission_pdf': s.parent_permission_pdf
        } for s in paginated_students.items]
        results['students_meta'] = {
            'total': paginated_students.total,
            'page': paginated_students.page,
            'pages': paginated_students.pages
        }

    return jsonify(results), 200

# List all workers - paginated, search, current user's site only
@workers_bp.route('/', methods=['GET'])
@jwt_required()
def list_workers():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({'error': 'User not found'}), 404

    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 10))
    search_term = request.args.get('search')

    query = Worker.query.filter(
        Worker.school_id == user.school_id,
        Worker.role_id != 1  # Exclude superuser
    )

    paginated = apply_pagination_and_search(query, Worker, search_term, ['name'], page, per_page)

    return jsonify({
        'workers': [{
            'id': w.id,
            'name': w.name,
            'school_id': w.school_id,
            'role_id': w.role_id,
            'photo': w.photo,
            'cv_pdf': w.cv_pdf,
            'clearance_pdf': w.clearance_pdf,
            'child_protection_pdf': w.child_protection_pdf
        } for w in paginated.items],
        'total': paginated.total,
        'page': paginated.page,
        'pages': paginated.pages
    }), 200

# Create a new worker - superuser and admin only
@workers_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required("superuser", "admin")
def create_worker():
    data = request.get_json()
    name = data.get("name")
    role_id = data.get("role_id")
    school_id = data.get("school_id")

    if not all([name, role_id, school_id]):
        return jsonify({"error": "Missing fields"}), 400

    new_worker = Worker(name=name, role_id=role_id, school_id=school_id)
    db.session.add(new_worker)
    db.session.commit()
    return jsonify({"message": "Worker created"}), 201

# Delete a worker by ID - superuser and admin only
@workers_bp.route('/<int:worker_id>', methods=['DELETE'])
@jwt_required()
@role_required("superuser", "admin")
def delete_worker(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    db.session.delete(worker)
    db.session.commit()
    return jsonify({"message": "Worker deleted"}), 200
