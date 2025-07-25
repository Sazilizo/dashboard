from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from datetime import datetime
# from app.models import AuditLog, User, db

def log_rate_limit_violation(limit):
    from app.extensions import db
    from app.models import AuditLog, User
    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        if user_id is None:
            return jsonify({"error":"Rate limit exceeded"}), 429
    except Exception:
        return jsonify({"error":"Rate limit exceeded"}), 429

    log = AuditLog(
        user_id=user_id,
        action=f"RATE_LIMIT_EXCEEDED: {request.method} {request.path}",
        ip_address=request.remote_addr,
        timestamp=datetime.utcnow(),
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        "error": "Rate limit exceeded. Please slow down."
    }), 429

