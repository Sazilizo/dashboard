from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class School(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    address = db.Column(db.String(120), nullable=False)
    
    workers = db.relationship('Worker', backref='school', lazy=True)
    students = db.relationship('Student', backref='school', lazy=True)

class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    workers = db.relationship('Worker', backref='role', lazy=True)
    users = db.relationship('User', backref='role', lazy=True)  # This defines 'role' backref on User

class Student(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.String(50), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)

    category = db.Column(db.String(10), nullable=False)  # "pr", "ww", or "un"
    physical_education = db.Column(db.Boolean, default=False)
    year = db.Column(db.Integer, nullable=False)

    photo = db.Column(db.String(255))
    parent_permission_pdf = db.Column(db.String(255))  # File path to PDF

class Assessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    term = db.Column(db.String(20), nullable=False)  # "Term 1", "Term 2", etc.
    score = db.Column(db.Float, nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)

    student = db.relationship('Student', backref='assessments')

class Worker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)
    photo = db.Column(db.String(255))
    cv_pdf = db.Column(db.String(255))
    clearance_pdf = db.Column(db.String(255))
    child_protection_pdf = db.Column(db.String(255))

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('school.id'), nullable=False)

    school = db.relationship('School', backref='users')  # Keep school relationship here

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
