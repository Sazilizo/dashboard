from werkzeug.security import generate_password_hash, check_password_hash
import enum
from datetime import datetime
from app.extensions import db


class SoftDeleteMixin:
    deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime)

    def soft_delete(self):
        self.deleted = True
        self.deleted_at = datetime.utcnow()

    def restore(self):
        self.deleted = False
        self.deleted_at = None

class CategoryEnum(enum.Enum):
    pr = "pr"
    ww = "ww"
    un = "un"

class TermEnum(enum.Enum):
    term1 = "Term 1"
    term2 = "Term 2"
    term3 = "Term 3"


class School(db.Model):
    __tablename__ = 'schools'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    address = db.Column(db.String(120), nullable=False)

    workers = db.relationship('Worker', backref='school', lazy=True)
    students = db.relationship('Student', backref='school', lazy=True)
    users = db.relationship('User', back_populates='school', lazy=True)
    meals_given = db.relationship('MealDistribution', backref='school', lazy=True)


class Role(db.Model):
    __tablename__ = 'roles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    workers = db.relationship('Worker', backref='role', lazy=True)
    users = db.relationship('User', back_populates='role', lazy=True)


class User(db.Model, SoftDeleteMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

    role = db.relationship('Role', back_populates='users')
    school = db.relationship('School', back_populates='users')

    audit_logs = db.relationship('AuditLog', backref='user', lazy=True)
    logged_sessions = db.relationship('StudentSession', backref='user', lazy=True)
    recorded_meals = db.relationship('MealDistribution', backref='recorded_by_user', lazy=True,
                                     foreign_keys='MealDistribution.recorded_by')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Student(db.Model, SoftDeleteMixin):
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.String(50), nullable=False)
    category = db.Column(db.Enum(CategoryEnum), nullable=False, default=CategoryEnum.un, index=True)
    physical_education = db.Column(db.Boolean, default=False)
    year = db.Column(db.Integer, nullable=False, index=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

    photo = db.Column(db.String(255), nullable=True)
    parent_permission_pdf = db.Column(db.String(255), nullable=True)

    assessments = db.relationship('Assessment', backref='student', lazy=True, cascade="all, delete-orphan")
    sessions = db.relationship('StudentSession', backref='student', lazy=True)
    meal_logs = db.relationship('MealDistribution', backref='student', lazy=True)


class Assessment(db.Model):
    __tablename__ = 'assessments'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    term = db.Column(db.Enum(TermEnum), nullable=False, index=True)
    score = db.Column(db.Float, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'term', name='uq_student_term'),
    )


class StudentSession(db.Model):
    __tablename__ = 'student_sessions'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)  # Head tutor/coach
    session_name = db.Column(db.String(100), nullable=False)
    date = db.Column(db.Date, nullable=False)
    duration_hours = db.Column(db.Float, nullable=False)
    photo = db.Column(db.String(255), nullable=True)
    outcomes = db.Column(db.Text, nullable=True)
    category = db.Column(db.Enum(CategoryEnum), nullable=False)
    physical_education = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Meal(db.Model):
    __tablename__ = 'meals'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=True)
    ingredients = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    distributions = db.relationship('MealDistribution', backref='meal', lazy=True)


class MealDistribution(db.Model):
    __tablename__ = 'meal_distributions'

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)

    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    meal_id = db.Column(db.Integer, db.ForeignKey('meals.id'), nullable=False)

    quantity = db.Column(db.Integer, default=1)
    is_fruit = db.Column(db.Boolean, default=False)
    fruit_type = db.Column(db.String(100), nullable=True)
    fruit_other_description = db.Column(db.String(255), nullable=True)
    photo = db.Column(db.String(255), nullable=True)

    recorded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)


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


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(255), nullable=False)
    ip_address = db.Column(db.String(100))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
