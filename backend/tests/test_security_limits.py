import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas import SyncOp
from app.security import (
    DEFAULT_REQUEST_BODY_LIMIT,
    GLOBAL_REQUEST_BODY_LIMIT,
    SYNC_PUSH_BODY_LIMIT,
    RequestBodyLimitMiddleware,
)


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RequestBodyLimitMiddleware)

    @app.post("/{path:path}")
    async def echo_body(request: Request):
        return {"length": len(await request.body())}

    return TestClient(app)


def test_request_body_middleware_enforces_global_and_per_endpoint_limits():
    with _client() as client:
        assert client.post("/api/ping", content=b"x").status_code == 200
        response = client.post(
            "/api/ping",
            content=b"x" * (DEFAULT_REQUEST_BODY_LIMIT + 1),
        )
        assert response.status_code == 413
        response = client.post(
            "/api/sync/push",
            content=b"x" * (SYNC_PUSH_BODY_LIMIT + 1),
        )
        assert response.status_code == 413
        response = client.post(
            "/api/import/preview",
            content=b"x" * (GLOBAL_REQUEST_BODY_LIMIT + 1),
        )
        assert response.status_code == 413


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ({f"key-{index}": index for index in range(51)}, "50 keys"),
        ({"a": {"b": {"c": {"d": {"e": "x"}}}}}, "4 levels"),
        ({"note": "x" * 2001}, "2000 characters"),
        ({"items": ["x"] * 101}, "100 values"),
        ({"k" * 129: "x"}, "128 characters"),
    ],
)
def test_sync_operation_data_has_size_and_depth_bounds(data, message):
    with pytest.raises(ValidationError, match=message):
        SyncOp(
            op_id=uuid.uuid4(),
            type="deal",
            op="upsert",
            data=data,
            client_updated_at=datetime.now(timezone.utc),
        )
