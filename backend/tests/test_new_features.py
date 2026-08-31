"""
Backend tests for new features: tracking/telemetry, geofencing, alerts,
service requests, part orders, RCS. Uses external URL from env.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sany-fleet-manager.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPERADMIN = {"email": "j45t1n0505@gmail.com", "password": "SanyAdmin2026!"}
SALES = {"email": "sales@sanyperkasa.co.id", "password": "SalesPass2026!"}
WAREHOUSE = {"email": "warehouse@sanyperkasa.co.id", "password": "WarehousePass2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(SUPERADMIN)


@pytest.fixture(scope="module")
def sales_token():
    return _login(SALES)


@pytest.fixture(scope="module")
def wh_token():
    return _login(WAREHOUSE)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Tracking / Telemetry ----------

def test_tracking_units_returns_state(admin_token):
    r = requests.get(f"{API}/tracking/units", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "expected units with telemetry state"
    u = data[0]
    for k in ("unit_id", "name", "lat", "lng", "hm", "engine_on"):
        assert k in u, f"missing key {k} in tracking unit"


def test_tracking_history_ordered(admin_token):
    units = requests.get(f"{API}/tracking/units", headers=H(admin_token)).json()
    uid = units[0]["unit_id"]
    r = requests.get(f"{API}/tracking/units/{uid}/history", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    hist = r.json()
    assert isinstance(hist, list)
    if len(hist) >= 2:
        # ascending by recorded_at (endpoint reverses to ascending)
        assert hist[0]["recorded_at"] <= hist[-1]["recorded_at"]


def test_telemetry_ingest_creates_point(admin_token):
    units = requests.get(f"{API}/tracking/units", headers=H(admin_token)).json()
    uid = units[0]["unit_id"]
    before = len(requests.get(f"{API}/tracking/units/{uid}/history?limit=500", headers=H(admin_token)).json())
    payload = {"unit_id": uid, "lat": -6.20, "lng": 106.80, "hm": 999.9,
               "speed": 5, "heading": 90, "engine_on": True, "fuel_pct": 55}
    r = requests.post(f"{API}/telemetry/ingest", headers=H(admin_token), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    pt = r.json()
    assert pt["lat"] == -6.20 and pt["lng"] == 106.80
    after = len(requests.get(f"{API}/tracking/units/{uid}/history?limit=500", headers=H(admin_token)).json())
    assert after >= before + 1


# ---------- Geofencing + Alerts ----------

@pytest.fixture(scope="module")
def created_geofence(sales_token, admin_token):
    # small radius near Jakarta, we'll ingest telemetry outside to trigger exit
    payload = {"name": "TEST_FENCE", "unit_id": None,
               "center_lat": -6.1751, "center_lng": 106.8650,
               "radius_m": 100, "alert_on": "both", "active": True}
    r = requests.post(f"{API}/geofences", headers=H(sales_token), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    gf = r.json()
    yield gf
    requests.delete(f"{API}/geofences/{gf['id']}", headers=H(sales_token))


def test_geofence_crud(sales_token, created_geofence):
    gid = created_geofence["id"]
    # list
    r = requests.get(f"{API}/geofences", headers=H(sales_token))
    assert r.status_code == 200
    assert any(g["id"] == gid for g in r.json())
    # update
    upd = {**created_geofence, "radius_m": 150}
    upd.pop("id", None); upd.pop("created_at", None)
    r = requests.put(f"{API}/geofences/{gid}", headers=H(sales_token), json=upd)
    assert r.status_code == 200
    assert r.json()["radius_m"] == 150


def test_warehouse_can_create_geofence(wh_token):
    payload = {"name": "TEST_FENCE_WH", "unit_id": None,
               "center_lat": 0.0, "center_lng": 0.0, "radius_m": 500,
               "alert_on": "both", "active": True}
    r = requests.post(f"{API}/geofences", headers=H(wh_token), json=payload)
    assert r.status_code == 200
    gid = r.json()["id"]
    requests.delete(f"{API}/geofences/{gid}", headers=H(wh_token))


def test_geofence_exit_triggers_alert(admin_token, created_geofence):
    units = requests.get(f"{API}/tracking/units", headers=H(admin_token)).json()
    uid = units[0]["unit_id"]
    # First ping inside the fence to establish "inside" state
    inside = {"unit_id": uid, "lat": -6.1751, "lng": 106.8650, "hm": 100,
              "speed": 0, "heading": 0, "engine_on": True}
    r1 = requests.post(f"{API}/telemetry/ingest", headers=H(admin_token), json=inside)
    assert r1.status_code == 200
    # Then move far away → should exit
    outside = {"unit_id": uid, "lat": 0.0, "lng": 0.0, "hm": 101,
               "speed": 30, "heading": 0, "engine_on": True}
    r2 = requests.post(f"{API}/telemetry/ingest", headers=H(admin_token), json=outside)
    assert r2.status_code == 200
    time.sleep(1)
    alerts = requests.get(f"{API}/alerts", headers=H(admin_token)).json()
    hit = [a for a in alerts if a.get("geofence_id") == created_geofence["id"] and a.get("unit_id") == uid and a.get("event") == "exit"]
    assert len(hit) >= 1, f"expected exit alert for fence, got {alerts[:3]}"


def test_alerts_read_flow(admin_token):
    alerts = requests.get(f"{API}/alerts?unread_only=true", headers=H(admin_token)).json()
    if not alerts:
        pytest.skip("no unread alerts")
    aid = alerts[0]["id"]
    r = requests.post(f"{API}/alerts/{aid}/read", headers=H(admin_token))
    assert r.status_code == 200
    # read-all
    r = requests.post(f"{API}/alerts/read-all", headers=H(admin_token))
    assert r.status_code == 200
    unread_after = requests.get(f"{API}/alerts?unread_only=true", headers=H(admin_token)).json()
    assert unread_after == [] or len(unread_after) == 0


# ---------- Service Requests ----------

@pytest.fixture(scope="module")
def service_ticket(admin_token):
    units = requests.get(f"{API}/units", headers=H(admin_token)).json()
    uid = units[0]["id"]
    payload = {"unit_id": uid, "issue_type": "engine", "priority": "high",
               "description": "TEST_ pengujian otomatis"}
    r = requests.post(f"{API}/service-requests", headers=H(admin_token), json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_service_create(service_ticket):
    assert service_ticket["status"] == "submitted"
    assert service_ticket["ticket_no"].startswith("SVC-")


def test_service_rating_before_completion_rejected(admin_token, service_ticket):
    sid = service_ticket["id"]
    r = requests.put(f"{API}/service-requests/{sid}/rating",
                     headers=H(admin_token), json={"rating": 5, "review": "x"})
    assert r.status_code == 400


def test_service_assign_and_status_and_rating(admin_token, wh_token, service_ticket):
    sid = service_ticket["id"]
    # assign
    r = requests.put(f"{API}/service-requests/{sid}/assign",
                     headers=H(wh_token), params={"technician_name": "Agus Priyanto"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "assigned"
    # invalid status
    r = requests.put(f"{API}/service-requests/{sid}/status",
                     headers=H(wh_token), params={"status": "BOGUS"})
    assert r.status_code == 400
    # advance to completed
    for s in ["on_the_way", "in_progress", "completed"]:
        r = requests.put(f"{API}/service-requests/{sid}/status",
                         headers=H(wh_token), params={"status": s})
        assert r.status_code == 200, f"{s}: {r.text}"
    # rating out of range
    r = requests.put(f"{API}/service-requests/{sid}/rating",
                     headers=H(admin_token), json={"rating": 9})
    assert r.status_code == 400
    # valid rating
    r = requests.put(f"{API}/service-requests/{sid}/rating",
                     headers=H(admin_token), json={"rating": 4, "review": "ok"})
    assert r.status_code == 200
    assert r.json()["rating"] == 4
    assert r.json()["status"] == "closed"


# ---------- Part Orders ----------

def test_part_order_flow(admin_token, wh_token):
    sp = requests.get(f"{API}/spareparts", headers=H(admin_token)).json()
    assert sp, "need seeded spareparts"
    part = sp[0]
    payload = {"sparepart_id": part["id"], "quantity": 3,
               "destination": "TEST_ Jakarta Warehouse", "notes": "TEST"}
    r = requests.post(f"{API}/part-orders", headers=H(admin_token), json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    expected_subtotal = part["unit_price"] * 3
    assert o["subtotal"] == expected_subtotal
    assert o["tax"] == round(expected_subtotal * 0.11, 2)
    assert o["total"] == round(expected_subtotal + o["tax"], 2)
    assert o["tracking_no"] and o["eta"]
    oid = o["id"]

    # invalid status
    r = requests.put(f"{API}/part-orders/{oid}/status", headers=H(wh_token), params={"status": "BOGUS"})
    assert r.status_code == 400
    # advance
    for s in ["packed", "shipped", "in_transit", "delivered"]:
        r = requests.put(f"{API}/part-orders/{oid}/status", headers=H(wh_token), params={"status": s})
        assert r.status_code == 200, f"{s}: {r.text}"


# ---------- RCS ----------

def test_rcs_flow(admin_token):
    r = requests.post(f"{API}/rcs/sessions", headers=H(admin_token),
                      json={"topic": "TEST_ konsultasi", "mode": "video",
                            "description": "test"})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["room_url"].startswith("https://meet.jit.si/")
    sid = s["id"]
    # message
    r = requests.post(f"{API}/rcs/sessions/{sid}/messages", headers=H(admin_token),
                      json={"text": "halo"})
    assert r.status_code == 200
    # empty message rejected
    r = requests.post(f"{API}/rcs/sessions/{sid}/messages", headers=H(admin_token), json={"text": ""})
    assert r.status_code == 400
    # status
    r = requests.put(f"{API}/rcs/sessions/{sid}/status", headers=H(admin_token), params={"status": "live"})
    assert r.status_code == 200
    r = requests.put(f"{API}/rcs/sessions/{sid}/status", headers=H(admin_token), params={"status": "BOGUS"})
    assert r.status_code == 400


# ---------- Role checks ----------

def test_warehouse_can_update_service_status(admin_token, wh_token):
    units = requests.get(f"{API}/units", headers=H(admin_token)).json()
    r = requests.post(f"{API}/service-requests", headers=H(admin_token),
                      json={"unit_id": units[0]["id"], "issue_type": "electrical",
                            "priority": "normal", "description": "TEST_ role check"})
    sid = r.json()["id"]
    r = requests.put(f"{API}/service-requests/{sid}/status", headers=H(wh_token), params={"status": "on_the_way"})
    assert r.status_code == 200
