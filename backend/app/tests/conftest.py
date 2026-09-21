import os

import pytest

from backend.app.core.config import Settings


def pytest_configure() -> None:
    test_database_url = os.getenv("TEST_DATABASE_URL", "").strip()
    configured_database_url = Settings().database_url.strip()
    if not test_database_url:
        pytest.exit("TEST_DATABASE_URL must be set when running backend tests", returncode=2)
    if configured_database_url and test_database_url == configured_database_url:
        pytest.exit("TEST_DATABASE_URL must differ from DATABASE_URL", returncode=2)
    os.environ["DATABASE_URL"] = test_database_url