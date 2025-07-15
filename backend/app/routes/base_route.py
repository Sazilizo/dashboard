from flask import Blueprint, jsonify

base_bp = Blueprint("base", __name__)

@base_bp.route("/")
def home():
    return jsonify({"message": "Welcome to the API!"})

@base_bp.route("/api/test-db")
def test_db():
    from app.models import Student
    try:
        count = Student.query.count()
        return {"status": "success", "students": count}
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500
