from datetime import datetime
from app.extensions import db
from .base import SoftDeleteMixin, CategoryEnum, TermEnum
from sqlalchemy.dialects.postgresql import JSON

class Student(db.Model, SoftDeleteMixin):
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.String(50), nullable=False)
    category = db.Column(db.Enum(CategoryEnum), nullable=False, default=CategoryEnum.un, index=True)
    physical_education = db.Column(db.Boolean, default=False, index=True)
    year = db.Column(db.Integer, nullable=False, index=True, default=lambda: datetime.utcnow().year)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    id_number = db.Column(db.String(20), unique=True, nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    photo = db.Column(db.String(255), nullable=True)
    parent_permission_pdf = db.Column(db.String(255), nullable=True)

    assessments = db.relationship('Assessment', backref='student', lazy=True, cascade="all, delete-orphan")
    academic_sessions = db.relationship('AcademicSession', back_populates='student', lazy=True, cascade="all, delete-orphan")
    pe_sessions = db.relationship('PESession', back_populates='student', lazy=True, cascade="all, delete-orphan")
    meal_logs = db.relationship('MealDistribution', backref='student', lazy=True)
    attendance_records = db.relationship('AttendanceRecord', back_populates='student')

    def to_dict(self, include_related=False):
        data = {
            "id": self.id,
            "full_name": self.full_name,
            "grade": self.grade,
            "category": self.category.value if self.category else None,
            "physical_education": self.physical_education,
            "year": self.year,
            "school_id": self.school_id,
            "id_number": self.id_number,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "photo": self.photo,
            "parent_permission_pdf": self.parent_permission_pdf,
        }

        if include_related:
            data["assessments"] = [
                {
                    "id": a.id,
                    "term": a.term.value,
                    "score": a.score,
                    "specs": a.specs,
                    "created_at": a.created_at.isoformat(),
                    "updated_at": a.updated_at.isoformat(),
                }
                for a in self.assessments
            ]
            data["academic_sessions"] = [
                {
                    "id": s.id,
                    "session_name": s.session_name,
                    "date": s.date.isoformat() if s.date else None,
                    "duration_hours": s.duration_hours,
                    "photo": s.photo,
                    "outcomes": s.outcomes,
                    "specs": s.specs,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat(),
                }
                for s in self.academic_sessions
            ]
            data["pe_sessions"] = [
                {
                    "id": s.id,
                    "session_name": s.session_name,
                    "date": s.date.isoformat() if s.date else None,
                    "duration_hours": s.duration_hours,
                    "photo": s.photo,
                    "outcomes": s.outcomes,
                    "specs": s.specs,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat(),
                }
                for s in self.pe_sessions
            ]

        return data


class Assessment(db.Model):
    __tablename__ = 'assessments'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    term = db.Column(db.Enum(TermEnum), nullable=False, index=True)
    score = db.Column(db.Float, nullable=False)
    specs = db.Column(JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'term', name='uq_student_term'),
    )


class AcademicSession(db.Model):
    __tablename__ = 'academic_sessions'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    session_name = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=True)
    duration_hours = db.Column(db.Float, nullable=False)
    photo = db.Column(db.String(255))
    outcomes = db.Column(db.Text)
    specs = db.Column(JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    category = db.Column(db.Enum(CategoryEnum), nullable=True, index=True)

    student = db.relationship("Student", back_populates="academic_sessions")
    user = db.relationship('User', back_populates='logged_academic_sessions')


class PESession(db.Model):
    __tablename__ = 'pe_sessions'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    session_name = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False)
    duration_hours = db.Column(db.Float, nullable=False) 
    photo = db.Column(db.String(255))
    outcomes = db.Column(db.Text)
    specs = db.Column(JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = db.relationship("Student", back_populates="pe_sessions")
    user = db.relationship('User', back_populates='logged_pe_sessions')
