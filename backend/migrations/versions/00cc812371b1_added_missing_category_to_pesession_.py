"""added missing category  to PESession model

Revision ID: 00cc812371b1
Revises: 662954e038f0
Create Date: 2025-07-24 23:40:54.505016

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '00cc812371b1'
down_revision = '662954e038f0'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('academic_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category', sa.Enum('pr', 'ww', 'un', 'pe', name='categoryenum'), nullable=True))
        batch_op.create_index(batch_op.f('ix_academic_sessions_category'), ['category'], unique=False)

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('academic_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_academic_sessions_category'))
        batch_op.drop_column('category')

    # ### end Alembic commands ###
