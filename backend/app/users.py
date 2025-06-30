from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.decorators import role_required
from app.models import User, Role, db

users_bp = Blueprint('users', __name__)

@users_bp.route('/create', methods=['POST'])
@jwt_required()
@role_required('superuser', 'admin')
def create_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role_name = data.get('role')

    if not all([username, password, role_name]):
        return jsonify({'error': 'Missing fields'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'User exists'}), 409

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return jsonify({'error': 'Invalid role'}), 400

    user = User(username=username, role_id=role.id, school_id=data.get('school_id'))
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({'message': 'User created'}), 201
