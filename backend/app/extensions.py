from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from utils.logging import log_rate_limit_violation
from redis import Redis
import os

db = SQLAlchemy()
jwt = JWTManager()
migrate= Migrate()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("REDIS_URL"),
    default_limits=["200000 per day", "6000 per hour"],
    on_breach=log_rate_limit_violation
)