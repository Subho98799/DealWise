from app.security import limiter


def test_health_does_not_touch_db(client, monkeypatch):
    import app.db

    def boom(*a, **k):
        raise AssertionError("health must not use the database")

    monkeypatch.setattr(app.db.engine, "connect", boom)
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_health_db(client):
    r = client.get("/api/health/db")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_security_headers(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in h["content-security-policy"]
    assert "frame-ancestors 'none'" in h["content-security-policy"]
    assert h["cache-control"] == "no-store"


def test_unknown_route_uses_error_shape(client):
    r = client.get("/api/nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found", "message": "Not Found"}}


def test_auth_rate_limit_is_20_per_minute(client):
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [client.get("/api/auth/google/login", params={"next": "x"}).status_code
                 for _ in range(21)]
        assert codes[:20] == [400] * 20
        assert codes[20] == 429
    finally:
        limiter.reset()
        limiter.enabled = False
