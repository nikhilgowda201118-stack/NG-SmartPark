"""Smart Parking Management System - animated browser dashboard.

Uses only Python's standard library and SQLite (no pip installs required).
Run: py app.py
Then open: http://127.0.0.1:8000
"""
import json
import math
import mimetypes
import sqlite3
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "smart_parking_web.db"
HOST = "127.0.0.1"
PORT = 8000
TOTAL_SLOTS = 10
HOURLY_RATE = 20
TIME_FORMAT = "%Y-%m-%d %H:%M:%S"


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS parking_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_number TEXT NOT NULL,
                vehicle_type TEXT NOT NULL,
                slot_no INTEGER NOT NULL,
                entry_time TEXT NOT NULL,
                exit_time TEXT,
                duration_hours INTEGER,
                fee REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'PARKED'
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parking_status ON parking_records(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parking_vehicle ON parking_records(vehicle_number)")


def row_to_dict(row):
    return dict(row) if row is not None else None


def dashboard_data():
    with connect_db() as conn:
        active = conn.execute(
            "SELECT vehicle_number, vehicle_type, slot_no, entry_time FROM parking_records WHERE status='PARKED' ORDER BY slot_no"
        ).fetchall()
        total_fees = conn.execute(
            "SELECT COALESCE(SUM(fee), 0) AS total FROM parking_records WHERE status='EXITED'"
        ).fetchone()["total"]
        recent = conn.execute(
            "SELECT id, vehicle_number, vehicle_type, slot_no, entry_time, exit_time, duration_hours, fee, status FROM parking_records ORDER BY id DESC LIMIT 6"
        ).fetchall()
    today = datetime.now().strftime("%Y-%m-%d")
    with connect_db() as conn:
        entries_today = conn.execute(
            "SELECT COUNT(*) AS total FROM parking_records WHERE entry_time LIKE ?",
            (today + "%",),
        ).fetchone()["total"]
    return {
        "total_slots": TOTAL_SLOTS,
        "hourly_rate": HOURLY_RATE,
        "vehicles_parked": len(active),
        "slots_available": TOTAL_SLOTS - len(active),
        "fees_collected": round(float(total_fees or 0), 2),
        "entries_today": int(entries_today),
        "recent_activity": [row_to_dict(r) for r in recent],
    }


def slots_data():
    with connect_db() as conn:
        active = conn.execute(
            "SELECT vehicle_number, vehicle_type, slot_no, entry_time FROM parking_records WHERE status='PARKED'"
        ).fetchall()
    occupied = {int(r["slot_no"]): row_to_dict(r) for r in active}
    return [
        {
            "slot_no": n,
            "status": "OCCUPIED" if n in occupied else "AVAILABLE",
            "vehicle": occupied.get(n, {}).get("vehicle_number", ""),
            "vehicle_type": occupied.get(n, {}).get("vehicle_type", ""),
            "entry_time": occupied.get(n, {}).get("entry_time", ""),
        }
        for n in range(1, TOTAL_SLOTS + 1)
    ]


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class SmartParkingHandler(BaseHTTPRequestHandler):
    server_version = "SmartParkingLocal/1.0"

    def log_message(self, fmt, *args):
        # A friendly, compact development-server log.
        print("[Smart Parking] " + fmt % args)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return send_json(self, {"ok": True, "message": "Smart Parking server is running"})
        if path == "/api/dashboard":
            return send_json(self, dashboard_data())
        if path == "/api/slots":
            return send_json(self, slots_data())
        if path == "/api/vehicles":
            with connect_db() as conn:
                rows = conn.execute(
                    "SELECT id, vehicle_number, vehicle_type, slot_no, entry_time, status FROM parking_records WHERE status='PARKED' ORDER BY slot_no"
                ).fetchall()
            return send_json(self, [row_to_dict(r) for r in rows])
        if path == "/api/history":
            with connect_db() as conn:
                rows = conn.execute(
                    "SELECT id, vehicle_number, vehicle_type, slot_no, entry_time, exit_time, duration_hours, fee, status FROM parking_records ORDER BY id DESC LIMIT 500"
                ).fetchall()
            return send_json(self, [row_to_dict(r) for r in rows])
        if path == "/":
            return self.serve_file(BASE_DIR / "index.html")
        assets = {
            "/style.css": STATIC_DIR / "style.css",
            "/brand.css": STATIC_DIR / "brand.css",
            "/app.js": STATIC_DIR / "app.js",
            "/parking-scene.png": STATIC_DIR / "parking-scene.png",
            "/ng-logo.svg": STATIC_DIR / "ng-logo.svg",
            "/ng-smartpark-logo.png": STATIC_DIR / "ng-smartpark-logo.png",
        }
        file_path = assets.get(path)
        if file_path:
            return self.serve_file(file_path)
        return send_json(self, {"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 100_000:
                return send_json(self, {"error": "Please submit valid form data."}, 400)
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return send_json(self, {"error": "Could not read the submitted data."}, 400)

        if path == "/api/park":
            vehicle_number = str(data.get("vehicle_number", "")).strip().upper()
            vehicle_type = str(data.get("vehicle_type", "Car")).strip().title()
            allowed_types = {"Car", "Bike", "Auto", "Van", "Other"}
            if not vehicle_number:
                return send_json(self, {"error": "Enter a vehicle registration number first."}, 400)
            if len(vehicle_number) > 20 or any(ord(c) < 32 for c in vehicle_number):
                return send_json(self, {"error": "Please enter a valid vehicle number (up to 20 characters)."}, 400)
            if vehicle_type not in allowed_types:
                return send_json(self, {"error": "Choose a vehicle type from the list."}, 400)

            with connect_db() as conn:
                already = conn.execute(
                    "SELECT slot_no FROM parking_records WHERE UPPER(vehicle_number)=? AND status='PARKED' LIMIT 1",
                    (vehicle_number,),
                ).fetchone()
                if already:
                    return send_json(self, {"error": f"{vehicle_number} is already parked in Slot {already['slot_no']}."}, 409)
                occupied = {r[0] for r in conn.execute("SELECT slot_no FROM parking_records WHERE status='PARKED'").fetchall()}
                free_slot = next((s for s in range(1, TOTAL_SLOTS + 1) if s not in occupied), None)
                if free_slot is None:
                    return send_json(self, {"error": "Parking is full. No slots are available right now."}, 409)
                entry_time = datetime.now().strftime(TIME_FORMAT)
                cur = conn.execute(
                    "INSERT INTO parking_records (vehicle_number, vehicle_type, slot_no, entry_time, status) VALUES (?, ?, ?, ?, 'PARKED')",
                    (vehicle_number, vehicle_type, free_slot, entry_time),
                )
                record_id = cur.lastrowid
            return send_json(self, {
                "ok": True, "message": f"Vehicle parked successfully in Slot {free_slot}.",
                "id": record_id, "vehicle_number": vehicle_number, "vehicle_type": vehicle_type,
                "slot_no": free_slot, "entry_time": entry_time,
            }, 201)

        if path == "/api/checkout":
            vehicle_number = str(data.get("vehicle_number", "")).strip().upper()
            if not vehicle_number:
                return send_json(self, {"error": "Enter the vehicle number to check out."}, 400)
            with connect_db() as conn:
                row = conn.execute(
                    "SELECT id, vehicle_number, vehicle_type, slot_no, entry_time FROM parking_records WHERE UPPER(vehicle_number)=? AND status='PARKED' ORDER BY id DESC LIMIT 1",
                    (vehicle_number,),
                ).fetchone()
                if row is None:
                    return send_json(self, {"error": f"No active parking record was found for {vehicle_number}."}, 404)
                exit_dt = datetime.now()
                entry_dt = datetime.strptime(row["entry_time"], TIME_FORMAT)
                elapsed_seconds = max(0, (exit_dt - entry_dt).total_seconds())
                billed_hours = max(1, math.ceil(elapsed_seconds / 3600))
                fee = round(billed_hours * HOURLY_RATE, 2)
                exit_time = exit_dt.strftime(TIME_FORMAT)
                conn.execute(
                    "UPDATE parking_records SET exit_time=?, duration_hours=?, fee=?, status='EXITED' WHERE id=?",
                    (exit_time, billed_hours, fee, row["id"]),
                )
            return send_json(self, {
                "ok": True, "message": f"Checkout complete. ₹{fee:.2f} collected.",
                "vehicle_number": row["vehicle_number"], "vehicle_type": row["vehicle_type"],
                "slot_no": row["slot_no"], "entry_time": row["entry_time"],
                "exit_time": exit_time, "duration_hours": billed_hours, "fee": fee,
                "hourly_rate": HOURLY_RATE,
            })
        return send_json(self, {"error": "Not found"}, 404)

    def serve_file(self, path):
        if not path.is_file():
            return send_json(self, {"error": "Website file not found"}, 404)
        content = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in ("application/javascript",):
            mime += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main():
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), SmartParkingHandler)
    url = f"http://{HOST}:{PORT}"
    print("\n" + "=" * 62)
    print("  NG SMARTPARK — BUILT BY NITHIN GOWDA")
    print("  Your premium animated dashboard is ready!")
    print(f"  Open this address in your browser: {url}")
    print("  Keep this window open while using the website.")
    print("  Press Ctrl+C to stop the server.")
    print("  Showcase Mode is available in the website header.")
    print("=" * 62 + "\n")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSmart Parking website stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
