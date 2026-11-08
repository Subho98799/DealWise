"""Guards the single data-access layer: route handlers may only reach deals/mediators through app.repos."""
import ast
import re
from pathlib import Path

ROUTES_DIR = Path(__file__).resolve().parents[1] / "app" / "routes"

FORBIDDEN_IMPORT_NAMES = {"Deal", "Mediator", "SessionLocal", "engine", "Session", "text",
                          "select", "insert", "update", "delete"}
FORBIDDEN_MODULES = {"sqlalchemy", "sqlalchemy.orm", "app.models", "psycopg"}
FORBIDDEN_CALL_ATTRS = {"execute", "scalars", "scalar", "query", "add", "add_all", "merge"}
RAW_SQL = re.compile(r"\b(from|into|update|join)\s+(deals|mediators)\b", re.IGNORECASE)


def _violations(path: Path) -> list[str]:
    src = path.read_text()
    tree = ast.parse(src)
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if any(mod == m or mod.startswith(m + ".") for m in FORBIDDEN_MODULES):
                out.append(f"imports from {mod}")
            if mod == "app.db":
                bad = {a.name for a in node.names} & FORBIDDEN_IMPORT_NAMES
                if bad:
                    out.append(f"imports {bad} from app.db")
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name in FORBIDDEN_MODULES:
                    out.append(f"imports {a.name}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in FORBIDDEN_CALL_ATTRS:
                out.append(f"calls .{node.func.attr}()")
    if RAW_SQL.search(src):
        out.append("contains raw SQL on deals/mediators")
    return [f"{path.name}: {v}" for v in out]


def test_routes_never_touch_tables_directly():
    files = sorted(ROUTES_DIR.rglob("*.py"))
    assert files, "no route files found"
    problems = [v for f in files for v in _violations(f)]
    assert problems == [], "Route handlers must use app.repos only:\n" + "\n".join(problems)


def test_scanner_catches_violations(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text(
        "from app.models import Deal\nfrom sqlalchemy import select\n"
        "def h(db):\n    return db.execute(select(Deal))\n"
        "Q = 'SELECT * FROM deals'\n"
    )
    found = _violations(bad)
    assert len(found) == 4
