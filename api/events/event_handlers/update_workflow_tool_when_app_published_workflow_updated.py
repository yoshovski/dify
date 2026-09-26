from datetime import datetime
from typing import cast

from sqlalchemy import update

from events.app_event import app_published_workflow_was_updated
from extensions.ext_database import db
from models.tools import WorkflowToolProvider
from models.workflow import Workflow


@app_published_workflow_was_updated.connect
def handle(sender, **kwargs):
    """Point the app's workflow-as-tool at the newly published workflow version.

    A workflow tool runs the exact version stored on its provider, so without this
    every publish left the tool on the previous version until it was saved again.
    Parameter configuration is not touched: renamed or added Start inputs still
    need the tool to be reconfigured.
    """
    app = sender
    published_workflow = cast(Workflow, kwargs.get("published_workflow"))
    if published_workflow is None:
        return

    db.session.execute(
        update(WorkflowToolProvider)
        .where(
            WorkflowToolProvider.tenant_id == app.tenant_id,
            WorkflowToolProvider.app_id == app.id,
            WorkflowToolProvider.version != published_workflow.version,
        )
        .values(version=published_workflow.version, updated_at=datetime.now())
    )
    db.session.commit()
