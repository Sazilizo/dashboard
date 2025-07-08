from app.extensions import db
from datetime import datetime

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(255), nullable=False)
    ip_address = db.Column(db.String(100))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)