from datetime import datetime
from app.extensions import db

class AttendanceRecord(db.Model):
    __tablename__ = 'attendance_records'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # e.g. 'present', 'absent', 'late'
    recorded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    note = db.Column(db.String(255), nullable=True)

    student = db.relationship('Student', back_populates='attendance_records')

