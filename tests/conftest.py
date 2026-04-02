"""Global pytest configuration — sets required env vars before any app import."""
import os

# Must be set before main.py / auth/security.py is imported, otherwise the
# RuntimeError("NGW_JWT_SECRET is not set...") fires at collection time.
os.environ.setdefault("NGW_JWT_SECRET", "test-secret-value-for-pytest-not-for-production")

# Force NGW_DEV_MODE=0 in tests so load_dotenv() (called inside main.py) cannot
# activate dev-mode auth.  Tests that need to act as an authenticated user use
# app.dependency_overrides instead (see test_admin.py, test_shoot_match.py).
# Without this, .env's NGW_DEV_MODE=1 makes get_optional_user return a dev-mode
# user whose accumulated analysis count (user:dev-mode) triggers the paywall gate.
os.environ["NGW_DEV_MODE"] = "0"
