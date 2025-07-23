from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from app.extensions import db
from .base import SoftDeleteMixin

class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)

    workers = db.relationship('Worker', back_populates='role')
    users = db.relationship('User', back_populates='role', lazy=True)

class User(db.Model, SoftDeleteMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(512), nullable=False)

    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=True)
    worker_id = db.Column(db.Integer, db.ForeignKey('workers.id'), nullable=True)

    role = db.relationship('Role', back_populates='users')
    school = db.relationship('School', back_populates='users')
    worker = db.relationship('Worker', backref=db.backref('user', uselist=False))

    audit_logs = db.relationship('AuditLog', backref='user', lazy=True)
    logged_academic_sessions = db.relationship('AcademicSession', back_populates='user', lazy=True)
    logged_pe_sessions = db.relationship('PESession', back_populates='user', lazy=True)
    recorded_meals = db.relationship('MealDistribution', backref='recorded_by_user', lazy=True,
                                     foreign_keys='MealDistribution.recorded_by')

    expires_at = db.Column(db.DateTime, nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class TokenBlocklist(db.Model):
    __tablename__ = 'token_blocklist'

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, index=True)
    token_type = db.Column(db.String(10), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    user = db.relationship("User", backref="revoked_tokens")
