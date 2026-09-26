from types import SimpleNamespace
from typing import cast
from unittest.mock import patch

from sqlalchemy.dialects import postgresql

from events.event_handlers.update_workflow_tool_when_app_published_workflow_updated import handle
from models.model import App
from models.workflow import Workflow


def test_publish_moves_workflow_tool_to_new_version() -> None:
    app = cast(App, SimpleNamespace(id="app-1", tenant_id="tenant-1"))
    workflow = cast(Workflow, SimpleNamespace(version="2026-09-26 15:37:01.440850"))

    with patch("events.event_handlers.update_workflow_tool_when_app_published_workflow_updated.db") as db:
        handle(app, published_workflow=workflow)

    statement = db.session.execute.call_args.args[0]
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert sql.startswith("UPDATE tool_workflow_providers SET version=")
    assert compiled.params["tenant_id_1"] == "tenant-1"
    assert compiled.params["app_id_1"] == "app-1"
    assert compiled.params["version"] == "2026-09-26 15:37:01.440850"
    db.session.commit.assert_called_once_with()


def test_missing_published_workflow_is_ignored() -> None:
    app = cast(App, SimpleNamespace(id="app-1", tenant_id="tenant-1"))

    with patch("events.event_handlers.update_workflow_tool_when_app_published_workflow_updated.db") as db:
        handle(app)

    db.session.execute.assert_not_called()
