from app.extensions import db
from .base import SoftDeleteMixin

class Worker(db.Model, SoftDeleteMixin):
    __tablename__ = 'workers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    id_number = db.Column(db.String(20), nullable=True)
    contact_number = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(120), nullable=True)
    start_date = db.Column(db.Date, nullable=True)
    photo = db.Column(db.String(255), nullable=True)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    story = db.Column(db.Text, nullable=True)  # Their goal/motivation
    role = db.relationship('Role', back_populates='workers')

    id_copy_pdf = db.Column(db.String(255), nullable=True)
    cv_pdf = db.Column(db.String(255), nullable=True)
    clearance_pdf = db.Column(db.String(255), nullable=True)
    child_protection_pdf = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "last_name": self.last_name,
            "email": self.email,
            "contact_number": self.contact_number,
            "school_id": self.school_id,
            "role": self.role,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "photo": self.photo,
            "cv_pdf": self.cv_pdf,
            "id_copy_pdf": self.id_copy_pdf,
            "clearance_pdf": self.clearance_pdf,
            "child_protection_pdf": self.child_protection_pdf,
        }


