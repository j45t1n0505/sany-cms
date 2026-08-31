"""Backend smoke test for SANY PERKASA CMS."""
import json
import sys
import requests
from datetime import datetime, timedelta

BASE = "https://sany-fleet-manager.preview.emergentagent.com/api"

CREDS = {
    "superadmin": {"email": "j45t1n0505@gmail.com", "password": "SanyAdmin2026!"},
    "sales":      {"email": "sales@sanyperkasa.co.id", "password": "SalesPass2026!"},
    "warehouse":  {"email": "warehouse@sanyperkasa.co.id", "password": "WarehousePass2026!"},
}

results = {"passed": [], "failed": []}

def ok(name):
    print(f"[PASS] {name}")
    results["passed"].append(name)

def fail(name, evidence):
    print(f"[FAIL] {name}: {evidence}")
    results["failed"].append({"area": name, "evidence": str(evidence)[:400]})

def login(role):
    r = requests.post(f"{BASE}/auth/login", json=CREDS[role], timeout=15)
    if r.status_code != 200:
        fail(f"login-{role}", f"status={r.status_code} body={r.text[:200]}")
        return None
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        fail(f"login-{role} token", f"no token in {list(data)}")
        return None
    ok(f"login-{role} returns token and user (role={data.get('user',{}).get('role')})")
    return token

def H(t): return {"Authorization": f"Bearer {t}"}

# ---- AUTH ----
tokens = {}
for r in ["superadmin", "sales", "warehouse"]:
    tokens[r] = login(r)

# wrong password
r = requests.post(f"{BASE}/auth/login", json={"email": CREDS["sales"]["email"], "password": "WRONG"})
if r.status_code == 401:
    ok("wrong password returns 401")
else:
    fail("wrong password", f"status={r.status_code}")

# GET /me
if tokens["superadmin"]:
    r = requests.get(f"{BASE}/auth/me", headers=H(tokens["superadmin"]))
    if r.status_code == 200 and r.json().get("email"):
        ok(f"GET /auth/me returns user email={r.json().get('email')}")
    else:
        fail("GET /auth/me", f"status={r.status_code} body={r.text[:200]}")

# ---- RBAC ----
# Warehouse cannot POST /api/units
if tokens["warehouse"]:
    body = {"name": "TestExc", "category": "Excavator", "model_code": "X1", "year": 2024, "price": 100.0}
    r = requests.post(f"{BASE}/units", json=body, headers=H(tokens["warehouse"]))
    if r.status_code == 403:
        ok("RBAC: warehouse POST /units -> 403")
    else:
        fail("RBAC warehouse POST /units", f"expected 403 got {r.status_code} body={r.text[:200]}")

# Sales CAN POST /units
created_unit_id = None
if tokens["sales"]:
    body = {
        "name": "SANY SY215C Test",
        "category": "Excavator",
        "model_code": "SY215C-T",
        "year": 2024,
        "price": 1500000000,
        "status": "available",
        "specs": {"weight": "21t", "power": "129kW"},
        "images": ["http://example.com/i.jpg"],
    }
    r = requests.post(f"{BASE}/units", json=body, headers=H(tokens["sales"]))
    if r.status_code in (200, 201):
        created_unit_id = r.json().get("id") or r.json().get("_id")
        ok(f"RBAC: sales POST /units -> {r.status_code} id={created_unit_id}")
    else:
        fail("RBAC sales POST /units", f"status={r.status_code} body={r.text[:300]}")

# SuperAdmin GET /users
if tokens["superadmin"]:
    r = requests.get(f"{BASE}/users", headers=H(tokens["superadmin"]))
    if r.status_code == 200:
        ok(f"RBAC: superadmin GET /users -> 200 count={len(r.json()) if isinstance(r.json(), list) else 'obj'}")
    else:
        fail("superadmin GET /users", f"status={r.status_code} body={r.text[:200]}")

# Sales cannot GET /users
if tokens["sales"]:
    r = requests.get(f"{BASE}/users", headers=H(tokens["sales"]))
    if r.status_code == 403:
        ok("RBAC: sales GET /users -> 403")
    else:
        fail("RBAC sales GET /users", f"expected 403 got {r.status_code}")

# ---- UNITS ----
r = requests.get(f"{BASE}/units", headers=H(tokens["superadmin"]))
units = []
if r.status_code == 200:
    units = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    if len(units) >= 6:
        ok(f"GET /units returns {len(units)} units (>=6)")
    else:
        fail("GET /units seed count", f"only {len(units)} units")
else:
    fail("GET /units", f"status={r.status_code}")

# public units
r = requests.get(f"{BASE}/units/public")
if r.status_code == 200:
    ok(f"GET /units/public -> 200 count={len(r.json()) if isinstance(r.json(), list) else 'obj'}")
else:
    fail("GET /units/public", f"status={r.status_code}")

# ---- SPAREPARTS ----
r = requests.get(f"{BASE}/spareparts", headers=H(tokens["superadmin"]))
spareparts = []
if r.status_code == 200:
    spareparts = r.json() if isinstance(r.json(), list) else []
    has_stock = spareparts and all("stock" in s and "min_stock" in s for s in spareparts[:3])
    if has_stock:
        ok(f"GET /spareparts returns {len(spareparts)} items with stock/min_stock")
    else:
        fail("GET /spareparts fields", f"missing stock/min_stock, sample={spareparts[:1]}")
else:
    fail("GET /spareparts", f"status={r.status_code}")

# Move stock (positive)
if spareparts:
    sp = spareparts[0]
    sp_id = sp.get("id") or sp.get("_id")
    old_stock = sp["stock"]
    body = {"sparepart_id": sp_id, "change": 5, "reason": "test add"}
    r = requests.post(f"{BASE}/spareparts/move", json=body, headers=H(tokens["superadmin"]))
    if r.status_code in (200, 201):
        ok(f"POST /spareparts/move +5 -> {r.status_code}")
        # verify
        r2 = requests.get(f"{BASE}/spareparts", headers=H(tokens["superadmin"]))
        new_sp = next((x for x in r2.json() if (x.get("id") or x.get("_id")) == sp_id), None)
        if new_sp and new_sp["stock"] == old_stock + 5:
            ok(f"stock increased {old_stock} -> {new_sp['stock']}")
        else:
            fail("stock not increased", f"old={old_stock} new={new_sp['stock'] if new_sp else 'n/a'}")
    else:
        fail("POST /spareparts/move +5", f"status={r.status_code} body={r.text[:300]}")

    # Negative move too large -> should 400
    body = {"sparepart_id": sp_id, "change": -999999, "reason": "test overflow"}
    r = requests.post(f"{BASE}/spareparts/move", json=body, headers=H(tokens["superadmin"]))
    if r.status_code == 400:
        ok("stock cannot go negative -> 400")
    else:
        fail("negative stock guard", f"expected 400 got {r.status_code} body={r.text[:200]}")

    # Moves history
    r = requests.get(f"{BASE}/spareparts/moves", headers=H(tokens["superadmin"]))
    if r.status_code == 200:
        ok(f"GET /spareparts/moves -> 200 count={len(r.json()) if isinstance(r.json(), list) else 'obj'}")
    else:
        fail("GET /spareparts/moves", f"status={r.status_code}")

# ---- CRM ----
r = requests.get(f"{BASE}/clients", headers=H(tokens["superadmin"]))
clients = []
if r.status_code == 200:
    clients = r.json() if isinstance(r.json(), list) else []
    if clients:
        ok(f"GET /clients count={len(clients)}")
    else:
        fail("GET /clients", "empty")
else:
    fail("GET /clients", f"status={r.status_code}")

# Interaction
if clients:
    cid = clients[0].get("id") or clients[0].get("_id")
    body = {"client_id": cid, "kind": "call", "summary": "smoke test call"}
    r = requests.post(f"{BASE}/interactions", json=body, headers=H(tokens["sales"] or tokens["superadmin"]))
    if r.status_code in (200, 201):
        ok(f"POST /interactions -> {r.status_code}")
    else:
        fail("POST /interactions", f"status={r.status_code} body={r.text[:300]}")

    r = requests.get(f"{BASE}/interactions", params={"client_id": cid}, headers=H(tokens["superadmin"]))
    if r.status_code == 200:
        items = r.json() if isinstance(r.json(), list) else []
        all_match = all((i.get("client_id") == cid) for i in items) if items else True
        if all_match:
            ok(f"GET /interactions?client_id filter works count={len(items)}")
        else:
            fail("interactions filter", "some items have different client_id")
    else:
        fail("GET /interactions filter", f"status={r.status_code}")

# ---- QUOTATIONS ----
if clients and created_unit_id:
    cid = clients[0].get("id") or clients[0].get("_id")
    body = {
        "client_id": cid,
        "lines": [
            {"item_type": "unit", "description": "Unit A", "quantity": 2, "unit_price": 1000000},
            {"item_type": "sparepart", "description": "Unit B", "quantity": 1, "unit_price": 500000},
        ],
    }
    r = requests.post(f"{BASE}/quotations", json=body, headers=H(tokens["sales"] or tokens["superadmin"]))
    if r.status_code in (200, 201):
        q = r.json()
        expected_sub = 2500000
        expected_tax = expected_sub * 0.11
        expected_total = expected_sub + expected_tax
        sub = q.get("subtotal")
        tax = q.get("tax")
        tot = q.get("total")
        qno = q.get("quote_no")
        if abs(sub - expected_sub) < 1 and abs(tax - expected_tax) < 1 and abs(tot - expected_total) < 1:
            ok(f"POST /quotations calc correct sub={sub} tax={tax} total={tot} quote_no={qno}")
        else:
            fail("quotations calc", f"sub={sub} tax={tax} total={tot} expected {expected_sub}/{expected_tax}/{expected_total}")
        if qno and qno.startswith("QT-"):
            ok(f"quote_no format {qno}")
        else:
            fail("quote_no format", f"got {qno}")

        qid = q.get("id") or q.get("_id")
        # update status
        r2 = requests.put(f"{BASE}/quotations/{qid}/status", params={"status": "accepted"},
                          headers=H(tokens["sales"] or tokens["superadmin"]))
        if r2.status_code in (200, 204):
            ok(f"PUT /quotations/{{id}}/status?status=accepted -> {r2.status_code}")
        else:
            fail("PUT quotation status", f"status={r2.status_code} body={r2.text[:200]}")
    else:
        fail("POST /quotations", f"status={r.status_code} body={r.text[:300]}")

# ---- RENTALS ----
if clients and created_unit_id:
    cid = clients[0].get("id") or clients[0].get("_id")
    start = datetime.utcnow().date().isoformat()
    end = (datetime.utcnow().date() + timedelta(days=5)).isoformat()
    body = {
        "unit_id": created_unit_id,
        "client_id": cid,
        "start_date": start,
        "end_date": end,
        "daily_rate": 1000000,
    }
    r = requests.post(f"{BASE}/rentals", json=body, headers=H(tokens["sales"] or tokens["superadmin"]))
    if r.status_code in (200, 201):
        rental = r.json()
        rid = rental.get("id") or rental.get("_id")
        days = rental.get("days")
        total = rental.get("total_amount")
        if days == 5 and total == 5000000:
            ok(f"POST /rentals days={days} total={total}")
        else:
            fail("rentals calc", f"days={days} total={total} expected 5/5000000")

        # set active
        r2 = requests.put(f"{BASE}/rentals/{rid}/status", params={"status": "active"},
                         headers=H(tokens["sales"] or tokens["superadmin"]))
        if r2.status_code in (200, 204):
            # verify unit rented (fetch via list since no GET /units/{id})
            r3 = requests.get(f"{BASE}/units", headers=H(tokens["superadmin"]))
            u3 = next((x for x in r3.json() if x.get("id") == created_unit_id), None)
            if u3 and u3.get("status") == "rented":
                ok("rental active -> unit status=rented")
            else:
                fail("rental active unit status", f"unit status={u3.get('status') if u3 else 'not-found'}")

            # complete
            r4 = requests.put(f"{BASE}/rentals/{rid}/status", params={"status": "completed"},
                             headers=H(tokens["sales"] or tokens["superadmin"]))
            if r4.status_code in (200, 204):
                r5 = requests.get(f"{BASE}/units", headers=H(tokens["superadmin"]))
                u5 = next((x for x in r5.json() if x.get("id") == created_unit_id), None)
                if u5 and u5.get("status") == "available":
                    ok("rental completed -> unit status=available")
                else:
                    fail("rental completed unit status", f"status={u5.get('status') if u5 else 'not-found'}")
            else:
                fail("PUT rental completed", f"status={r4.status_code} body={r4.text[:200]}")
        else:
            fail("PUT rental active", f"status={r2.status_code} body={r2.text[:200]}")
    else:
        fail("POST /rentals", f"status={r.status_code} body={r.text[:300]}")

# ---- ANALYTICS ----
r = requests.get(f"{BASE}/analytics/summary", headers=H(tokens["superadmin"]))
if r.status_code == 200:
    a = r.json()
    keys_needed = ["totals", "units_by_status", "units_by_category", "revenue", "sales_trend", "low_stock_items"]
    missing = [k for k in keys_needed if k not in a]
    if not missing:
        ok(f"GET /analytics/summary has all keys totals={a.get('totals')}")
    else:
        fail("analytics keys", f"missing {missing} present {list(a)}")
else:
    fail("GET /analytics/summary", f"status={r.status_code} body={r.text[:300]}")

# Cleanup created unit
if created_unit_id and tokens["sales"]:
    requests.delete(f"{BASE}/units/{created_unit_id}", headers=H(tokens["sales"]))

print("\n=== SUMMARY ===")
print(f"Passed: {len(results['passed'])}")
print(f"Failed: {len(results['failed'])}")
for f in results["failed"]:
    print(f"  - {f['area']}: {f['evidence'][:200]}")

with open("/tmp/backend_results.json", "w") as fp:
    json.dump(results, fp, indent=2)
