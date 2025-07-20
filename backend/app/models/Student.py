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
    year = db.Column(db.Integer, nullable=False, index=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

    photo = db.Column(db.String(255), nullable=True)
    parent_permission_pdf = db.Column(db.String(255), nullable=True)

    assessments = db.relationship('Assessment', backref='student', lazy=True, cascade="all, delete-orphan")
    sessions = db.relationship('StudentSession', backref='student', lazy=True)
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
            data["sessions"] = [
                {
                    "id": s.id,
                    "session_name": s.session_name,
                    "date": s.date.isoformat(),
                    "duration_hours": s.duration_hours,
                    "photo": s.photo,
                    "outcomes": s.outcomes,
                    "term": s.term.value,
                    "category": s.category.value,
                    "physical_education": s.physical_education,
                    "created_at": s.created_at.isoformat(),
                }
                for s in self.sessions
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
    category = db.Column(db.Enum(CategoryEnum), nullable=False, index=True)
    physical_education = db.Column(db.Boolean, default=False, index=True)
    term = db.Column(db.Enum(TermEnum), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

