from sqlalchemy import String, Integer, Date, Boolean, Enum
from app.models import CategoryEnum

def generate_schema_from_model(model, model_name: str):
    exclude_fields = {'id', 'created_at', 'deleted_at', 'updated_at', 'deleted'}

    schema = []
    for column in model.__table__.columns:
        name = column.name
        if name in exclude_fields:
            continue

        field = {
            "name": name,
            "label": name.replace("_", " ").title(),
            "upload": False  # default: not a file field
        }

        # Type detection
        if isinstance(column.type, String):
            if name.endswith('_pdf') or name == 'photo':
                field["type"] = "file"
                field["upload"] = True
                field["upload_url"] = get_upload_url(model_name, name)
            else:
                field["type"] = "text"
        elif isinstance(column.type, Integer):
            field["type"] = "number"
        elif isinstance(column.type, Date):
            field["type"] = "date"
        elif isinstance(column.type, Boolean):
            field["type"] = "checkbox"
        elif isinstance(column.type, Enum):
            field["type"] = "select"
            field["options"] = [e.value for e in column.type.enum_class]
        else:
            field["type"] = "text"

        schema.append(field)

    return schema


def get_upload_url(model_name, field_name):
    if model_name == 'student' and field_name == 'photo':
        return "/upload/student/photo/:id"
    elif model_name == 'worker':
        return "/upload/worker/files/:id"
    return None
