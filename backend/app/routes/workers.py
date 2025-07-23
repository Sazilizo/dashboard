from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Worker, User, Role
from app.extensions import db
from utils.decorators import role_required
from utils.pagination import apply_pagination_and_search
from utils.access_control import get_allowed_site_ids
from utils.maintenance import maintenance_guard
from flask_cors import cross_origin
import os
import zipfile
from io import BytesIO
from werkzeug.utils import secure_filename
from datetime import datetime
from sqlalchemy import func
from utils.formSchema import generate_schema_from_model
from .uploads import allowed_file

workers_bp = Blueprint('workers', __name__)
UPLOAD_FOLDER = 'uploads/workers'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def save_file(file, prefix=""):
    if file:
        filename = secure_filename(f"{prefix}_{file.filename}")
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        return filepath
    return None

@workers_bp.route('/list', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def list_workers():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    search_term = request.args.get('search', type=str)
    raw_site_ids = request.args.getlist('school_id', type=int)
    role_ids = request.args.getlist('role_id', type=int)

    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    query = Worker.query.filter(
        Worker.deleted == False,
        Worker.school_id.in_(allowed_site_ids)
    )

    if role_ids:
        query = query.filter(Worker.role_id.in_(role_ids))

    paginated = apply_pagination_and_search(
        query,
        Worker,
        search_term,
        search_columns=["name", "last_name", "email"],
        page=page,
        per_page=per_page
    )

    return jsonify({
        "workers": [w.to_dict() for w in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages
    }), 200

@workers_bp.route("/form_schema", methods=["GET"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
def form_schema():
    schema = generate_schema_from_model(Worker, "Worker",)
    return jsonify(schema)

@workers_bp.route('/create', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')

def create_worker():
    name = request.form.get('name')
    last_name = request.form.get('last_name')
    role_id = request.form('role_id')
    school_id_str = request.form.get('school_id')
    id_number = request.form.get('id_number')
    contact_number = request.form.get('contact_number')
    email = request.form.get('email')
    start_date_str = request.form.get('start_date')

    # Check required fields
    missing = [f for f in ('name', 'last_name', 'role_id', 'school_id') if not request.form.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    # Validate school_id
    try:
        school_id = int(school_id_str)
    except ValueError:
        return jsonify({"error": "school_id must be an integer"}), 400

    # Lookup role by name
    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Invalid role_id"}), 400

    # Validate start_date format
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date() if start_date_str else None
    except ValueError:
        return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

    # Check school access permissions
    user = User.query.get(get_jwt_identity())
    try:
        allowed_site_ids = get_allowed_site_ids(user, [school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    # Handle file uploads
    photo = save_file(request.files.get('photo'), prefix=name)
    cv_pdf = save_file(request.files.get('cv_pdf'), prefix=name)
    id_copy_pdf = save_file(request.files.get('id_copy_pdf'), prefix=name)
    clearance_pdf = save_file(request.files.get('clearance_pdf'), prefix=name)
    child_protection_pdf = save_file(request.files.get('child_protection_pdf'), prefix=name)

    # Create and save the Worker
    worker = Worker(
        name=name.strip(),
        last_name=last_name.strip(),
        role=role,
        school_id=school_id,
        id_number=id_number,
        contact_number=contact_number,
        email=email,
        start_date=start_date,
        photo=photo,
        cv_pdf=cv_pdf,
        id_copy_pdf=id_copy_pdf,
        clearance_pdf=clearance_pdf,
        child_protection_pdf=child_protection_pdf
    )

    db.session.add(worker)
    db.session.commit()

    return jsonify({
        "message": "Worker created successfully",
        "worker": {
            "id": worker.id,
            "name": worker.name,
            "last_name": worker.last_name,
            "role_id": worker.role_id,
            "school_id": worker.school_id,
            "email": worker.email,
            "start_date": worker.start_date.isoformat() if worker.start_date else None
        }
    }), 201


@workers_bp.route('/update/<int:worker_id>', methods=['PUT'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def update_worker(worker_id):
    worker = Worker.query.filter_by(id=worker_id, deleted=False).first_or_404()
    user = User.query.get(get_jwt_identity())

    try:
        allowed_site_ids = get_allowed_site_ids(user, [worker.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    if worker.school_id not in allowed_site_ids:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    data = request.form

    # Update simple fields if provided
    if 'name' in data:
        worker.name = data['name'].strip()
    if 'role_id' in data:
        try:
            role_id = int(data['role_id'])
            role = Role.query.get(role_id)
            if not role:
                return jsonify({"error": "Invalid role_id"}), 400
            worker.role_id = role_id
        except ValueError:
            return jsonify({"error": "role_id must be an integer"}), 400
    if 'school_id' in data:
        try:
            school_id = int(data['school_id'])
            # Check if user is allowed to update to this school
            allowed_site_ids = get_allowed_site_ids(user, [school_id])
            if school_id not in allowed_site_ids:
                return jsonify({"error": "Not authorized to assign this school_id"}), 403
            worker.school_id = school_id
        except ValueError:
            return jsonify({"error": "school_id must be an integer"}), 400
    if 'id_number' in data:
        worker.id_number = data['id_number'].strip()
    if 'contact_number' in data:
        worker.contact_number = data['contact_number'].strip()
    if 'email' in data:
        worker.email = data['email'].strip()
    if 'start_date' in data:
        try:
            worker.start_date = datetime.strptime(data['start_date'], "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

    # Update file uploads if provided
    photo = request.files.get('photo')
    cv_pdf = request.files.get('cv_pdf')
    id_copy_pdf = request.files.get('id_copy_pdf')
    clearance_pdf = request.files.get('clearance_pdf')
    child_protection_pdf = request.files.get('child_protection_pdf')

    if photo:
        photo_path = save_file(photo, prefix=worker.name)
        worker.photo = photo_path
    if cv_pdf:
        cv_path = save_file(cv_pdf, prefix=worker.name)
        worker.cv_pdf = cv_path
    if id_copy_pdf:
        id_copy_path = save_file(id_copy_pdf, prefix=worker.name)
        worker.id_copy_pdf = id_copy_path
    if clearance_pdf:
        clearance_path = save_file(clearance_pdf, prefix=worker.name)
        worker.clearance_pdf = clearance_path
    if child_protection_pdf:
        child_protection_path = save_file(child_protection_pdf, prefix=worker.name)
        worker.child_protection_pdf = child_protection_path

    db.session.commit()

    return jsonify({
        "message": "Worker updated successfully",
        "worker": worker.to_dict()
    }), 200



@workers_bp.route('/deleted', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('admin','hr', 'superuser')
def list_deleted_workers():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    raw_site_ids = request.args.getlist('school_id', type=int)
    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    query = Worker.query.filter(
        Worker.deleted == True,
        Worker.school_id.in_(allowed_site_ids)
    )

    return jsonify([
        w.to_dict() for w in query.all()
    ]), 200

@workers_bp.route('/restore/<int:worker_id>/', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('hr', 'superuser')
def restore_worker(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    try:
        allowed_site_ids = get_allowed_site_ids(user, [worker.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    if not worker.deleted:
        return jsonify({"message": "Worker is already active"}), 400

    worker.deleted = False
    worker.deleted_at = None
    db.session.commit()
    return jsonify({"message": "Worker restored successfully"}), 200

@workers_bp.route('/remove/<int:worker_id>', methods=['DELETE'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('hr')
def delete_worker(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    try:
        allowed_site_ids = get_allowed_site_ids(user, [worker.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    worker.soft_delete()
    db.session.commit()
    return jsonify({"message": "Worker soft-deleted successfully"}), 200

@workers_bp.route('/stats', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'admin', 'hr')
def worker_stats():
    user = User.query.get(get_jwt_identity())
    raw_site_ids = request.args.getlist('school_id', type=int)
    try:
        allowed_site_ids = get_allowed_site_ids(user, raw_site_ids)
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    query = db.session.query(
        Role.name.label('role'),
        func.count(Worker.id).label('count')
    ).join(Role).filter(
        Worker.deleted == False,
        Worker.school_id.in_(allowed_site_ids)
    ).group_by(Role.name)

    return jsonify({role: count for role, count in query.all()}), 200

@workers_bp.route('/download/<int:worker_id>/', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'admin', 'hr')
def download_worker_documents(worker_id):
    worker = Worker.query.get_or_404(worker_id)
    user = User.query.get(get_jwt_identity())
    try:
        allowed_site_ids = get_allowed_site_ids(user, [worker.school_id])
    except (ValueError, PermissionError) as e:
        return jsonify({"error": str(e)}), 403

    file_paths = {
        "photo": worker.photo,
        "cv_pdf": worker.cv_pdf,
        "clearance_pdf": worker.clearance_pdf,
        "child_protection_pdf": worker.child_protection_pdf,
        "id_copy_pdf": worker.id_copy_pdf,
    }

    for i, training in enumerate(worker.trainings):
        if training.photo:
            file_paths[f"training_{i+1}_{training.title}.jpg"] = training.photo

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zip_file:
        for label, path in file_paths.items():
            if path and os.path.exists(path):
                arcname = f"{worker.name.replace(' ', '_')}/{os.path.basename(path)}"
                zip_file.write(path, arcname=arcname)

    zip_buffer.seek(0)
    zip_filename = f"{worker.name.replace(' ', '_')}_documents.zip"

    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_filename
    )
