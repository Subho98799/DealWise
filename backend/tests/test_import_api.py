import csv
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.errors import AppError
from app.routes.imports import import_rate_limiter
from app.security import UserWindowRateLimiter
from app.services.imports import safe_csv_cell


def row(product="Coffee maker", **fields):
    return {
        "product": product,
        "date_taken": "08/11/2026",
        "amount_paid": "â‚¹1,299.50",
        **fields,
    }


def request_rows(rows, **options):
    return {"rows": rows, "options": options}


def commit_body(import_id, rows, **options):
    return {"import_id": str(import_id), "filename": "deals.xlsx", **request_rows(rows, **options)}


def test_preview_normalizes_duplicates_errors_totals_and_writes_nothing(api):
    a, _ = api("alice")
    rows = [
        row(platform="amazon", mediator="Ravi-Kumar", refund_amount="1500", review_status="reviewed"),
        row("  Coffee   maker ", platform="Amazon", mediator="Ravi Kumar", refund_amount="1500"),
        row("", amount_paid="bad", date_taken="not a date", review_status="Mystery state"),
    ]
    result = a.post("/api/import/preview", json=request_rows(rows)).json()
    assert [item["status"] for item in result["rows"]] == ["ok", "duplicate", "error"]
    assert result["rows"][1]["duplicate_of"] == 1
    assert result["rows"][0]["values"]["platform"] == "Amazon"
    assert result["counts"] == {"total": 3, "will_import": 1, "duplicates": 1, "errors": 1}
    assert result["unrecognized_status_values"] == {"review_status": ["Mystery state"]}
    assert result["mediators_to_create"] == ["Ravi-Kumar"]
    assert result["reconciliation"] == {
        "total_paid": "1299.50", "total_refund": "1500.00", "total_gain_loss": "200.50",
        "pending_refund": "1500.00",
    }
    assert result["rows"][0]["values"]["less_amount"] == "0.00"
    assert any("Legacy refund converted" in warning["reason"] for warning in result["rows"][0]["warnings"])
    assert a.get("/api/deals").json()["items"] == []
    assert a.get("/api/mediators").json() == []
    assert a.get("/api/import/jobs").json() == []


def test_preview_applies_user_status_maps_and_nested_defaults(api):
    a, _ = api("alice")
    result = a.post("/api/import/preview", json=request_rows(
        [row(review_status="Review cleared", form_status="", payment_status="received")],
        value_maps={"review_status": {"Review cleared": "done"}},
        defaults={"statuses": {"form_status": "submitted"}},
    )).json()
    assert result["rows"][0]["status"] == "ok"
    assert result["rows"][0]["values"]["review_status"] == "done"
    assert result["rows"][0]["values"]["form_status"] == "submitted"
    assert result["unrecognized_status_values"] == {}


def test_preview_identifies_matching_existing_deal_for_local_numbering(api):
    a, _ = api("alice")
    committed = a.post("/api/import/commit", json=commit_body(
        uuid.uuid4(), [row(platform="Amazon", mediator="Ravi", amount_paid="1299.50")],
    ))
    assert committed.status_code == 200, committed.text
    deal_id = a.get("/api/deals").json()["items"][0]["id"]

    preview = a.post("/api/import/preview", json=request_rows([
        row(platform="Amazon", mediator="Ravi", amount_paid="1299.50"),
    ])).json()

    assert preview["rows"][0]["status"] == "duplicate"
    assert preview["rows"][0]["existing_deal_id"] == deal_id


def test_commit_is_idempotent_uses_deterministic_client_id_and_exports_errors(api):
    a, _ = api("alice")
    import_id = uuid.uuid4()
    body = commit_body(import_id, [row(mediator="Ravi"), row("", amount_paid="bad", date_taken="not a date")])
    committed = a.post("/api/import/commit", json=body)
    assert committed.status_code == 200, committed.text
    job = committed.json()
    assert job["status"] == "committed"
    assert (job["rows_total"], job["rows_imported"], job["rows_failed"], job["mediators_created"]) == (2, 1, 1, 1)
    assert job["total_paid"] == "1299.50"
    assert job["total_refund"] == "1299.50"
    assert len(job["errors"]) == 3
    items = a.get("/api/deals").json()["items"]
    assert len(items) == 1
    assert items[0]["client_id"] == str(uuid.uuid5(import_id, "row:1"))
    again = a.post("/api/import/commit", json=commit_body(import_id, [row("Changed retry")]))
    assert again.status_code == 200 and again.json()["id"] == job["id"]
    assert len(a.get("/api/deals").json()["items"]) == 1
    csv_response = a.get(f"/api/import/jobs/{job['id']}/errors.csv")
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "row,field,reason" in csv_response.text
    assert a.get(f"/api/import/jobs/{job['id']}").json()["import_id"] == str(import_id)


def test_import_commit_lets_database_generate_net_refund(api):
    a, _ = api("alice")
    committed = a.post("/api/import/commit", json=commit_body(
        uuid.uuid4(),
        [row("Component import", amount_paid="1100.00", less_amount="100.00", commission="200.00")],
    ))
    assert committed.status_code == 200, committed.text
    assert committed.json()["rows_imported"] == 1

    imported = a.get("/api/deals").json()["items"][0]
    assert (imported["amount_paid"], imported["less_amount"], imported["commission"],
            imported["refund_amount"]) == ("1100.00", "100.00", "200.00", "1200.00")


def test_generated_messy_csv_fixture_previews_commits_and_undoes(api):
    fixture = Path(__file__).resolve().parents[1].parent / "frontend/src/imports/fixtures/messy-deals.csv"
    with fixture.open(encoding="utf-8-sig", newline="") as file:
        sheet = list(csv.reader(file))
    header = sheet[1]
    columns = {
        "product": "Item name",
        "platform": "Marketplace",
        "mediator": "Agent",
        "deal_type": "Deal type",
        "date_taken": "Order Date",
        "amount_paid": "Price Paid",
        "less_amount": "Less",
        "commission": "Commission",
        "refund_amount": "Refunded Amount",
        "review_status": "Review Status",
        "form_status": "Form Status",
        "payment_status": "Payment Status",
        "notes": "Remarks",
    }
    indices = {field: header.index(name) for field, name in columns.items()}
    rows = [
        {field: row[index] for field, index in indices.items()}
        for row in sheet[2:]
        if any(cell.strip() for cell in row)
    ]

    a, _ = api("fixture-import")
    initial = a.post("/api/import/preview", json=request_rows(rows)).json()
    assert initial["counts"] == {"total": 3, "will_import": 1, "duplicates": 1, "errors": 1}
    assert initial["unrecognized_status_values"] == {"review_status": ["mystery"]}

    options = {
        "date_order": "dmy",
        "duplicate_policy": "skip",
        "value_maps": {"review_status": {"mystery": "pending"}},
    }
    preview = a.post("/api/import/preview", json=request_rows(rows, **options)).json()
    assert [item["status"] for item in preview["rows"]] == ["ok", "duplicate", "ok"]
    assert preview["reconciliation"] == {
        "total_paid": "131199.50", "total_refund": "131299.50", "total_gain_loss": "100.00",
        "pending_refund": "131299.50",
    }
    assert any("Mapped Less is used" in warning["reason"] for warning in preview["rows"][2]["warnings"])
    assert (
        preview["rows"][2]["values"]["amount_paid"],
        preview["rows"][2]["values"]["less_amount"],
        preview["rows"][2]["values"]["commission"],
        preview["rows"][2]["values"]["refund_amount"],
    ) == ("129900.00", "0.00", "0.00", "129900.00")
    assert Decimal(preview["reconciliation"]["total_refund"]) == (
        Decimal(preview["reconciliation"]["total_paid"])
        + Decimal(preview["reconciliation"]["total_gain_loss"])
    )
    assert preview["mediators_to_create"] == ["Priya Deals", "New Agent"]

    committed = a.post("/api/import/commit", json=commit_body(uuid.uuid4(), rows, **options))
    assert committed.status_code == 200, committed.text
    job = committed.json()
    assert (job["rows_total"], job["rows_imported"], job["rows_skipped_duplicate"], job["rows_failed"]) == (3, 2, 1, 0)
    assert job["total_paid"] == preview["reconciliation"]["total_paid"]
    assert job["total_refund"] == preview["reconciliation"]["total_refund"]
    assert len(a.get("/api/deals").json()["items"]) == 2
    assert len(a.get("/api/mediators").json()) == 2

    undone = a.post(f"/api/import/jobs/{job['id']}/undo")
    assert undone.status_code == 200, undone.text
    assert undone.json()["deleted_deals"] == 2
    assert undone.json()["deleted_mediators"] == 2
    assert undone.json()["job"]["status"] == "undone"
    assert a.get("/api/deals").json()["items"] == []
    assert a.get("/api/mediators").json() == []


def test_import_duplicate_policy_reconciles_to_the_rows_that_commit(api):
    a, _ = api("alice")
    rows = [
        row("Juicer", amount_paid="12.50", refund_amount="12.00"),
        row(" Juicer ", amount_paid="12.50", refund_amount="12.00"),
    ]
    options = {"duplicate_policy": "import"}
    preview = a.post("/api/import/preview", json=request_rows(rows, **options)).json()
    assert preview["counts"]["will_import"] == 2
    assert preview["counts"]["duplicates"] == 1
    assert preview["reconciliation"] == {
        "total_paid": "25.00", "total_refund": "24.00", "total_gain_loss": "-1.00",
        "pending_refund": "24.00",
    }
    job = a.post("/api/import/commit", json=commit_body(uuid.uuid4(), rows, **options)).json()
    assert job["rows_imported"] == 2 and job["rows_skipped_duplicate"] == 0
    assert job["total_paid"] == preview["reconciliation"]["total_paid"]
    assert job["total_refund"] == preview["reconciliation"]["total_refund"]
    assert len(a.get("/api/deals").json()["items"]) == 2


def test_import_job_stores_only_the_first_1000_errors(api):
    a, _ = api("alice")
    invalid = {"product": "", "amount_paid": "", "date_taken": ""}
    job = a.post("/api/import/commit", json=commit_body(uuid.uuid4(), [invalid] * 1001)).json()
    assert job["status"] == "failed"
    assert job["rows_failed"] == 1001
    assert len(job["errors"]) == 1000
    assert job["errors"][0]["row"] == 1


def test_import_undo_reports_edited_deals_and_only_deletes_orphan_mediators(api):
    a, _ = api("alice")
    job = a.post("/api/import/commit", json=commit_body(uuid.uuid4(), [
        row("Coffee maker", mediator="Ravi"),
        row("Mixer", mediator="Meena", amount_paid="2000"),
    ])).json()
    imported = a.get("/api/deals").json()["items"]
    coffee = next(deal for deal in imported if deal["product"] == "Coffee maker")
    outside = a.post("/api/deals", json={"product": "Keep this", "mediator_name": "RAVI"})
    assert outside.status_code == 201
    assert a.patch(f"/api/deals/{coffee['id']}", json={"product": "Edited coffee maker"}).status_code == 200

    undone = a.post(f"/api/import/jobs/{job['id']}/undo")
    assert undone.status_code == 200, undone.text
    result = undone.json()
    assert result["deleted_deals"] == 2
    assert result["edited_deals_warning"] == 1
    assert result["deleted_mediators"] == 1
    assert "1 deals were edited" in result["warning"]
    assert [mediator["name"] for mediator in a.get("/api/mediators").json()] == ["Ravi"]
    assert [deal["product"] for deal in a.get("/api/deals").json()["items"]] == ["Keep this"]
    assert a.post(f"/api/import/jobs/{job['id']}/undo").status_code == 409


def test_import_jobs_and_duplicate_detection_are_isolated_in_rls(api, user_ctx):
    a, _ = api("alice")
    b, b_id = api("bob")
    import_id = uuid.uuid4()
    a_job = a.post("/api/import/commit", json=commit_body(import_id, [row(mediator="Ravi-Kumar")])).json()

    a_preview = a.post("/api/import/preview", json=request_rows([row(mediator="Ravi Kumar")])).json()
    b_preview = b.post("/api/import/preview", json=request_rows([row(mediator="Ravi Kumar")])).json()
    assert a_preview["rows"][0]["status"] == "duplicate"
    name_match = a.post("/api/import/preview", json=request_rows([
        row("Different product", mediator="Ravi Kumar"),
    ])).json()
    assert name_match["existing_mediators"] == [{"input_name": "Ravi Kumar", "existing_name": "Ravi-Kumar"}]
    assert name_match["mediators_to_create"] == []
    assert b_preview["rows"][0]["status"] == "ok"
    assert b_preview["mediators_to_create"] == ["Ravi Kumar"]
    assert b.get("/api/import/jobs").json() == []
    assert b.get(f"/api/import/jobs/{a_job['id']}").status_code == 404
    assert b.get(f"/api/import/jobs/{a_job['id']}/errors.csv").status_code == 404
    assert b.post(f"/api/import/jobs/{a_job['id']}/undo").status_code == 404

    # The same client import id is independent per owner, and B cannot attach a deal to A's job.
    b_job = b.post("/api/import/commit", json=commit_body(import_id, [row(mediator="Ravi Kumar")])).json()
    assert b_job["id"] != a_job["id"]
    with user_ctx(b_id) as session:
        assert session.execute(text("SELECT count(*) FROM import_jobs")).scalar_one() == 1
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.execute(text("""
                    INSERT INTO deals (user_id, product, date_taken, import_job_id)
                    VALUES (:user_id, 'Cross-owner', '2026-11-08', :job_id)
                """), {"user_id": b_id, "job_id": uuid.UUID(a_job["id"])})


def test_body_and_row_limits_and_formula_neutralization(client, api):
    too_large = b"x" * (5 * 1024 * 1024 + 1)
    response = client.post("/api/import/preview", content=too_large,
                           headers={"X-Requested-With": "dealtracker"})
    assert response.status_code == 413
    a, _ = api("alice")
    too_many = a.post("/api/import/preview", json={"rows": [{}] * 5001})
    assert too_many.status_code == 422
    assert safe_csv_cell("=1+1") == "'=1+1"
    assert safe_csv_cell("+SUM(A1:A2)") == "'+SUM(A1:A2)"
    assert safe_csv_cell("-1+2") == "'-1+2"
    assert safe_csv_cell("@SUM(A1)") == "'@SUM(A1)"
    assert safe_csv_cell("normal") == "normal"


def test_user_rate_limiter_enforces_window_per_user(api, monkeypatch):
    a, _ = api("alice")
    import_rate_limiter.clear()
    monkeypatch.setattr("app.routes.imports.get_settings", lambda: SimpleNamespace(RATE_LIMIT_ENABLED=True))
    body = request_rows([{"product": "x", "date_taken": "2026-11-08", "amount_paid": "1"}])
    for _ in range(30):
        assert a.post("/api/import/preview", json=body).status_code == 200
    assert a.post("/api/import/preview", json=body).status_code == 429

    commit = commit_body(uuid.uuid4(), body["rows"])
    for _ in range(10):
        assert a.post("/api/import/commit", json=commit).status_code == 200
    assert a.post("/api/import/commit", json=commit).status_code == 429
    import_rate_limiter.clear()


def test_import_rate_limiter_uses_a_sliding_window_per_owner():
    limiter = UserWindowRateLimiter()
    alice, bob = uuid.uuid4(), uuid.uuid4()
    limiter.consume(alice, "preview", 1, 3600, now=0)
    with pytest.raises(AppError) as exc:
        limiter.consume(alice, "preview", 1, 3600, now=10)
    assert exc.value.code == "rate_limited"
    limiter.consume(bob, "preview", 1, 3600, now=10)
    limiter.consume(alice, "preview", 1, 3600, now=3600)
