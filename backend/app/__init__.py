from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from app.config import Config
from app.routes import register_routes
from app.models import db
from app.extensions import db, jwt, limiter
jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    CORS(app)
    limiter.init_app(app)
    register_routes(app)

    with app.app_context():
        db.create_all()

    return app
