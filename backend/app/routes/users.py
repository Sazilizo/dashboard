from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Role
from app.models.UserRemoval import UserRemovalReview
from app.extensions import db
from utils.decorators import role_required
from werkzeug.security import generate_password_hash
from datetime import datetime
from flask_cors import cross_origin
from utils.formSchema import generate_schema_from_model

users_bp = Blueprint('users', __name__)

@users_bp.route('/', methods=['GET'])
@jwt_required()
@role_required('superuser', 'admin','hr')
def list_users():
    users = User.query.filter_by(deleted=False).all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'role_id': u.role_id,
        'school_id': u.school_id
    } for u in users]), 200

@users_bp.route("/form_schema", methods=["GET"])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
def student_form_schema():
    schema = generate_schema_from_model(Users, "Users")
    return jsonify(schema)

@users_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required('superuser', 'hr')
def create_user():
    data = request.get_json()
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
        school_id=school_id
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


@users_bp.route('update/<int:user_id>', methods=['PUT'])
@jwt_required()
@role_required('superuser', 'hr')
def update_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()
    data = request.get_json()
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

    db.session.commit()
    return jsonify({"message": "User updated successfully"}), 200


@users_bp.route('/update/me', methods=['PUT'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
@role_required('superuser', 'admin', 'head_tutor', 'head_coach')
def update_own_account():
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()
    data = request.get_json()

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

    db.session.commit()
    return jsonify({
        "message": "Your account has been updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }), 200


@users_bp.route('remove/<int:user_id>', methods=['DELETE'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@jwt_required()
@role_required('hr')
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
@jwt_required()
@role_required('superuser')
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
@jwt_required()
@role_required('superuser', 'hr')
def restore_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=True).first()
    if not user:
        return jsonify({"error": "Deleted user not found"}), 404

    user.deleted = False