from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request_optional
from datetime import datetime
from app.models import AuditLog, User, db

def log_rate_limit_violation(request):
    try:
        verify_jwt_in_request_optional()
        user_id = get_jwt_identity()
    except Exception:
        user_id = None

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

