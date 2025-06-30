from .auth import auth_bp
from .uploads import upload_bp
from .worker import worker_bp  # if you have it

def register_routes(app):
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(upload_bp, url_prefix='/upload')
    app.register_blueprint(worker_bp, url_prefix='/workers')  # optional
