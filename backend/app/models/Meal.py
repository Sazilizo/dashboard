from datetime import datetime
from app.extensions import db

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
