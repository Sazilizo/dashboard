from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Role, Worker, AuditLog
from app.models.UserRemoval import UserRemovalReview
from app.extensions import db
from utils.decorators import role_required
from werkzeug.security import generate_password_hash
from datetime import datetime
from flask_cors import cross_origin
from utils.formSchema import generate_schema_from_model
from utils.maintenance import maintenance_guard


users_bp = Blueprint('users', __name__)

@users_bp.route("/form_schema", methods=["GET"])
@jwt_required()
def form_schema():
    model_name = request.args.get("model")

    MODEL_MAP = {
        "AuditLog":AuditLog,
        "Worker": Worker,
        "User": User,
        "Role":Role,
        "UserRemovalReview":UserRemovalReview
        # Add others only if you want to support them from this blueprint
    }

    model_class = MODEL_MAP.get(model_name)
    if not model_class:
        return jsonify({"error": f"Model '{model_name}' is not supported in this route."}), 400

    current_user = User.query.get(get_jwt_identity())
    schema = generate_schema_from_model(model_class, model_name, current_user=current_user)
    return jsonify(schema)

@users_bp.route('/create', methods=['POST'])
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def create_user():
    data = request.form
    # file = request.files.get('profile_picture')  # optional file field

    if not data:
        return jsonify({"error": "No input data provided"}), 400

    username = data.get('username')
    password = data.get('password')
    role_id = data.get('role_id')
    school_id = data.get('school_id')

    missing = [field for field in ('username', 'password', 'role_id', 'school_id') if not data.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    try:
        role_id = int(role_id)
        school_id = int(school_id)
    except ValueError:
        return jsonify({"error": "role_id and school_id must be integers"}), 400

    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Invalid role_id"}), 400

    new_user = User(
        username=username.strip(),
        role_id=role_id,
        school_id=school_id,
        # profile_picture=file.read() if file else None  # if storing as blob
    )
    new_user.set_password(password)

    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "role_id": new_user.role_id,
            "school_id": new_user.school_id
        }
    }), 201


@users_bp.route('/update/<int:user_id>', methods=['PUT'])
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def update_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()
    data = request.form
    # file = request.files.get('profile_picture')

    if not data:
        return jsonify({"error": "No input data provided"}), 400

    if 'username' in data:
        new_username = data['username'].strip()
        if new_username != user.username and User.query.filter_by(username=new_username).first():
            return jsonify({"error": "Username already exists"}), 400
        user.username = new_username

    if 'password' in data:
        user.set_password(data['password'])

    if 'role_id' in data:
        try:
            role_id = int(data['role_id'])
            role = Role.query.get(role_id)
            if not role:
                return jsonify({"error": "Invalid role_id"}), 400
            user.role_id = role_id
        except ValueError:
            return jsonify({"error": "role_id must be an integer"}), 400

    if 'school_id' in data:
        try:
            school_id = int(data['school_id'])
            user.school_id = school_id
        except ValueError:
            return jsonify({"error": "school_id must be an integer"}), 400

    # if file:
    #     user.profile_picture = file.read()

    db.session.commit()
    return jsonify({"message": "User updated successfully"}), 200


@users_bp.route('/update/me', methods=['PUT'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'admin', 'head_tutor', 'head_coach', "maintanance_user")
def update_own_account():
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()
    data = request.form
    # file = request.files.get("profile_picture")

    if not data:
        return jsonify({"error": "No input data provided"}), 400

    if 'username' in data:
        new_username = data['username'].strip()
        if new_username != user.username and User.query.filter_by(username=new_username).first():
            return jsonify({"error": "Username already exists"}), 400
        user.username = new_username

    if 'email' in data:
        new_email = data['email'].strip()
        if new_email != user.email and User.query.filter_by(email=new_email).first():
            return jsonify({"error": "Email already exists"}), 400
        user.email = new_email

    if 'password' in data:
        user.set_password(data['password'])

    # if file:
    #     user.profile_picture = file.read()

    db.session.commit()
    return jsonify({
        "message": "Your account has been updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }), 200

@users_bp.route('/promote/<int:worker_id>', methods=['POST'])
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def promote_worker_to_user(worker_id):
    data = request.form or request.json
    new_role_id = data.get("role_id")
    school_id = data.get("school_id")
    reason = data.get("reason", "")

    worker = Worker.query.get_or_404(worker_id)
    current_user = User.query.get(get_jwt_identity())

    # Create new User
    user = User(
        username=worker.email,
        email=worker.email,
        password_hash=generate_password_hash("temporary123"),  # or force reset later
        role_id=new_role_id,
        school_id=school_id,
    )
    db.session.add(user)

    # Log audit
    audit = AuditLog(
        user_id=current_user.id,
        action=f"Promoted worker (id={worker.id}) to user with role_id={new_role_id}",
        ip_address=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({"message": "Worker promoted to user"}), 201


@users_bp.route('/demote/<int:user_id>', methods=['POST'])
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def demote_user_to_worker(user_id):
    data = request.form or request.json
    reason = data.get("reason", "")
    warning = data.get("warning", "")

    current_user = User.query.get(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    # Ensure the worker record exists
    worker = Worker.query.filter_by(email=user.email).first()
    if not worker:
        return jsonify({"error": "Linked worker not found"}), 404

    # Log into UserRemovalReview
    review = UserRemovalReview(
        removed_user_id=user.id,
        removed_by_id=current_user.id,
        reason=reason,
        warning=warning
    )
    db.session.add(review)

    # Also log into AuditLog
    audit = AuditLog(
        user_id=current_user.id,
        action=f"Demoted user (id={user.id}) to worker",
        ip_address=request.remote_addr
    )
    db.session.add(audit)

    # Delete the user
    db.session.delete(user)
    db.session.commit()

    return jsonify({
        "message": f"User demoted to worker. Reason: {reason}"
    }), 200

@users_bp.route('remove/<int:user_id>', methods=['DELETE'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('hr', 'superuser')
def hr_soft_delete_user(user_id):
    current_user_id = get_jwt_identity()
    current_user = User.query.get(current_user_id)
    
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()

    # Prevent deletion of high-level roles
    protected_roles = ['admin', 'superuser']
    if user.role and user.role.name in protected_roles:
        return jsonify({"error": "You cannot remove admins or superusers"}), 403

    data = request.get_json()
    if not data or 'reason' not in data:
        return jsonify({"error": "Missing reason for deletion"}), 400

    # Soft delete user
    user.deleted = True
    user.deleted_at = datetime.utcnow()

    # Save reason + warning
    review = UserRemovalReview(
        removed_user_id=user.id,
        removed_by_id=current_user.id,
        reason=data['reason'],
        warning=data.get('warning', '')
    )
    db.session.add(review)
    db.session.commit()

    # Notify all superusers (print to console, or integrate email later)
    superusers = User.query.join(Role).filter(Role.name == 'superuser').all()
    for su in superusers:
        print(f"🔔 Notification: User '{user.username}' was removed by HR '{current_user.username}'. Reason: {data['reason']}")

    return jsonify({"message": "User removed with review recorded."}), 200


@users_bp.route('/removed', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'admin')
def list_removal_reviews():
    reviews = UserRemovalReview.query.order_by(UserRemovalReview.created_at.desc()).all()
    return jsonify([
        {
            "id": r.id,
            "removed_user_id": r.removed_user_id,
            "removed_by_id": r.removed_by_id,
            "reason": r.reason,
            "warning": r.warning,
            "created_at": r.created_at.isoformat()
        } for r in reviews
    ]), 200

@users_bp.route('/restore/<int:user_id>', methods=['POST'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
# @maintenance_guard()
@jwt_required()
@role_required('superuser', 'hr')
def restore_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=True).first()
    if not user:
        return jsonify({"error": "Deleted user not found"}), 404

    user.deleted = False