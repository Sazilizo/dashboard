from app.extensions import db
from datetime import date , datetime

class UserRemovalReview(db.Model):
    __tablename__ = 'user_removal_reviews'

    id = db.Column(db.Integer, primary_key=True)
    removed_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    removed_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    warning = db.Column(db.String(255))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    removed_user = db.relationship('User', foreign_keys=[removed_user_id], backref="removal_records")
    removed_by = db.relationship('User', foreign_keys=[removed_by_id])
