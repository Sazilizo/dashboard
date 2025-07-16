
from enum import Enum
from datetime import datetime, date
from sqlalchemy.inspection import inspect

def to_dict(model_instance, include_relationships=False, include_hidden=False):
    output = {}
    mapper = inspect(model_instance.__class__)
    
    for column in mapper.columns:
        key = column.key
        value = getattr(model_instance, key)

        if not include_hidden and key in ["deleted", "deleted_at"]:
            continue

        if isinstance(value, Enum):
            output[key] = value.name
        elif isinstance(value, (datetime, date)):
            output[key] = value.isoformat()
        else:
            output[key] = value

    if include_relationships:
        for rel in mapper.relationships:
            rel_value = getattr(model_instance, rel.key)
            if rel_value is None:
                output[rel.key] = None
            elif isinstance(rel_value, list):
                output[rel.key] = [to_dict(item) for item in rel_value]
            else:
                output[rel.key] = to_dict(rel_value)

    return output
