from datetime import datetime, timezone


def now() -> datetime:
    """Single clock for the app; tests monkeypatch this."""
    return datetime.now(timezone.utc)
