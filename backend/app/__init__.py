from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os

from .models import db
from .routes import register_routes
from .seed import seed_data

jwt = JWTManager()

def create_app():
    load_dotenv()
    app = Flask(__name__)

    # ====== Config Setup ======
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('SQLALCHEMY_DATABASE_URI')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', 'static/uploads/')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
    app.config['ENV'] = os.getenv('FLASK_ENV', 'production')
    app.config['DEBUG'] = app.config['ENV'] == 'development'

    # ====== Init Extensions ======
    db.init_app(app)
    jwt.init_app(app)
    CORS(app)

    # ====== Ensure Upload and Logs Folders Exist ======
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    # ====== Register Blueprints ======
    register_routes(app)

    # ====== Optional: Dev Seeding & Table Reset ======
    with app.app_context():
        if app.config['ENV'] == 'development':
            db.drop_all()
            db.create_all()
            seed_data()
            print("Dev environment: DB reset and seeded.")
        else:
            db.create_all()
            print("Production environment: Tables ensured.")

        # Print route map for dev
        if app.config['DEBUG']:
            print("Registered Routes:")
            for rule in app.url_map.iter_rules():
                print(f"{rule} -> {rule.endpoint}")

    return app
