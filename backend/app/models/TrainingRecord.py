from app.extensions import db

class TrainingRecord(db.Model):
    __tablename__ = 'training_records'

    id = db.Column(db.Integer, primary_key=True)
    worker_id = db.Column(db.Integer, db.ForeignKey('workers.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    price = db.Column(db.Float, nullable=True)
    per_person = db.Column(db.Float, nullable=True)
    training_description = db.Column(db.String(255), nullable=False)
    training_outcomes = db.Column(db.String(255), nullable=False)
    accredited = db.Column(db.Boolean, default=False)
    venue = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False)
    photo = db.Column(db.String(255), nullable=True)

    worker = db.relationship('Worker', backref='trainings')
