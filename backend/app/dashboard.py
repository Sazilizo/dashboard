from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/summary', methods=['GET'])
@jwt_required()
def dashboard_summary():
    return jsonify({
        'message': 'Dashboard summary data will go here.'
    }), 200
