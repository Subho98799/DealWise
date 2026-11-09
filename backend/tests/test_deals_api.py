from datetime import datetime, timezone

import pytest

from app import clock

NOW = datetime(2026, 6, 10, 6, 0, tzinfo=timezone.utc)  # 11:30 IST, today = 2026-06-10


@pytest.fixture(autouse=True)
def frozen(monkeypatch):
    monkeypatch.setattr(clock, "now", lambda: NOW)


def deal(c, **kw):
    body = {
        "product": "Boat Airdopes",
        "amount_paid": "1299.00",
        "less_amount": "0.00",
        "commission": "0.00",
        **kw,
    }
    r = c.post("/api/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_returns_strings_and_computed_fields(api):
    a, _ = api("alice")
    d = deal(a, commission="50.00", review_deadline="2026-06-11", mediator_name="Ravi")
    assert d["amount_paid"] == "1299.00" and d["less_amount"] == "0.00"
    assert d["refund_amount"] == "1349.00" and d["net_amount"] == "50.00"
    assert d["date_taken"] == "2026-06-10"  # today in Asia/Kolkata
    assert d["is_urgent"] is True and d["is_overdue"] is False and d["urgency_reason"] == "review_due_soon"
    assert d["mediator_name"] == "Ravi" and d["mediator_id"]
    assert "user_id" not in d
    meds = a.get("/api/mediators").json()
    assert [(m["name"], m["pending_refund_amount"], m["open_deal_count"]) for m in meds] == [("Ravi", "1349.00", 1)]


def test_validation_errors(api):
    a, _ = api("alice")
    assert a.post("/api/deals", json={"product": "x", "amount_paid": 12.5}).status_code == 422
    assert a.post("/api/deals", json={"product": ""}).status_code == 422
    r = a.post("/api/deals", json={"product": "x", "date_taken": "2026-06-10", "review_deadline": "2026-06-01"})
    assert r.status_code == 422 and "review_deadline" in r.json()["error"]["message"]
    assert a.post("/api/deals", json={"product": "x", "user_id": "00000000-0000-0000-0000-000000000000"}).status_code == 422


@pytest.mark.parametrize(
    ("paid", "less", "commission", "refund", "gain_loss"),
    [
        ("1100.00", "100.00", "0.00", "1000.00", "-100.00"),
        ("1100.00", "100.00", "200.00", "1200.00", "100.00"),
        ("1100.00", "0.00", "50.00", "1150.00", "50.00"),
    ],
)
def test_generated_refund_and_gain_loss_examples(api, paid, less, commission, refund, gain_loss):
    a, _ = api("alice")
    response = a.post("/api/deals", json={
        "product": "example", "amount_paid": paid, "less_amount": less, "commission": commission,
    })
    assert response.status_code == 201, response.text
    result = response.json()
    assert (result["refund_amount"], result["net_amount"]) == (refund, gain_loss)


def test_legacy_refund_conversion_and_less_validation(api):
    a, _ = api("alice")
    created = a.post("/api/deals", json={
        "product": "legacy", "amount_paid": "1100.00", "refund_amount": "1200.00",
        "commission": "25.00",
    })
    assert created.status_code == 201, created.text
    deal_data = created.json()
    assert (deal_data["less_amount"], deal_data["commission"], deal_data["refund_amount"]) == (
        "0.00", "125.00", "1225.00",
    )
    patched = a.patch(f"/api/deals/{deal_data['id']}", json={"refund_amount": "1000.00"})
    assert patched.status_code == 200, patched.text
    assert (patched.json()["less_amount"], patched.json()["commission"], patched.json()["refund_amount"]) == (
        "100.00", "125.00", "1125.00",
    )
    invalid = a.post("/api/deals", json={
        "product": "invalid", "amount_paid": "10.00", "less_amount": "10.01",
    })
    assert invalid.status_code == 422
    assert "Less cannot be more than the amount paid" in invalid.json()["error"]["message"]


def test_legacy_refund_service_normalizes_string_money_and_rejects_malformed_values():
    from decimal import Decimal

    from app.errors import AppError
    from app.services.deals import _normalize_legacy_refund

    values = {
        "amount_paid": "1100.00",
        "refund_amount": "1200.00",
        "commission": "25.00",
    }
    _normalize_legacy_refund(values)
    assert values == {
        "amount_paid": Decimal("1100.00"),
        "less_amount": Decimal("0.00"),
        "commission": Decimal("125.00"),
    }

    with pytest.raises(AppError) as error:
        _normalize_legacy_refund({
            "amount_paid": "1100.00",
            "refund_amount": "not money",
            "commission": "25.00",
        })
    assert error.value.status == 422
    assert "refund_amount" in error.value.message


def test_client_id_idempotent(api):
    a, _ = api("alice")
    cid = "11111111-1111-4111-8111-111111111111"
    r1 = a.post("/api/deals", json={"product": "x", "client_id": cid, "mediator_name": "M"})
    r2 = a.post("/api/deals", json={"product": "x", "client_id": cid, "mediator_name": "m"})
    assert (r1.status_code, r2.status_code) == (201, 200)
    assert r1.json()["id"] == r2.json()["id"]
    assert len(a.get("/api/deals").json()["items"]) == 1
    assert len(a.get("/api/mediators").json()) == 1  # mediator name match is case-insensitive


def test_actions_and_invalid_transitions(api):
    a, _ = api("alice")
    d = deal(a)
    act = lambda name, **kw: a.post(f"/api/deals/{d['id']}/action", json={"action": name, **kw})  # noqa: E731
    r = act("payment_received")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
    assert act("review_done").json()["review_status"] == "done"
    assert act("review_done").status_code == 409
    assert act("form_submitted").json()["form_status"] == "submitted"
    paid = act("payment_received").json()
    assert paid["payment_status"] == "received" and paid["payment_received_on"] == "2026-06-10"
    assert act("bogus").status_code == 422
    assert act("reopen_payment").json()["payment_received_on"] is None


def test_patch_delete_and_filters(api):
    a, _ = api("alice")
    d1 = deal(a, product="Phone case", platform="Flipkart", notes="blue one", date_taken="2026-06-01")
    d2 = deal(a, product="Mixer", platform="Amazon", review_status="done", form_status="submitted",
              payment_status="received", date_taken="2026-06-05")
    r = a.patch(f"/api/deals/{d1['id']}", json={"less_amount": "1198.90", "platform": "Myntra"})
    assert r.json()["refund_amount"] == "100.10" and r.json()["updated_at"] >= d1["updated_at"]
    assert r.json()["less_amount"] == "1198.90"
    ids = lambda **q: [x["id"] for x in a.get("/api/deals", params=q).json()["items"]]  # noqa: E731
    assert ids(status="completed") == [d2["id"]]
    assert ids(status="open") == [d1["id"]]
    assert ids(q="BLUE") == [d1["id"]] and ids(platform="myntra") == [d1["id"]]
    assert ids(date_from="2026-06-02") == [d2["id"]]
    assert ids(sort="newest") == [d2["id"], d1["id"]]
    assert a.delete(f"/api/deals/{d1['id']}").status_code == 204
    assert a.get(f"/api/deals/{d1['id']}").status_code == 404
    assert ids() == [d2["id"]]


def test_cursor_pagination_covers_everything_once(api):
    a, _ = api("alice")
    made = {deal(a, product=f"p{i}", review_deadline=f"2026-06-{10 + i % 5:02d}",
                 amount_paid=f"{i}.00")["id"] for i in range(7)}
    for sort in ("urgency", "newest", "amount"):
        seen, cursor = [], None
        while True:
            page = a.get("/api/deals", params={"sort": sort, "limit": 3, **({"cursor": cursor} if cursor else {})}).json()
            seen += [x["id"] for x in page["items"]]
            cursor = page["next_cursor"]
            if not cursor:
                break
        assert len(seen) == 7 and set(seen) == made, sort
    assert a.get("/api/deals", params={"cursor": "garbage"}).status_code == 400
    assert a.get("/api/deals", params={"limit": 201}).status_code == 422


def test_summary_matches_hand_computed_fixture(api):
    a, _ = api("alice")
    deal(a, amount_paid="1000.00", less_amount="0.00", commission="150.00",
         review_status="done", form_status="submitted", payment_status="received",
         mediator_name="Ravi")  # net refund 1150.00; gain 150.00
    deal(a, amount_paid="500.50", less_amount="0.00", commission="0.00",
         date_taken="2026-06-01", review_deadline="2026-06-09", mediator_name="Ravi")  # overdue
    deal(a, amount_paid="0.10", less_amount="0.00", commission="0.10",
         refund_form_deadline="2026-06-12", mediator_name="Sita")  # urgent; net refund 0.20
    deal(a, amount_paid="200.00", less_amount="0.00", commission="50.00",
         review_deadline="2026-06-30")
    s = a.get("/api/summary").json()
    assert s["total_paid"] == "1700.60"
    assert s["refund_pending_amount"] == "750.70"
    assert s["refund_received_amount"] == "1150.00"
    assert s["gain_loss"] == "200.10"
    assert (s["open_deals"], s["urgent_count"], s["overdue_count"]) == (3, 2, 1)
    assert [(m["name"], m["pending_refund_amount"], m["open_deal_count"]) for m in s["top_mediators"]] == \
        [("Ravi", "500.50", 1), ("Sita", "0.20", 1)]


def test_mediator_crud_and_snapshot(api):
    a, _ = api("alice")
    m = a.post("/api/mediators", json={"name": "Ravi", "contact": "tg:@ravi"}).json()
    assert a.post("/api/mediators", json={"name": "ravi"}).status_code == 409
    d = deal(a, mediator_id=m["id"])
    assert a.patch(f"/api/mediators/{m['id']}", json={"name": "Ravi K"}).json()["name"] == "Ravi K"
    assert a.get(f"/api/deals/{d['id']}").json()["mediator_name"] == "Ravi K"
    assert a.delete(f"/api/mediators/{m['id']}").status_code == 204
    assert a.get("/api/mediators").json() == []
    kept = a.get(f"/api/deals/{d['id']}").json()
    assert kept["mediator_name"] == "Ravi K" and kept["mediator_id"] == m["id"]
    assert a.post("/api/mediators", json={"name": "Ravi K"}).status_code == 201  # name free again


def test_settings(api):
    a, _ = api("alice")
    me = a.get("/api/me").json()
    assert (me["alert_days"], me["timezone"]) == (2, "Asia/Kolkata")
    assert a.patch("/api/me/settings", json={"alert_days": 15}).status_code == 422
    assert a.patch("/api/me/settings", json={"timezone": "Mars/Base"}).status_code == 422
    r = a.patch("/api/me/settings", json={"alert_days": 0, "timezone": "UTC"})
    assert (r.json()["alert_days"], r.json()["timezone"]) == (0, "UTC")
    assert a.get("/api/me").json()["timezone"] == "UTC"


def test_isolation_on_every_deal_and_mediator_endpoint(api):
    a, _ = api("alice")
    b, _ = api("bob")
    d = deal(a, mediator_name="Ravi")
    mid = d["mediator_id"]
    assert b.get(f"/api/deals/{d['id']}").status_code == 404
    assert b.patch(f"/api/deals/{d['id']}", json={"product": "hacked"}).status_code == 404
    assert b.delete(f"/api/deals/{d['id']}").status_code == 404
    assert b.post(f"/api/deals/{d['id']}/action", json={"action": "review_done"}).status_code == 404
    assert b.patch(f"/api/mediators/{mid}", json={"name": "x"}).status_code == 404
    assert b.delete(f"/api/mediators/{mid}").status_code == 404
    assert b.get("/api/deals").json()["items"] == [] and b.get("/api/mediators").json() == []
    s = b.get("/api/summary").json()
    assert s["total_paid"] == "0.00" and s["top_mediators"] == []
    r = b.post("/api/deals", json={"product": "x", "mediator_id": mid})
    assert r.status_code == 422 and r.json()["error"]["code"] == "mediator_not_found"
    r = b.post("/api/deals", json={"product": "x", "client_id": d["client_id"] or d["id"]})
    assert r.status_code == 201  # same client_id in another account is a different deal
    # B creating a mediator with the same name is fine (unique per user)
    assert b.post("/api/mediators", json={"name": "Ravi"}).status_code == 201
    after = a.get(f"/api/deals/{d['id']}").json()
    assert after["product"] == "Boat Airdopes" and after["review_status"] == "pending"
    assert len(a.get("/api/mediators").json()) == 1


def test_deleted_deals_excluded_from_summary(api):
    a, _ = api("alice")
    d = deal(a)
    a.delete(f"/api/deals/{d['id']}")
    assert a.get("/api/summary").json()["total_paid"] == "0.00"


def test_timezone_boundary_changes_today(api, monkeypatch):
    a, _ = api("alice")
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 6, 10, 18, 29, tzinfo=timezone.utc))  # 23:59 IST
    d = deal(a, date_taken="2026-06-01", review_deadline="2026-06-10")
    assert d["is_overdue"] is False and d["is_urgent"] is True
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 6, 10, 18, 31, tzinfo=timezone.utc))  # 00:01 IST
    assert a.get(f"/api/deals/{d['id']}").json()["is_overdue"] is True
    assert deal(a, product="new")["date_taken"] == "2026-06-11"
    a.patch("/api/me/settings", json={"timezone": "UTC"})
    assert a.get(f"/api/deals/{d['id']}").json()["is_overdue"] is False  # still 10 Jun in UTC
