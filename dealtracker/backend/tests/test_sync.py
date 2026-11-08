import uuid
from datetime import datetime, timedelta, timezone


FUTURE = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
PAST = "2000-01-01T00:00:00+00:00"


def op(type_="deal", op_="upsert", id=None, data=None, at=FUTURE, op_id=None, client_id=None):
    o = {"op_id": str(op_id or uuid.uuid4()), "type": type_, "op": op_, "data": data or {}, "client_updated_at": at}
    if id:
        o["id"] = str(id)
    if client_id:
        o["client_id"] = str(client_id)
    return o


def push(c, *ops):
    r = c.post("/api/sync/push", json={"ops": list(ops)})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def test_push_creates_with_client_ids_and_op_id_is_idempotent(api):
    a, _ = api("alice")
    mid, did, oid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    res = push(a, op("mediator", id=mid, data={"name": "Ravi"}),
               op(id=did, op_id=oid, data={"product": "Mixer", "amount_paid": "10.00", "mediator_id": str(mid)}))
    assert [r["status"] for r in res] == ["applied", "applied"]
    again = push(a, op(id=did, op_id=oid, data={"product": "Mixer"}))
    assert again[0]["status"] == "duplicate" and again[0]["id"] == str(did)
    items = a.get("/api/deals").json()["items"]
    assert len(items) == 1 and items[0]["id"] == str(did) and items[0]["client_id"] == str(did)
    assert items[0]["mediator_name"] == "Ravi"


def test_last_write_wins(api):
    a, _ = api("alice")
    did = uuid.uuid4()
    push(a, op(id=did, data={"product": "v1"}))
    stale = push(a, op(id=did, data={"product": "old"}, at=PAST))
    assert stale[0]["status"] == "rejected" and stale[0]["reason"].startswith("stale")
    newer = push(a, op(id=did, data={"product": "v2"}))
    assert newer[0]["status"] == "applied"
    assert a.get(f"/api/deals/{did}").json()["product"] == "v2"


def test_rejections_are_per_operation(api):
    a, _ = api("alice")
    res = push(a, op(data={"product": ""}, id=uuid.uuid4()),
               op(data={"product": "ok", "amount_paid": 1.5}, id=uuid.uuid4()),
               op(data={"product": "fine"}, id=uuid.uuid4()))
    assert [r["status"] for r in res] == ["rejected", "rejected", "applied"]
    assert all(r["reason"] for r in res[:2])
    assert len(a.get("/api/deals").json()["items"]) == 1


def test_batch_max_100(api):
    a, _ = api("alice")
    r = a.post("/api/sync/push", json={"ops": [op(id=uuid.uuid4(), data={"product": "x"}) for _ in range(101)]})
    assert r.status_code == 422


def test_changes_since_returns_newer_rows_and_deleted_ids(api):
    a, _ = api("alice")
    first = a.get("/api/sync/changes").json()
    assert first["deals"] == [] and first["deleted"] == {"deals": [], "mediators": []}
    d_old = a.post("/api/deals", json={"product": "old"}).json()
    d_gone = a.post("/api/deals", json={"product": "gone"}).json()
    cursor = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    a.delete(f"/api/deals/{d_gone['id']}")
    d_new = a.post("/api/deals", json={"product": "new"}).json()
    full = a.get("/api/sync/changes").json()
    assert {d["id"] for d in full["deals"]} == {d_old["id"], d_new["id"]}
    since = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    ch = a.get("/api/sync/changes", params={"since": since}).json()
    assert d_gone["id"] in ch["deleted"]["deals"] and d_new["id"] in {d["id"] for d in ch["deals"]}
    none = a.get("/api/sync/changes", params={"since": cursor}).json()
    assert none["deals"] == [] and none["deleted"]["deals"] == []
    assert a.get("/api/sync/changes", params={"since": "yesterday"}).status_code == 400
    assert datetime.fromisoformat(ch["server_time"])


def test_mediator_name_collision_returns_existing_id(api):
    a, _ = api("alice")
    existing = a.post("/api/mediators", json={"name": "Ravi"}).json()
    res = push(a, op("mediator", id=uuid.uuid4(), data={"name": "RAVI"}))
    assert res[0]["status"] == "duplicate" and res[0]["id"] == existing["id"]


def test_sync_isolation(api):
    a, _ = api("alice")
    b, _ = api("bob")
    did, mid = uuid.uuid4(), uuid.uuid4()
    push(a, op("mediator", id=mid, data={"name": "Ravi"}), op(id=did, data={"product": "A's deal", "mediator_id": str(mid)}))
    pulled = b.get("/api/sync/changes").json()
    assert pulled["deals"] == [] and pulled["mediators"] == []
    res = push(b, op(id=did, data={"product": "hijack"}),
               op(id=did, op_="delete"),
               op("mediator", id=mid, data={"name": "hijack"}),
               op("mediator", id=mid, op_="delete"),
               op(id=uuid.uuid4(), data={"product": "x", "mediator_id": str(mid)}))
    assert res[0]["status"] == "rejected" and "id_conflict" in res[0]["reason"]
    assert res[2]["status"] == "rejected"
    assert res[4]["status"] == "rejected" and "mediator_not_found" in res[4]["reason"]
    mine = a.get(f"/api/deals/{did}").json()
    assert mine["product"] == "A's deal" and mine["deleted_at"] is None
    assert [m["name"] for m in a.get("/api/mediators").json()] == ["Ravi"]
    # B's op_ids never collide with A's records either
    oid = uuid.uuid4()
    push(a, op(id=uuid.uuid4(), op_id=oid, data={"product": "a2"}))
    assert push(b, op(id=uuid.uuid4(), op_id=oid, data={"product": "b2"}))[0]["status"] == "applied"


def test_offline_create_then_edit_in_one_batch_and_across_batches(api):
    """Edits made offline after a create must apply even though the server writes later (regression)."""
    a, _ = api("alice")
    did = uuid.uuid4()
    t0 = datetime.now(timezone.utc) - timedelta(minutes=10)  # device was offline 10 minutes ago
    res = push(a, op(id=did, data={"product": "v1"}, at=t0.isoformat()),
               op(id=did, data={"product": "v2"}, at=(t0 + timedelta(seconds=5)).isoformat()))
    assert [r["status"] for r in res] == ["applied", "applied"]
    later = push(a, op(id=did, data={"product": "v3"}, at=(t0 + timedelta(seconds=9)).isoformat()))
    assert later[0]["status"] == "applied"
    assert a.get(f"/api/deals/{did}").json()["product"] == "v3"
    older = push(a, op(id=did, data={"product": "v0"}, at=(t0 + timedelta(seconds=1)).isoformat()))
    assert older[0]["status"] == "rejected"
