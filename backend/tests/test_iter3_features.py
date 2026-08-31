"""
Iteration 3 backend tests:
- /api/reports/utilization (default month, historical empty, invalid formats)
- /api/uploads returns public_url; /api/public-files works w/o auth; /api/files needs auth
"""
import io
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

SUPERADMIN = {"email": "j45t1n0505@gmail.com", "password": "SanyAdmin2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(SUPERADMIN)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Utilization Report ----------

def test_utilization_current_month(admin_token):
    r = requests.get(f"{API}/reports/utilization", headers=H(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "month" in j and len(j["month"]) == 7
    totals = j["totals"]
    for k in ("working_hours", "idle_hours", "avg_utilization_pct", "billable_amount", "units"):
        assert k in totals, f"missing totals.{k}"
    assert isinstance(j["rows"], list) and len(j["rows"]) > 0
    row = j["rows"][0]
    for k in ("hm_start", "hm_end", "working_hours", "idle_hours", "utilization_pct"):
        assert k in row, f"missing row.{k}"


def test_utilization_historical_no_data(admin_token):
    r = requests.get(f"{API}/reports/utilization?month=2020-01", headers=H(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["month"] == "2020-01"
    assert j["totals"]["working_hours"] == 0
    assert j["totals"]["idle_hours"] == 0
    assert j["totals"]["billable_amount"] == 0
    # rows still present per unit with zeros
    assert len(j["rows"]) > 0
    assert all(r0["working_hours"] == 0 and r0["idle_hours"] == 0 for r0 in j["rows"])


def test_utilization_invalid_month_abc(admin_token):
    r = requests.get(f"{API}/reports/utilization?month=abc", headers=H(admin_token), timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


def test_utilization_invalid_month_9999(admin_token):
    r = requests.get(f"{API}/reports/utilization?month=2026-99", headers=H(admin_token), timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


def test_utilization_requires_auth():
    r = requests.get(f"{API}/reports/utilization", timeout=30)
    assert r.status_code in (401, 403)


# ---------- Uploads / public files ----------

PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xcf"
    b"\xc0P\x0f\x00\x03\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(scope="module")
def uploaded(admin_token):
    files = {"file": ("test.png", io.BytesIO(PNG_1x1), "image/png")}
    r = requests.post(f"{API}/uploads", headers=H(admin_token), files=files, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_upload_returns_public_url(uploaded):
    assert "path" in uploaded
    assert "url" in uploaded
    assert "public_url" in uploaded
    assert uploaded["public_url"].startswith("/api/public-files/")
    assert uploaded["url"].startswith("/api/files/")


def test_public_file_no_auth(uploaded):
    r = requests.get(f"{BASE_URL}{uploaded['public_url']}", timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("image/")
    assert len(r.content) == len(PNG_1x1)


def test_private_file_requires_auth(uploaded):
    r = requests.get(f"{BASE_URL}{uploaded['url']}", timeout=30)
    assert r.status_code == 401


def test_private_file_with_auth(admin_token, uploaded):
    r = requests.get(f"{BASE_URL}{uploaded['url']}", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
