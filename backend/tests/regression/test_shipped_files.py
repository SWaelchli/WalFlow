"""Shipped diagrams are format 0.2, carry no stored results and give heat exchangers an explicit rated dP."""
from walflow_paths import DATA_DIR, NGINX_CONF, INDEX_HTML
import pytest


import glob
import json
import os
import re

import pytest

DATA_DIR = DATA_DIR
FILES = sorted(glob.glob(os.path.join(DATA_DIR, "examples", "*.wlf"))) + [os.path.join(DATA_DIR, "GreetingCanvas.wlf")]
RESULT_KEYS = {"telemetry", "telemetry_unmitigated", "telemetry_peak", "kpis", "stats", "result_hash", "_scalingInfo"}


@pytest.mark.parametrize("path", FILES, ids=[os.path.basename(p) for p in FILES])
def test_shipped_file_is_current_format_without_results(path):
    data = json.load(open(path, encoding="utf-8"))
    assert data["version"] == "0.2"
    assert data["app_version"] == "0.2.0"
    for node in data["nodes"]:
        assert "telemetry" not in node["data"]
        if node["type"] == "heat_exchanger":
            assert node["data"].get("rated_dp_bar", 0) > 0
            assert "k_factor" not in node["data"]
    for edge in data["edges"]:
        assert "telemetry" not in (edge.get("data") or {})
    for case in data.get("cases", []):
        assert not (RESULT_KEYS & set(case))


# ---------------------------------------------------------------- web server hardening
def _nginx():
    return open(NGINX_CONF, encoding="utf-8").read()


def _server_level(text):
    """The server block with every `location { ... }` block removed (no nested braces inside a location here)."""
    return re.sub(r"location\s+[^{]*\{[^}]*\}", "", text)


def _header(text, name):
    m = re.search(rf"add_header\s+{re.escape(name)}\s+(.+?)\s+always\s*;", text, re.S)
    return m.group(1) if m else None


def _csp_directive(name):
    value = (_header(_server_level(_nginx()), "Content-Security-Policy") or "").strip("\"' ")
    for part in value.split(";"):
        words = part.split()
        if words and words[0] == name:
            return words[1:]
    return None


def _scripts_without_src():
    html = open(INDEX_HTML, encoding="utf-8").read()
    return [t for t in re.findall(r"<script[^>]*>", html, re.I) if not re.search(r"src\s*=", t, re.I)]


def _location_headers():
    return re.findall(r"location\s+[^{]*\{[^}]*add_header[^}]*\}", _nginx())


@pytest.mark.parametrize("check, expected", [
    *[pytest.param(lambda n=n: _header(_server_level(_nginx()), n) is not None, True, id=f"server_level_{n.lower()}_always")
      for n in ("Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options",
                "Referrer-Policy", "Permissions-Policy")],
    pytest.param(lambda: bool(re.search(r"^\s*server_tokens\s+off\s*;", _server_level(_nginx()), re.M)), True, id="server_tokens_off"),
    pytest.param(lambda: _csp_directive("script-src"), ["'self'"], id="csp_scripts_only_from_self"),
    pytest.param(lambda: _csp_directive("object-src"), ["'none'"], id="csp_no_plugins"),
    pytest.param(lambda: _csp_directive("frame-ancestors"), ["'none'"], id="csp_no_framing"),
    pytest.param(lambda: [s for s in (_csp_directive("img-src") or ["http:"]) if s in ("*", "http:", "https:")], [], id="csp_images_not_from_any_host"),
    pytest.param(_scripts_without_src, [], id="index_html_has_no_inline_script"),
    pytest.param(_location_headers, [], id="no_location_overrides_server_headers"),
])
def test_web_server_security_headers(check, expected):
    assert check() == expected
