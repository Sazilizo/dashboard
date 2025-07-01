from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Worker, User, db
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search

workers_bp = Blueprint('workers', __name__)

@workers_bp.route('/', methods=['GET'])
@jwt_required()
def list_workers():
    """
    List workers for the current user's school with pagination and search.
    Excludes soft-deleted workers.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    search_term = request.args.get('search', type=str)

    query = Worker.query.filter(
        Worker.school_id == user.school_id,
        Worker.role_id != 1,  # exclude superuser
        Worker.deleted == False
    )

    paginated = apply_pagination_and_search(query, Worker, search_term, ['name'], page, per_page)

    return jsonify({
        'workers': [{
            'id': w.id,
            'name': w.name,
            'role_id': w.role_id,
            'school_id': w.school_id,
            'photo': w.photo,
            'cv_pdf': w.cv_pdf,
            'clearance_pdf': w.clearance_pdf,
            'child_protection_pdf': w.child_protection_pdf
        } for w in paginated.items],
        'total': paginated.total,
        'page': paginated.page,
        'pages': paginated.pages
    }), 200


@workers_bp.route('/deleted', methods=['GET'])
@jwt_required()
@role_required('admin', 'superuser')
def list_deleted_workers():
    """
    List soft-deleted workers.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    workers = Worker.query.filter_by(school_id=user.school_id, deleted=True).all()

    return jsonify([{
        'id': w.id,
        'name': w.name,
        'role_id': w.role_id,
        'school_id': w.school_id,
        'photo': w.photo,
        'cv_pdf': w.cv_pdf,
        'clearance_pdf': w.clearance_pdf,
        'child_protection_pdf': w.child_protection_pdf
    } for w in workers]), 200


@workers_bp.route('/<int:worker_id>/restore', methods=['POST'])
@jwt_required()
@role_required('admin', 'superuser')
def restore_worker(worker_id):
    """
    Restore a soft-deleted worker.
    """
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    if not user or worker.school_id != user.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    if not worker.deleted:
        return jsonify({"message": "Worker is already active"}), 400

    worker.deleted = False
    worker.deleted_at = None
    db.session.commit()
    return jsonify({"message": "Worker restored successfully"}), 200


@workers_bp.route('/<int:worker_id>', methods=['DELETE'])
@jwt_required()
@role_required('superuser', 'admin')
def delete_worker(worker_id):
    """
    Soft delete a worker by ID. Only superuser and admin can delete.
    """
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.school_id != worker.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    worker.soft_delete()
    db.session.commit()

    return jsonify({"message": "Worker soft-deleted successfully"}), 200


@workers_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required('superuser', 'admin')
def create_worker():
    """
    Create a new worker. Only accessible by superuser and admin.
    Expects JSON with name, role_id, and school_id.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

    name = data.get('name')
    role_id = data.get('role_id')
    school_id = data.get('school_id')

    missing = [field for field in ('name', 'role_id', 'school_id') if not data.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    try:
        role_id = int(role_id)
        school_id = int(school_id)
    except ValueError:
        return jsonify({"error": "role_id and school_id must be integers"}), 400

    worker = Worker(name=name.strip(), role_id=role_id, school_id=school_id)
    db.session.add(worker)
    db.session.commit()

    return jsonify({
        "message": "Worker created successfully",
        "worker": {
            "id": worker.id,
            "name": worker.name,
            "role_id": worker.role_id,
            "school_id": worker.school_id
        }
    }), 201
