from app.extensions import db
from datetime import datetime

class MaintenanceLock(db.Model):
    __tablename__ = "maintenance_locks"

    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.Integer, nullable=False, unique=True)

    locked = db.Column(db.Boolean, default=False, nullable=False)
    reason = db.Column(db.String(255), nullable=True)

    locked_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    locked_by = db.relationship("User", backref="site_locks")
