"""Per-user isolation: every test here runs as the restricted app_user role, never the owner."""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.repos import DealRepo, MediatorRepo
from app.schemas import DealCreate, MediatorCreate


def _seed(user_ctx, uid):
    with user_ctx(uid) as s:
        med = MediatorRepo(s).create(MediatorCreate(name="Ravi Deals", contact="+91 90000 00000"))
        deal = DealRepo(s).create(
            DealCreate(
                product="Boat Airdopes",
                platform="Amazon",
                mediator_id=med.id,
                date_taken=date(2026, 6, 1),
                amount_paid=Decimal("1299.00"),
                refund_amount=Decimal("1299.00"),
                commission=Decimal("50.00"),
            )
        )
        DealRepo(s).create(DealCreate(product="Phone case", date_taken=date(2026, 6, 2)))
        return med.id, deal.id


def test_runs_as_restricted_app_user(app_session_factory):
    with app_session_factory() as s:
        row = s.execute(
            text(
                "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
            )
        ).one()
    assert tuple(row) == ("app_user", False, False)


def test_owner_sees_own_rows_and_money_is_exact(user_ctx, make_user):
    a, _ = make_user("alice")
    _seed(user_ctx, a)
    with user_ctx(a) as s:
        deals = DealRepo(s).list()
        assert len(deals) == 2
        assert all(d.user_id == a for d in deals)
        top = next(d for d in deals if d.product == "Boat Airdopes")
        assert top.amount_paid == Decimal("1299.00") and isinstance(top.amount_paid, Decimal)
        assert len(MediatorRepo(s).list()) == 1


def test_1_other_user_sees_nothing(user_ctx, make_user):
    a, _ = make_user("alice")
    b, _ = make_user("bob")
    med_id, deal_id = _seed(user_ctx, a)
    with user_ctx(b) as s:
        assert DealRepo(s).list() == []
        assert MediatorRepo(s).list() == []
        assert DealRepo(s).get(deal_id) is None
        assert MediatorRepo(s).get(med_id) is None
        # Even a raw query without the repo's extra filter is blocked by RLS.
        assert s.execute(text("SELECT count(*) FROM deals")).scalar_one() == 0
        assert s.execute(
            text("SELECT count(*) FROM deals WHERE id = :id"), {"id": deal_id}
        ).scalar_one() == 0


def test_2_no_context_returns_zero_rows(user_ctx, make_user, app_session_factory):
    a, _ = make_user("alice")
    _seed(user_ctx, a)
    with user_ctx(None) as s:
        assert s.execute(text("SELECT count(*) FROM deals")).scalar_one() == 0
        assert s.execute(text("SELECT count(*) FROM mediators")).scalar_one() == 0
        assert DealRepo(s).list() == []
    with app_session_factory() as s, s.begin():
        s.execute(text("SELECT set_config('app.current_user_id', '', true)"))
        assert s.execute(text("SELECT count(*) FROM deals")).scalar_one() == 0


def test_2b_no_context_rejects_writes(user_ctx, make_user):
    a, _ = make_user("alice")
    with pytest.raises(DBAPIError):
        with user_ctx(None) as s:
            s.execute(
                text("INSERT INTO deals (user_id, product, date_taken) VALUES (:u, 'x', current_date)"),
                {"u": a},
            )
    with pytest.raises(DBAPIError):
        with user_ctx(None) as s:
            DealRepo(s).create(DealCreate(product="x", date_taken=date(2026, 6, 1)))


def test_3_insert_for_another_user_fails_with_check(user_ctx, make_user):
    a, _ = make_user("alice")
    b, _ = make_user("bob")
    with pytest.raises(DBAPIError, match="row-level security"):
        with user_ctx(b) as s:
            s.execute(
                text("INSERT INTO deals (user_id, product, date_taken) VALUES (:u, 'x', current_date)"),
                {"u": a},
            )
    with pytest.raises(DBAPIError, match="row-level security"):
        with user_ctx(b) as s:
            s.execute(text("INSERT INTO mediators (user_id, name) VALUES (:u, 'M')"), {"u": a})


def test_3b_cannot_move_own_row_to_another_user(user_ctx, make_user):
    a, _ = make_user("alice")
    b, _ = make_user("bob")
    _, deal_id = _seed(user_ctx, b)
    with pytest.raises(DBAPIError, match="row-level security"):
        with user_ctx(b) as s:
            s.execute(text("UPDATE deals SET user_id = :a WHERE id = :id"), {"a": a, "id": deal_id})


def test_3c_cannot_reference_another_users_mediator(user_ctx, make_user):
    a, _ = make_user("alice")
    b, _ = make_user("bob")
    a_med, _ = _seed(user_ctx, a)
    with pytest.raises(DBAPIError, match="foreign key"):
        with user_ctx(b) as s:
            DealRepo(s).create(
                DealCreate(product="x", date_taken=date(2026, 6, 1), mediator_id=a_med)
            )


def test_4_update_and_delete_on_other_users_rows_affect_nothing(user_ctx, make_user):
    a, _ = make_user("alice")
    b, _ = make_user("bob")
    med_id, deal_id = _seed(user_ctx, a)
    with user_ctx(b) as s:
        assert s.execute(
            text("UPDATE deals SET product = 'hacked' WHERE id = :id"), {"id": deal_id}
        ).rowcount == 0
        assert s.execute(text("UPDATE deals SET notes = 'x'")).rowcount == 0
        assert s.execute(text("DELETE FROM deals WHERE id = :id"), {"id": deal_id}).rowcount == 0
        assert s.execute(text("DELETE FROM mediators WHERE id = :id"), {"id": med_id}).rowcount == 0
    with user_ctx(a) as s:
        assert DealRepo(s).get(deal_id).product == "Boat Airdopes"
        assert MediatorRepo(s).get(med_id) is not None


def test_5_deleting_user_cascades(user_ctx, make_user, app_session_factory):
    from app.auth import service

    a, _ = make_user("alice")
    b, _ = make_user("bob")
    _seed(user_ctx, a)
    _seed(user_ctx, b)
    service.delete_user(a)
    with user_ctx(a) as s:
        assert s.execute(text("SELECT count(*) FROM deals")).scalar_one() == 0
        assert s.execute(text("SELECT count(*) FROM mediators")).scalar_one() == 0
    with app_session_factory() as s:
        assert s.execute(text("SELECT count(*) FROM users WHERE id = :u"), {"u": a}).scalar_one() == 0
        assert s.execute(
            text("SELECT count(*) FROM sessions WHERE user_id = :u"), {"u": a}
        ).scalar_one() == 0
    with user_ctx(b) as s:  # the other user is untouched
        assert len(DealRepo(s).list()) == 2


def test_updated_at_trigger_and_soft_delete(user_ctx, make_user):
    a, _ = make_user("alice")
    _, deal_id = _seed(user_ctx, a)
    with user_ctx(a) as s:
        before = DealRepo(s).get(deal_id).updated_at
    with user_ctx(a) as s:
        s.execute(text("UPDATE deals SET notes = 'n' WHERE id = :id"), {"id": deal_id})
        after = s.execute(text("SELECT updated_at FROM deals WHERE id = :id"), {"id": deal_id}).scalar_one()
        assert after > before
        s.execute(text("UPDATE deals SET deleted_at = now() WHERE id = :id"), {"id": deal_id})
        assert DealRepo(s).get(deal_id) is None
        assert len(DealRepo(s).list()) == 1
