from datetime import timedelta

import pytest
from fastapi.responses import RedirectResponse
from sqlalchemy import text

from app.auth.oauth import is_safe_next, oauth
from app.auth.sessions import COOKIE_NAME, hash_token
from tests.conftest import CSRF

FRONTEND = "http://localhost:5173"


def _google_userinfo(**overrides):
    info = {
        "sub": "google-sub-123",
        "email": "Asha@Example.com",
        "email_verified": True,
        "name": "Asha",
        "picture": "https://lh3.googleusercontent.com/a/abc",
    }
    info.update(overrides)
    return info


@pytest.fixture
def mock_google(monkeypatch):
    """Replaces Google: the redirect (records state) and the code->token exchange (returns userinfo)."""
    calls = {}

    async def fake_redirect(request, redirect_uri, **kwargs):
        calls["redirect_uri"] = redirect_uri
        request.session["_state_google_fake"] = {"data": {"nonce": "n"}}
        return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?state=fake", 302)

    def set_userinfo(**overrides):
        async def fake_exchange(request, **kwargs):
            return {"access_token": "x", "id_token": "y", "userinfo": _google_userinfo(**overrides)}

        monkeypatch.setattr(oauth.google, "authorize_access_token", fake_exchange)

    monkeypatch.setattr(oauth.google, "authorize_redirect", fake_redirect)
    set_userinfo()
    calls["set_userinfo"] = set_userinfo
    return calls


def _login(client, next_path="/"):
    r = client.get("/api/auth/google/login", params={"next": next_path})
    assert r.status_code == 302
    return client.get("/api/auth/google/callback", params={"code": "c", "state": "fake"})


def test_full_login_flow_sets_cookie_and_me_works(client, mock_google):
    r = _login(client, "/settings")
    assert mock_google["redirect_uri"] == f"{FRONTEND}/api/auth/google/callback"
    assert r.status_code == 302
    assert r.headers["location"] == f"{FRONTEND}/settings"
    set_cookie = r.headers["set-cookie"].lower()
    assert f"{COOKIE_NAME}=" in set_cookie and "httponly" in set_cookie
    assert "samesite=lax" in set_cookie and "path=/" in set_cookie
    assert client.cookies.get(COOKIE_NAME)

    me = client.get("/api/me")
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "asha@example.com" and body["name"] == "Asha"
    assert set(body) == {"id", "name", "email", "avatar_url", "role"}
    assert body["role"] == "user"


def test_cookie_holds_only_opaque_token_and_db_holds_only_hash(client, mock_google, owner_engine):
    _login(client)
    raw = client.cookies.get(COOKIE_NAME)
    assert len(raw) >= 43 and "asha" not in raw.lower()
    with owner_engine.connect() as c:
        stored = c.execute(text("SELECT token_hash FROM sessions")).scalars().all()
    assert stored == [hash_token(raw)]


def test_relogin_upserts_by_google_sub(client, mock_google, owner_engine):
    _login(client)
    mock_google["set_userinfo"](email="new@example.com", name="Asha K")
    _login(client)
    with owner_engine.connect() as c:
        rows = c.execute(text("SELECT email, name FROM users")).all()
    assert [tuple(r) for r in rows] == [("new@example.com", "Asha K")]


def test_missing_cookie_returns_401(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "not_authenticated"


def test_garbage_cookie_returns_401(client):
    client.cookies.set(COOKIE_NAME, "not-a-real-token")
    assert client.get("/api/me").status_code == 401


def test_expired_session_returns_401(client, make_user, owner_engine):
    _, raw = make_user("alice")
    with owner_engine.begin() as c:
        c.execute(text("UPDATE sessions SET expires_at = now() - interval '1 minute'"))
    client.cookies.set(COOKIE_NAME, raw)
    r = client.get("/api/me")
    assert r.status_code == 401
    with owner_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM sessions")).scalar_one() == 0


def test_sliding_expiry_touches_at_most_every_10_minutes(client, make_user, owner_engine):
    _, raw = make_user("alice")
    client.cookies.set(COOKIE_NAME, raw)
    with owner_engine.connect() as c:
        first = c.execute(text("SELECT last_seen_at FROM sessions")).scalar_one()
    assert client.get("/api/me").status_code == 200
    with owner_engine.begin() as c:
        assert c.execute(text("SELECT last_seen_at FROM sessions")).scalar_one() == first
        c.execute(
            text("UPDATE sessions SET last_seen_at = now() - interval '11 minutes', "
                 "expires_at = now() + interval '1 day'")
        )
    r = client.get("/api/me")
    assert r.status_code == 200 and COOKIE_NAME in r.headers.get("set-cookie", "")
    with owner_engine.connect() as c:
        exp = c.execute(text("SELECT expires_at - now() FROM sessions")).scalar_one()
    assert exp > timedelta(days=29)


def test_logout_invalidates_session(client, make_user, owner_engine):
    _, raw = make_user("alice")
    client.cookies.set(COOKIE_NAME, raw)
    assert client.get("/api/me").status_code == 200
    r = client.post("/api/auth/logout", headers=CSRF)
    assert r.status_code == 204
    assert COOKIE_NAME in r.headers["set-cookie"] and "Max-Age=0" in r.headers["set-cookie"]
    with owner_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM sessions")).scalar_one() == 0
    client.cookies.set(COOKIE_NAME, raw)  # replaying the old token must fail
    assert client.get("/api/me").status_code == 401


def test_callback_rejects_unverified_email(client, mock_google, owner_engine):
    mock_google["set_userinfo"](email_verified=False)
    r = _login(client)
    assert r.status_code == 302
    assert r.headers["location"] == f"{FRONTEND}/login?error=email_unverified"
    assert COOKIE_NAME not in r.headers.get("set-cookie", "")
    with owner_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users")).scalar_one() == 0


def test_callback_with_bad_state_is_rejected_without_mock(client):
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": "forged"})
    assert r.status_code == 302
    assert r.headers["location"] == f"{FRONTEND}/login?error=oauth_failed"


def test_callback_user_cancelled(client):
    r = client.get("/api/auth/google/callback", params={"error": "access_denied"})
    assert r.headers["location"] == f"{FRONTEND}/login?error=access_denied"


@pytest.mark.parametrize(
    "bad",
    ["https://evil.com", "http://evil.com/x", "//evil.com", "/\\evil.com", "\\\\evil.com",
     "evil.com", "javascript:alert(1)", "/ok\n/x", ""],
)
def test_next_rejects_absolute_and_tricky_urls(client, bad):
    assert is_safe_next(bad) is False
    r = client.get("/api/auth/google/login", params={"next": bad})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_next"


@pytest.mark.parametrize("good", ["/", "/settings", "/deals?status=pending"])
def test_next_accepts_relative_paths(good):
    assert is_safe_next(good) is True


def test_mutations_without_csrf_header_return_403(client, make_user):
    _, raw = make_user("alice")
    client.cookies.set(COOKIE_NAME, raw)
    for method, path in [("POST", "/api/auth/logout"), ("DELETE", "/api/me"),
                         ("PUT", "/api/me"), ("PATCH", "/api/me")]:
        r = client.request(method, path)
        assert r.status_code == 403, (method, path)
        assert r.json()["error"]["code"] == "csrf_failed"
    r = client.request("POST", "/api/auth/logout", headers={"X-Requested-With": "XMLHttpRequest"})
    assert r.status_code == 403
    assert client.get("/api/me").status_code == 200  # session untouched


def test_delete_me_removes_everything(client, make_user, owner_engine):
    uid, raw = make_user("alice")
    client.cookies.set(COOKIE_NAME, raw)
    r = client.delete("/api/me", headers=CSRF)
    assert r.status_code == 204
    assert "Max-Age=0" in r.headers["set-cookie"]
    with owner_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users")).scalar_one() == 0
    client.cookies.set(COOKIE_NAME, raw)
    assert client.get("/api/me").status_code == 401
