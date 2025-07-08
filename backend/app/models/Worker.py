from app.extensions import db
from .base import SoftDeleteMixin

class Worker(db.Model, SoftDeleteMixin):
    __tablename__ = 'workers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

    photo = db.Column(db.String(255), nullable=True)
    cv_pdf = db.Column(db.String(255), nullable=True)
    clearance_pdf = db.Column(db.String(255), nullable=True)
    child_protection_pdf = db.Column(db.String(255), nullable=True)

