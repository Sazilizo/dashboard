from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Assessment, Student, User, TermEnum, CategoryEnum
from utils.decorators import role_required
from sqlalchemy import func, and_
from app.extensions import db
from flask_cors import cross_origin
from utils.maintenance import maintenance_guard

assessments_bp = Blueprint('assessments', __name__)

@assessments_bp.route('/student/<int:student_id>', methods=['POST', 'PUT'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def create_or_update_assessment(student_id):
    user = User.query.get(get_jwt_identity())
    student = Student.query.get_or_404(student_id)

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    data = request.get_json() or {}
    term = data.get('term')
    score = data.get('score')

    if term is None or score is None:
        return jsonify({"error": "term and score required"}), 400

    try:
        term_enum = TermEnum(term)
    except ValueError:
        return jsonify({"error": "Invalid term"}), 400

    if not isinstance(score, (int, float)):
        return jsonify({"error": "Score must be a number"}), 400

    assessment = Assessment.query.filter_by(student_id=student.id, term=term_enum).first()
    if assessment:
        assessment.score = score
    else:
        assessment = Assessment(student_id=student.id, term=term_enum, score=score)
        db.session.add(assessment)

    db.session.commit()
    return jsonify({
        "message": "Assessment saved",
        "assessment": {
            "id": assessment.id,
            "student_id": assessment.student_id,
            "term": assessment.term.value,
            "score": assessment.score,
            "specs": assessment.specs
        }
    }), 200

@assessments_bp.route('/delete/<int:assessment_id>', methods=['DELETE'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
@jwt_required()
@role_required('admin', 'superuser')
def delete_assessment(assessment_id):
    assessment = Assessment.query.get_or_404(assessment_id)
    user = User.query.get(get_jwt_identity())
    student = Student.query.get(assessment.student_id)

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    db.session.delete(assessment)
    db.session.commit()
    return jsonify({"message": "Assessment deleted"}), 200

def build_filters(filters, user):
    conditions = []
    if 'school_id' in filters:
        conditions.append(Student.school_id == filters['school_id'])
    else:
        conditions.append(Student.school_id == user.school_id)

    if 'grade' in filters:
        conditions.append(Student.grade == filters['grade'])
    if 'category' in filters:
        try:
            category_enum = CategoryEnum(filters['category'])
            conditions.append(Student.category == category_enum)
        except ValueError:
            pass
    if 'year' in filters:
        conditions.append(Student.year == filters['year'])

    return conditions

@assessments_bp.route('/averages', methods=['GET'])
@cross_origin(origins="http://localhost:3000", supports_credentials=True)
@maintenance_guard()
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def get_averages():
    user = User.query.get(get_jwt_identity())

    grade = request.args.get('grade')
    school_id = request.args.get('school_id', type=int)
    category = request.args.get('category')
    year = request.args.get('year', type=int)
    terms = request.args.getlist('terms')

    if terms:
        try:
            term_enums = [TermEnum(term) for term in terms]
        except ValueError:
            return jsonify({"error": "Invalid term in terms filter"}), 400
    else:
        term_enums = list(TermEnum)

    filters = {
        'school_id': school_id,
        'grade': grade,
        'category': category,
        'year': year
    }
    conditions = build_filters(filters, user)

    query = db.session.query(
        func.avg(Assessment.score).label('average_score')
    ).join(Student).filter(
        and_(
            Assessment.term.in_(term_enums),
            *conditions
        )
    )

    average = query.scalar()
    return jsonify({
        "average_score": round(average, 2) if average is not None else None,
        "filters": filters,
        "terms": [term.value for term in term_enums]
    }), 200
