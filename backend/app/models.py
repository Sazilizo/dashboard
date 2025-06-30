from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import enum
from datetime import datetime

db = SQLAlchemy()

class CategoryEnum(enum.Enum):
    pr = "pr"
    ww = "ww"
    un = "un"

class TermEnum(enum.Enum):
    term1 = "Term 1"
    term2 = "Term 2"
    term3 = "Term 3"

class School(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    address = db.Column(db.String(120), nullable=False)

    workers = db.relationship('Worker', backref='school', lazy=True)
    students = db.relationship('Student', backref='school', lazy=True)
    users = db.relationship('User', back_populates='school', lazy=True)

class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    workers = db.relationship('Worker', backref='role', lazy=True)
    users = db.relationship('User', back_populates='role', lazy=True)

class Student(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.String(50), nullable=False)
    category = db.Column(db.Enum(CategoryEnum), nullable=False, default=CategoryEnum.un, index=True)
    physical_education = db.Column(db.Boolean, default=False)
    year = db.Column(db.Integer, nullable=False, index=True)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)

    photo = db.Column(db.String(255), nullable=True)
    parent_permission_pdf = db.Column(db.String(255), nullable=True)

    assessments = db.relationship('Assessment', backref='student', lazy=True, cascade="all, delete-orphan")

class Assessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    term = db.Column(db.Enum(TermEnum), nullable=False, index=True)
    score = db.Column(db.Float, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'term', name='uq_student_term'),
    )

class Worker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)

    photo = db.Column(db.String(255), nullable=True)
    cv_pdf = db.Column(db.String(255), nullable=True)
    clearance_pdf = db.Column(db.String(255), nullable=True)
    child_protection_pdf = db.Column(db.String(255), nullable=True)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)

    role = db.relationship('Role', back_populates='users')
    school = db.relationship('School', back_populates='users')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
