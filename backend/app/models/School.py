from app.extensions import db

class School(db.Model):
    __tablename__ = 'schools'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    address = db.Column(db.String(120), nullable=False)

    workers = db.relationship('Worker', backref='school', lazy=True)
    students = db.relationship('Student', backref='school', lazy=True)
    users = db.relationship('User', back_populates='school', lazy=True)
    meals_given = db.relationship('MealDistribution', backref='school', lazy=True)

