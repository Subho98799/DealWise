"""Fails if any /api route (other than health and auth) can be reached without the session dependency."""
from fastapi.routing import APIRoute

from app.auth.deps import current_user

PUBLIC_PREFIXES = ("/api/health", "/api/auth/")


def _api_routes(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
            continue
        included_router = getattr(route, "original_router", None)
        if included_router is not None:
            yield from _api_routes(included_router.routes)


def _depends_on(dependant, target) -> bool:
    return any(d.call is target or _depends_on(d, target) for d in dependant.dependencies)


def test_every_private_route_requires_a_session():
    from app.main import app

    routes = list(_api_routes(app.routes))
    private = [r for r in routes if not r.path.startswith(PUBLIC_PREFIXES)]
    assert len(private) >= 14
    missing = [f"{sorted(r.methods)} {r.path}" for r in private if not _depends_on(r.dependant, current_user)]
    assert missing == [], f"routes without authentication: {missing}"
    assert all(r.path.startswith("/api/") for r in routes)


def test_private_routes_return_401_without_cookie(client):
    from app.main import app

    for r in _api_routes(app.routes):
        if not r.path.startswith(PUBLIC_PREFIXES):
            path = r.path.replace("{deal_id}", "00000000-0000-0000-0000-000000000000").replace(
                "{mediator_id}", "00000000-0000-0000-0000-000000000000").replace(
                "{job_id}", "00000000-0000-0000-0000-000000000000")
            for m in r.methods:
                resp = client.request(m, path, headers={"X-Requested-With": "dealtracker"})
                assert resp.status_code == 401, (m, path, resp.status_code)
