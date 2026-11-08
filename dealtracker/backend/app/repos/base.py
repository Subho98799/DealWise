from sqlalchemy import func
from sqlalchemy.dialects.postgresql import UUID

# The owner of every row is taken from the transaction-local setting, never from the caller.
CURRENT_USER_ID = func.nullif(func.current_setting("app.current_user_id", True), "").cast(
    UUID(as_uuid=True)
)
