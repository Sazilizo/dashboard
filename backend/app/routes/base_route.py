from flask import Blueprint, jsonify

base_bp = Blueprint("base", __name__)

@base_bp.route("/")
def home():
    return jsonify({"message": "Welcome to the API!"})
