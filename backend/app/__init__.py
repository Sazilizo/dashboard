from flask import Flask
from .models import db
from flask_cors import CORS
from .seed import seed_data
from flask_jwt_extended import JWTManager
from .routes import register_routes  # clean blueprint mount point
import os
from dotenv import load_dotenv

jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    load_dotenv()

    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('SQLALCHEMY_DATABASE_URI')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = 'static/uploads/'
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')

    db.init_app(app)
    jwt.init_app(app)
    CORS(app)

    with app.app_context():
        db.drop_all()
        db.create_all()
        seed_data()
        for rule in app.url_map.iter_rules():
            print(f"{rule} -> {rule.endpoint}")

    register_routes(app) 

    return app
