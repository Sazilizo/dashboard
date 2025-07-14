from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from backend.config import Config
from app.routes import register_routes
from app.models import TokenBlocklist
from app.extensions import db, jwt, limiter, migrate

jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    CORS(app)
    limiter.init_app(app)
    register_routes(app)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        token = db.session.query(TokenBlocklist).filter_by(jti=jti).first()
        return token is not None
    with app.app_context():
        # db.drop_all()
        db.create_all()

    return app
