from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from utils.logging import log_rate_limit_violation

db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(
    get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    # pip install redis
    # storage_uri="redis://localhost:6379"
)
