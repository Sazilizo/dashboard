from app.models import School, Student, Meal
from sqlalchemy import Boolean, Integer, String, Enum
import enum

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

        if isinstance(column.type, String):
            if "photo" in name or "pdf" in name or "file" in name:
                field_schema["type"] = "file"
            elif "email" in name:
                field_schema["type"] = "email"
            else:
                field_schema["type"] = "text"

        elif isinstance(column.type, Integer):
            # SCHOOL SELECT
            if name == "school_id":
                field_schema["type"] = "select"
                field_schema["options"] = [
                    {"label": school.name, "value": school.id}
                    for school in School.query.order_by(School.name).all()
                ]

            elif name == "student_id":
                students = Student.query.order_by(Student.full_name).all()
                field_schema["type"] = "select"
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

    return {
        "model": model_name,
        "fields": schema,
    }
