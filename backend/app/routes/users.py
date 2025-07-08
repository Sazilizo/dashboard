from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Role
from app.extensions import db
from utils.decorators import role_required
from werkzeug.security import generate_password_hash
from datetime import datetime

users_bp = Blueprint('users', __name__)

@users_bp.route('/', methods=['GET'])
@jwt_required()
@role_required('superuser', 'admin')
def list_users():
    users = User.query.filter_by(deleted=False).all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'role_id': u.role_id,
        'school_id': u.school_id
    } for u in users]), 200


@users_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required('superuser', 'admin')
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


@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
@role_required('superuser', 'admin')
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


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
@role_required('superuser', 'admin')
def delete_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=False).first_or_404()
    user.deleted = True
    user.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "User soft-deleted successfully"}), 200


@users_bp.route('/deleted', methods=['GET'])
@jwt_required()
@role_required('superuser', 'admin')
def list_deleted_users():
    deleted_users = User.query.filter_by(deleted=True).all()
    return jsonify([{ 
        'id': u.id,
        'username': u.username,
        'role_id': u.role_id,
        'school_id': u.school_id,
        'deleted_at': u.deleted_at.isoformat() if u.deleted_at else None
    } for u in deleted_users]), 200


@users_bp.route('/<int:user_id>/restore', methods=['POST'])
@jwt_required()
@role_required('superuser', 'admin')
def restore_user(user_id):
    user = User.query.filter_by(id=user_id, deleted=True).first()
    if not user:
        return jsonify({"error": "Deleted user not found"}), 404

    user.deleted = False