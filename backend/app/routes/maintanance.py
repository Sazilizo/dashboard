from app.extensions import db
from app.models import MaintenanceLock
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.decorators import role_required


maintenance_bp = Blueprint("maintenance", __name__)
@maintenance_bp.route("/update-lock", methods=["POST"])
@jwt_required()
@role_required("maintenance_user", "superuser")
def update_lock():
    data = request.get_json()
    site_id = data.get("site_id")
    locked = data.get("locked")  # true or false
    reason = data.get("reason")

    if site_id is None or locked is None:
        return jsonify({"error": "Missing site_id or locked status"}), 400

    user_id = get_jwt_identity()
    lock = MaintenanceLock.query.filter_by(site_id=site_id).first()

    if not lock:
        lock = MaintenanceLock(site_id=site_id)

    lock.locked = locked
    lock.locked_by_id = user_id
    lock.reason = reason
    db.session.add(lock)
    db.session.commit()

    return jsonify({
        "message": f"Site {site_id} {'locked' if locked else 'unlocked'}",
        "site_id": site_id,
        "locked": locked
    }), 200
