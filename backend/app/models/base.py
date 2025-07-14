from datetime import datetime
from app.extensions import db
import enum

class SoftDeleteMixin:
    deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime)

    def soft_delete(self):
        self.deleted = True
        self.deleted_at = datetime.utcnow()

    def restore(self):
        self.deleted = False
        self.deleted_at = None

class CategoryEnum(enum.Enum):
    pr = "pr"
    ww = "ww"
    un = "un"
    pe = "pe"

class TermEnum(enum.Enum):
    term1 = "Term 1"
    term2 = "Term 2"
    term3 = "Term 3"
