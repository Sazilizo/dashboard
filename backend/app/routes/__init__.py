from .auth import auth_bp
from .uploads import upload_bp
from .workers import workers_bp
from .students import students_bp
from .assessments import assessments_bp
from .student_sessions import student_sessions_bp
from .meals import meals_bp
from .meals_stats import meal_stats_bp

def register_routes(app):
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(upload_bp, url_prefix='/upload')  # now handles worker uploads too
    app.register_blueprint(workers_bp, url_prefix='/workers')
    app.register_blueprint(students_bp, url_prefix='/students')
    app.register_blueprint(assessments_bp, url_prefix='/api/assessments')
    app.register_blueprint(student_sessions_bp, url_prefix='/sessions')
    app.register_blueprint(meals_bp, url_prefix="/meals")
    app.register_blueprint(meal_stats_bp, url_prefix='/meals/stats')

