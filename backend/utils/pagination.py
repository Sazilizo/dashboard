from sqlalchemy import or_
from app.extensions import db

# utils/pagination.py

from sqlalchemy import or_

def apply_pagination_and_search(query, model, search_term, search_columns, page=1, per_page=10):
    """
    Applies search filtering and pagination to a SQLAlchemy query.

    Args:
      query: base SQLAlchemy query
      model: SQLAlchemy model class
      search_term: string to search for
      search_columns: list of column names (strings) to search within model
      page: int, current page number
      per_page: int, number of items per page

    Returns:
      Pagination object with .items, .total, .page, .pages etc.
    """
    if search_term:
        search_filters = [
            getattr(model, col).ilike(f"%{search_term}%") for col in search_columns
        ]
        query = query.filter(or_(*search_filters))

    page = page if page > 0 else 1
    per_page = per_page if per_page > 0 else 10

    return query.paginate(page=page, per_page=per_page, error_out=False)

