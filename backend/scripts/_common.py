"""Shared helpers for the setup scripts (run from backend/ with the venv python)."""
import os
import sys
from pathlib import Path

from dotenv import dotenv_values

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

_FILE = {k: v for k, v in dotenv_values(BACKEND / ".env").items() if v}


def env(name: str) -> str | None:
    return os.environ.get(name) or _FILE.get(name)


def psycopg_url(url: str) -> str:
    """psycopg.connect wants postgresql://, not the SQLAlchemy postgresql+psycopg:// form."""
    return url.replace("postgresql+psycopg://", "postgresql://", 1)
