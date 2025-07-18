from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity
from app.models import User, MaintenanceLock

def is_site_locked(site_id):
    lock = MaintenanceLock.query.filter_by(site_id=site_id).first()
    return lock.locked if lock else False

def maintenance_guard(param_name="school_id"):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = User.query.get(get_jwt_identity())
            if user.role.name in ("superuser", "maintenance_user"):
                return fn(*args, **kwargs)

            site_id = request.args.get(param_name) or request.form.get(param_name)
            if not site_id:
                return jsonify({"error": f"Missing {param_name}"}), 400

            if is_site_locked(site_id):
                return jsonify({"error": f"Site {site_id} is under maintenance"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
