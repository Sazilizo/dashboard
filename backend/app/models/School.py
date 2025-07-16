from app.extensions import db

class School(db.Model):
    __tablename__ = 'schools'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    address = db.Column(db.String(120), nullable=False)
    contact_number =db.Column(db.String(10), nullable=True)
    email= db.Column(db.String(80), nullable=True)

    workers = db.relationship('Worker', backref='school', lazy=True)
    students = db.relationship('Student', backref='school', lazy=True)
    users = db.relationship('User', back_populates='school', lazy=True)
    meals_given = db.relationship('MealDistribution', backref='school', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "address": self.address,
            "contact_number":self.contact_number,
            "email":self.email
        }

