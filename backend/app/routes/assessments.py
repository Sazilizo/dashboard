from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, and_, or_
from app.models import Assessment, Student, User, TermEnum, db
from utils.decorators import role_required

assessments_bp = Blueprint('assessments', __name__)

# Create or update assessment for a student and term
@assessments_bp.route('/student/<int:student_id>', methods=['POST', 'PUT'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def create_or_update_assessment(student_id):
    user = User.query.get(get_jwt_identity())
    student = Student.query.get_or_404(student_id)

    if user.school_id != student.school_id:
        return jsonify({"error": "Access forbidden: school mismatch"}), 403

    data = request.get_json()
    if not data or 'term' not in data or 'score' not in data:
        return jsonify({"error": "term and score required"}), 400

    try:
        term_enum = TermEnum(data['term'])
    except ValueError:
        return jsonify({"error": "Invalid term"}), 400

    score = data['score']
    if not isinstance(score, (int, float)):
        return jsonify({"error": "Score must be a number"}), 400

    # Check if assessment exists for this student and term
    assessment = Assessment.query.filter_by(student_id=student.id, term=term_enum).first()
    if assessment:
        assessment.score = score
    else:
        assessment = Assessment(student_id=student.id, term=term_enum, score=score)
        db.session.add(assessment)

    db.session.commit()
    return jsonify({"message": "Assessment saved", "assessment": {
        "id": assessment.id,
        "student_id": assessment.student_id,
        "term": assessment.term.value,
        "score": assessment.score
    }}), 200

# Delete an assessment by ID
@assessments_bp.route('/<int:assessment_id>', methods=['DELETE'])
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

# Helper to build filters for averages
def build_filters(filters, user):
    conditions = []
    if 'school_id' in filters:
        conditions.append(Student.school_id == filters['school_id'])
    else:
        # Default to user's school if not provided
        conditions.append(Student.school_id == user.school_id)

    if 'grade' in filters:
        conditions.append(Student.grade == filters['grade'])
    if 'category' in filters:
        try:
            category_enum = CategoryEnum(filters['category'])
            conditions.append(Student.category == category_enum)
        except:
            pass
    if 'year' in filters:
        conditions.append(Student.year == filters['year'])

    return conditions

# Get average assessments with optional filters and terms
@assessments_bp.route('/averages', methods=['GET'])
@jwt_required()
@role_required('head_tutor', 'head_coach', 'admin', 'superuser')
def get_averages():
    user = User.query.get(get_jwt_identity())

    grade = request.args.get('grade')
    school_id = request.args.get('school_id', type=int)
    category = request.args.get('category')
    year = request.args.get('year', type=int)
    terms = request.args.getlist('terms')  # e.g., ?terms=Term 1&terms=Term 2

    # Validate terms
    if terms:
        try:
            term_enums = [TermEnum(term) for term in terms]
        except ValueError:
            return jsonify({"error": "Invalid term in terms filter"}), 400
    else:
        # Default all terms
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
