from app.models import School, Student, Meal, Role, Assessment, Worker
from sqlalchemy import Boolean, Integer, String, Enum
import enum
from utils.specs_config import SPEC_OPTIONS


def generate_schema_from_model(model, model_name, current_user=None):
    exclude_fields = {"id", "created_at", "updated_at", "deleted_at"}
    schema = []

    for column in model.__table__.columns:
        name = column.name
        if name in exclude_fields:
            continue

        field_schema = {
            "name": name,
            "label": name.replace("_", " ").title(),
            "required": not column.nullable and not column.default,
        }

        # JSON/JSONB support
        if column.type.__class__.__name__ == "JSON":
            field_schema["type"] = "json"
            field_schema["contentType"] = "application/json"
            field_schema["note"] = "For JSON fields, ensure the request Content-Type is application/json."

        elif isinstance(column.type, String):
            if "photo" in name or "pdf" in name or "file" in name:
                field_schema["type"] = "file"
                if "photo" in name:
                    field_schema["accept"] = "image/*"
                elif "pdf" in name:
                    field_schema["accept"] = "application/pdf"
            elif "email" in name:
                field_schema["type"] = "email"
            else:
                field_schema["type"] = "text"

        elif isinstance(column.type, Integer):
            if name == "school_id":
                field_schema["type"] = "select"
                field_schema["options"] = [
                    {"label": school.name, "value": school.id}
                    for school in School.query.order_by(School.name).all()
                ]

            elif name == "role_id":
                field_schema["type"] = "select"
                field_schema["options"] = [
                    {"label": role.name, "value": role.id}
                    for role in Role.query.order_by(Role.name).all()
                ]

            elif name == "student_id":
                students = Student.query.order_by(Student.full_name).all()
                field_schema["type"] = "select"
                field_schema["multiple"] = True  # Allow multiple students
                field_schema["options"] = [
                    {
                        "label": student.full_name,
                        "value": student.id,
                        "school_id": student.school_id,
                    }
                    for student in students
                ]
                field_schema["depends_on"] = "school_id"

            elif name == "meal_id":
                field_schema["type"] = "select"
                field_schema["options"] = [
                    {"label": meal.name, "value": meal.id}
                    for meal in Meal.query.order_by(Meal.name).all()
                ]

            elif name == "recorded_by":
                if current_user:
                    field_schema["type"] = "text"
                    field_schema["default"] = current_user.username
                    field_schema["readonly"] = True
                else:
                    field_schema["type"] = "text"
            else:
                field_schema["type"] = "number"

        elif isinstance(column.type, Boolean):
            field_schema["type"] = "checkbox"

        elif isinstance(column.type, Enum):
            enum_class = column.type.enum_class
            if enum_class and issubclass(enum_class, enum.Enum):
                field_schema["type"] = "select"
                if name == "category" and current_user:
                    role = current_user.role.name.lower()
                    all_options = [
                        {"label": e.value.upper(), "value": e.value}
                        for e in enum_class
                    ]
                    if role == "head_tutor":
                        filtered = [opt for opt in all_options if opt["value"] in ["academic", "reading"]]
                        field_schema["options"] = filtered
                    elif role == "head_coach":
                        filtered = [opt for opt in all_options if opt["value"] in ["physical_education", "pe"]]
                        field_schema["options"] = filtered
                    else:
                        field_schema["options"] = all_options
                else:
                    field_schema["options"] = [
                        {"label": e.value.upper(), "value": e.value}
                        for e in enum_class
                    ]
            else:
                field_schema["type"] = "select"
                field_schema["options"] = column.type.enums

        elif "date" in str(column.type).lower():
            field_schema["type"] = "date"

        else:
            field_schema["type"] = "text"

        schema.append(field_schema)

    # Add dynamic "specs" field based on model + user role
    if model_name in ("AcademicSession", "PESession", "Assessment") and current_user:
        role = current_user.role.name.lower()
        specs_options = []

        if role in ("admin", "superuser"):
            # Combine all unique specs
            all_specs = []
            for spec_list in SPEC_OPTIONS.values():
                all_specs.extend(spec_list)
            seen = set()
            unique_specs = []
            for spec in all_specs:
                if spec['key'] not in seen:
                    seen.add(spec['key'])
                    unique_specs.append(spec)
            specs_options = unique_specs

        elif role == "head_coach":
            specs_options = SPEC_OPTIONS.get("physical_education", [])

        elif role == "head_tutor":
            specs_options = SPEC_OPTIONS.get("reading", [])

        if specs_options:
            schema.append({
                "name": "specs",
                "label": "Performance Specs",
                "type": "json_object",
                "group": [
                    {
                        "key": o["key"],
                        "label": o["label"],
                        "type": "number",
                        "min": 0,
                        "max": 100,
                        "step": 1,
                        "required": False
                    } for o in specs_options
                ],
                "required": False,
                "description": "Enter performance scores as integers between 0 and 100"
            })

    return {
        "model": model_name,
        "fields": schema,
    }
