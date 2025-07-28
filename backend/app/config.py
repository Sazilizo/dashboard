import os
from datetime import timedelta
from dotenv import load_dotenv


load_dotenv()

class Config:
    SECRET_KEY = os.getenv("JWT_SECRET_KEY")  # used for both Flask and JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback-jwt")
    SQLALCHEMY_DATABASE_URI = os.getenv("SQLALCHEMY_DATABASE_URI")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    REDIS_URL = os.getenv("REDIS_URL")
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "static/uploads/")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB upload cap (optional)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)         # Auto-expire access token after 1 hour
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=1)
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = True  # only over HTTPS
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_CSRF_PROTECT = False 