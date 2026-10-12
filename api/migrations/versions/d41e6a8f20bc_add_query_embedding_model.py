"""Add optional query embedding model without changing document indexes.

Revision ID: d41e6a8f20bc
Revises: c3f1a9b2e6d4
"""

import sqlalchemy as sa
from alembic import op

revision = "d41e6a8f20bc"
down_revision = "c3f1a9b2e6d4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.add_column(sa.Column("query_embedding_model", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("query_embedding_model_provider", sa.String(255), nullable=True))


def downgrade():
    with op.batch_alter_table("datasets") as batch_op:
        batch_op.drop_column("query_embedding_model_provider")
        batch_op.drop_column("query_embedding_model")
