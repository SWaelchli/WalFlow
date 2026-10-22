"""Shared test setup: isolated temp database for the whole session.

DATABASE_PATH must be set before `db.database` is first imported (the engine
is created at import time), so this happens at conftest import, not in a fixture.
"""
import atexit
import os
import shutil
import tempfile

_TMP_DIR = tempfile.mkdtemp(prefix="walflow_tests_")
os.environ["DATABASE_PATH"] = os.path.join(_TMP_DIR, "test.db")
atexit.register(shutil.rmtree, _TMP_DIR, ignore_errors=True)


# Property tests (hypothesis). "default" is deterministic (same examples on every run and machine), so
# the gate never flakes. "explore" draws fresh random examples in bulk to hunt for new failures:
#   HYPOTHESIS_PROFILE=explore python -m pytest -m property
from hypothesis import settings

settings.register_profile("default", max_examples=60, derandomize=True, deadline=None, print_blob=True)
settings.register_profile("explore", max_examples=2000, derandomize=False, deadline=None, print_blob=True)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "default"))


# Every test gets its layer marker from the folder it lives in, so `pytest -m unit` etc. work
# without per-file boilerplate.
_LAYER_MARKERS = {"unit": "unit", "scenarios": "scenario", "regression": "regression", "api": "api", "bench": "bench"}


def pytest_collection_modifyitems(items):
    import pytest
    for item in items:
        parts = item.path.relative_to(os.path.dirname(os.path.abspath(__file__))).parts
        marker = _LAYER_MARKERS.get(parts[0])
        if marker:
            item.add_marker(getattr(pytest.mark, marker))
        if getattr(getattr(item, "obj", None), "is_hypothesis_test", False):
            item.add_marker(pytest.mark.property)
