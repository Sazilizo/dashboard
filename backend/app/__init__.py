from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from .config import Config
from app.routes import register_routes
from app.models import TokenBlocklist
from app.extensions import db, jwt, limiter, migrate

jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.url_map.strict_slashes = False

    #Set preferred scheme to avoid http→https redirect on Render
    app.config['PREFERRED_URL_SCHEME'] = 'https'

    # Full CORS with credentials
    CORS(app, resources=r'/*', origins="http://localhost:3000", supports_credentials=True)

    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    register_routes(app)
    migrate.init_app(app, db)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        token = db.session.query(TokenBlocklist).filter_by(jti=jti).first()
        return token is not None

    with app.app_context():
        db.create_all()

    # Ensure preflight OPTIONS requests are accepted
    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        return response

    return app
