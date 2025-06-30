from sqlalchemy import or_
from app.models import db 

def apply_pagination_and_search(query, model, search_term=None, search_fields=[], page=1, per_page=10):
    if search_term and search_fields:
        filters = [getattr(model, field).ilike(f'%{search_term}%') for field in search_fields]
        query = query.filter(or_(*filters)) 

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)
    return paginated
