"""F3-19 / F0-03: the backend and frontend `constants` files, package.json and AGENTS.md state the same versions."""
from walflow_paths import REPO_ROOT
import pytest

pytestmark = pytest.mark.audit("F3-19", "F0-03")

import json
import os
import re

from constants import APP_VERSION, FILE_FORMAT_VERSION, FILE_EXTENSION

ROOT = REPO_ROOT


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def frontend_constant(name):
    return re.search(rf"export const {name}\s*=\s*'([^']*)'", read("frontend", "src", "constants.js")).group(1)


def test_backend_constants_equal_frontend_constants():
    assert APP_VERSION == frontend_constant("APP_VERSION")
    assert FILE_FORMAT_VERSION == frontend_constant("FILE_FORMAT_VERSION")
    assert FILE_EXTENSION == frontend_constant("FILE_EXTENSION")


def test_package_json_version_equals_app_version():
    assert json.loads(read("frontend", "package.json"))["version"] == APP_VERSION


def test_major_digits_of_app_and_file_format_version_match():
    assert APP_VERSION.split(".")[0] == FILE_FORMAT_VERSION.split(".")[0]


def test_agents_md_states_the_current_versions():
    agents = read("AGENTS.md")
    assert f"current app version is `{APP_VERSION}`" in agents
    assert f"current file format version is `{FILE_FORMAT_VERSION}`" in agents


def test_app_reports_the_shared_version():
    import main
    assert main.app.version == APP_VERSION
