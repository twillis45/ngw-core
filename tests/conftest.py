"""Global pytest configuration — sets required env vars before any app import."""
import os

# Must be set before main.py / auth/security.py is imported, otherwise the
# RuntimeError("NGW_JWT_SECRET is not set...") fires at collection time.
os.environ.setdefault("NGW_JWT_SECRET", "test-secret-value-for-pytest-not-for-production")

# NOTE: NGW_DEV_MODE is intentionally NOT set here globally.
# Tests that need to bypass auth (admin, shoot_mode) use app.dependency_overrides
# or unittest.mock.patch so that auth enforcement tests (test_lab.py) remain valid.
