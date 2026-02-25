#!/usr/bin/env python3
import argparse
import hashlib
import json
import secrets
import sqlite3
import threading
import time
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "ticker_tok.sqlite3"

DEFAULT_USERS = ["Lin", "Qingli", "Ke", "Yifeng", "Jimmy"]
DEFAULT_PASSWORD = "888888"
SESSION_COOKIE = "ticker_tok_session"
SESSION_TTL_SECONDS = 14 * 24 * 60 * 60

_SESSIONS = {}
_SESSIONS_LOCK = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db():
    ensure_data_dir()
    with get_conn() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              legacy_record_id TEXT NOT NULL,
              type TEXT NOT NULL,
              date TEXT NOT NULL,
              start_time INTEGER NOT NULL,
              end_time INTEGER NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              total_duration INTEGER NOT NULL DEFAULT 0,
              productive_duration INTEGER NOT NULL DEFAULT 0,
              interruption_duration INTEGER NOT NULL DEFAULT 0,
              pause_duration INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              UNIQUE(user_id, legacy_record_id),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS interruptions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              record_id INTEGER NOT NULL,
              sort_index INTEGER NOT NULL DEFAULT 0,
              start_time INTEGER NOT NULL,
              end_time INTEGER NOT NULL,
              duration INTEGER NOT NULL DEFAULT 0,
              reason TEXT NOT NULL DEFAULT '',
              FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pauses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              record_id INTEGER NOT NULL,
              sort_index INTEGER NOT NULL DEFAULT 0,
              start_time INTEGER NOT NULL,
              end_time INTEGER NOT NULL,
              FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS suggestions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              text TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              UNIQUE(user_id, text),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_records_user_date
              ON records(user_id, date, start_time);
            CREATE INDEX IF NOT EXISTS idx_interruptions_record
              ON interruptions(record_id, sort_index);
            CREATE INDEX IF NOT EXISTS idx_pauses_record
              ON pauses(record_id, sort_index);
            CREATE INDEX IF NOT EXISTS idx_suggestions_user_updated
              ON suggestions(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS todos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              content TEXT NOT NULL,
              priority INTEGER NOT NULL DEFAULT 3,
              planned_date TEXT NOT NULL DEFAULT '',
              planned_time TEXT NOT NULL DEFAULT '',
              deadline_date TEXT NOT NULL DEFAULT '',
              deadline_time TEXT NOT NULL DEFAULT '',
              estimated_hours INTEGER NOT NULL DEFAULT 0,
              estimated_minutes INTEGER NOT NULL DEFAULT 0,
              actual_hours INTEGER NOT NULL DEFAULT 0,
              actual_minutes INTEGER NOT NULL DEFAULT 0,
              actual_completed_at TEXT NOT NULL DEFAULT '',
              completed INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_todos_user
              ON todos(user_id, completed, priority);
            """
        )

        ts = now_ms()
        for name in DEFAULT_USERS:
            conn.execute(
                """
                INSERT OR IGNORE INTO users (username, password_hash, is_admin, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (name, hash_password(DEFAULT_PASSWORD), 1 if name == "Lin" else 0, ts, ts),
            )
        conn.commit()


def prune_sessions():
    now = time.time()
    with _SESSIONS_LOCK:
        expired = [token for token, sess in _SESSIONS.items() if sess["expires_at"] <= now]
        for token in expired:
            _SESSIONS.pop(token, None)


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    with _SESSIONS_LOCK:
        _SESSIONS[token] = {
            "user_id": user_id,
            "expires_at": time.time() + SESSION_TTL_SECONDS,
        }
    return token


def get_session(token):
    if not token:
        return None
    prune_sessions()
    with _SESSIONS_LOCK:
        sess = _SESSIONS.get(token)
        if not sess:
            return None
        sess["expires_at"] = time.time() + SESSION_TTL_SECONDS
        return dict(sess)


def delete_session(token):
    if not token:
        return
    with _SESSIONS_LOCK:
        _SESSIONS.pop(token, None)


def row_to_user_public(row):
    if not row:
        return None
    return {
        "username": row["username"],
        "isAdmin": bool(row["is_admin"]),
    }


def fetch_user_by_username(conn, username):
    if not username:
        return None
    return conn.execute(
        "SELECT * FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def fetch_user_by_id(conn, user_id):
    if not user_id:
        return None
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def can_access_user(current_user, target_user):
    if not current_user or not target_user:
        return False
    if current_user["id"] == target_user["id"]:
        return True
    return bool(current_user["is_admin"])


def _safe_int(val, default=0):
    try:
        if val is None:
            return default
        return int(val)
    except (TypeError, ValueError):
        return default


def _normalize_date_from_ts(ts_ms):
    if not ts_ms:
        ts_ms = now_ms()
    dt = time.localtime(ts_ms / 1000)
    return time.strftime("%Y-%m-%d", dt)


def normalize_record(raw_record):
    if not isinstance(raw_record, dict):
        raise ValueError("record must be an object")

    start_time = _safe_int(raw_record.get("startTime"), 0)
    end_time = _safe_int(raw_record.get("endTime"), start_time)
    if end_time < start_time:
        end_time = start_time

    legacy_id = str(raw_record.get("id") or "").strip()
    if not legacy_id:
        seed = "%s|%s|%s|%s" % (
            raw_record.get("type") or "",
            start_time,
            end_time,
            raw_record.get("description") or "",
        )
        legacy_id = "migrated_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:20]

    record_type = "productive" if raw_record.get("type") == "productive" else "other"
    date_str = str(raw_record.get("date") or "").strip() or _normalize_date_from_ts(start_time)
    description = str(raw_record.get("description") or "")

    pauses = []
    for idx, pause in enumerate(raw_record.get("pauses") or []):
        if not isinstance(pause, dict):
            continue
        p_start = _safe_int(pause.get("start"), 0)
        p_end = _safe_int(pause.get("end"), p_start)
        if p_end < p_start:
            p_end = p_start
        pauses.append(
            {
                "sort_index": idx,
                "start": p_start,
                "end": p_end,
            }
        )

    interruptions = []
    for idx, intr in enumerate(raw_record.get("interruptions") or []):
        if not isinstance(intr, dict):
            continue
        i_start = _safe_int(intr.get("start"), 0)
        i_end = _safe_int(intr.get("end"), i_start)
        if i_end < i_start:
            i_end = i_start
        duration = _safe_int(intr.get("duration"), max(0, (i_end - i_start) // 60000))
        interruptions.append(
            {
                "sort_index": idx,
                "start": i_start,
                "end": i_end,
                "duration": duration,
                "reason": str(intr.get("reason") or ""),
            }
        )

    total_duration = _safe_int(raw_record.get("totalDuration"), max(0, end_time - start_time))
    productive_duration = _safe_int(raw_record.get("productiveDuration"), total_duration)
    interruption_duration = _safe_int(
        raw_record.get("interruptionDuration"),
        sum(max(0, i["end"] - i["start"]) for i in interruptions),
    )
    pause_duration = _safe_int(
        raw_record.get("pauseDuration"),
        sum(max(0, p["end"] - p["start"]) for p in pauses),
    )

    return {
        "legacy_record_id": legacy_id,
        "type": record_type,
        "date": date_str,
        "start_time": start_time,
        "end_time": end_time,
        "description": description,
        "total_duration": max(0, total_duration),
        "productive_duration": max(0, productive_duration),
        "interruption_duration": max(0, interruption_duration),
        "pause_duration": max(0, pause_duration),
        "pauses": pauses,
        "interruptions": interruptions,
    }


def replace_record_children(conn, record_pk, pauses, interruptions):
    conn.execute("DELETE FROM pauses WHERE record_id = ?", (record_pk,))
    conn.execute("DELETE FROM interruptions WHERE record_id = ?", (record_pk,))

    for p in pauses:
        conn.execute(
            """
            INSERT INTO pauses (record_id, sort_index, start_time, end_time)
            VALUES (?, ?, ?, ?)
            """,
            (record_pk, p["sort_index"], p["start"], p["end"]),
        )

    for intr in interruptions:
        conn.execute(
            """
            INSERT INTO interruptions (record_id, sort_index, start_time, end_time, duration, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                record_pk,
                intr["sort_index"],
                intr["start"],
                intr["end"],
                intr["duration"],
                intr["reason"],
            ),
        )


def upsert_record(conn, user_id, raw_record):
    rec = normalize_record(raw_record)
    ts = now_ms()
    existing = conn.execute(
        "SELECT id FROM records WHERE user_id = ? AND legacy_record_id = ?",
        (user_id, rec["legacy_record_id"]),
    ).fetchone()

    if existing:
        record_pk = existing["id"]
        conn.execute(
            """
            UPDATE records
            SET type = ?, date = ?, start_time = ?, end_time = ?, description = ?,
                total_duration = ?, productive_duration = ?, interruption_duration = ?,
                pause_duration = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                rec["type"],
                rec["date"],
                rec["start_time"],
                rec["end_time"],
                rec["description"],
                rec["total_duration"],
                rec["productive_duration"],
                rec["interruption_duration"],
                rec["pause_duration"],
                ts,
                record_pk,
            ),
        )
        replace_record_children(conn, record_pk, rec["pauses"], rec["interruptions"])
        return "updated", rec["legacy_record_id"]

    cur = conn.execute(
        """
        INSERT INTO records (
          user_id, legacy_record_id, type, date, start_time, end_time, description,
          total_duration, productive_duration, interruption_duration, pause_duration,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            rec["legacy_record_id"],
            rec["type"],
            rec["date"],
            rec["start_time"],
            rec["end_time"],
            rec["description"],
            rec["total_duration"],
            rec["productive_duration"],
            rec["interruption_duration"],
            rec["pause_duration"],
            ts,
            ts,
        ),
    )
    record_pk = cur.lastrowid
    replace_record_children(conn, record_pk, rec["pauses"], rec["interruptions"])
    return "inserted", rec["legacy_record_id"]


def list_records(conn, user_id, date_str=None):
    if date_str:
        rec_rows = conn.execute(
            """
            SELECT * FROM records
            WHERE user_id = ? AND date = ?
            ORDER BY start_time ASC
            """,
            (user_id, date_str),
        ).fetchall()
    else:
        rec_rows = conn.execute(
            """
            SELECT * FROM records
            WHERE user_id = ?
            ORDER BY date ASC, start_time ASC
            """,
            (user_id,),
        ).fetchall()

    if not rec_rows:
        return []

    record_ids = [r["id"] for r in rec_rows]
    placeholders = ",".join("?" for _ in record_ids)

    pause_rows = conn.execute(
        f"""
        SELECT record_id, sort_index, start_time, end_time
        FROM pauses
        WHERE record_id IN ({placeholders})
        ORDER BY record_id ASC, sort_index ASC
        """,
        record_ids,
    ).fetchall()
    intr_rows = conn.execute(
        f"""
        SELECT record_id, sort_index, start_time, end_time, duration, reason
        FROM interruptions
        WHERE record_id IN ({placeholders})
        ORDER BY record_id ASC, sort_index ASC
        """,
        record_ids,
    ).fetchall()

    pauses_by_record = {}
    for row in pause_rows:
        pauses_by_record.setdefault(row["record_id"], []).append(
            {
                "start": row["start_time"],
                "end": row["end_time"],
            }
        )

    intr_by_record = {}
    for row in intr_rows:
        intr_by_record.setdefault(row["record_id"], []).append(
            {
                "start": row["start_time"],
                "end": row["end_time"],
                "duration": row["duration"],
                "reason": row["reason"] or "",
            }
        )

    out = []
    for r in rec_rows:
        out.append(
            {
                "id": r["legacy_record_id"],
                "type": r["type"],
                "date": r["date"],
                "startTime": r["start_time"],
                "endTime": r["end_time"],
                "description": r["description"] or "",
                "pauses": pauses_by_record.get(r["id"], []),
                "interruptions": intr_by_record.get(r["id"], []),
                "totalDuration": r["total_duration"],
                "productiveDuration": r["productive_duration"],
                "interruptionDuration": r["interruption_duration"],
                "pauseDuration": r["pause_duration"],
            }
        )
    return out


def list_dates_with_records(conn, user_id):
    rows = conn.execute(
        "SELECT DISTINCT date FROM records WHERE user_id = ? ORDER BY date ASC",
        (user_id,),
    ).fetchall()
    return [r["date"] for r in rows]


def list_suggestions(conn, user_id):
    rows = conn.execute(
        """
        SELECT text
        FROM suggestions
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 50
        """,
        (user_id,),
    ).fetchall()
    return [r["text"] for r in rows]


def upsert_suggestion(conn, user_id, text):
    text = (text or "").strip()
    if not text:
        return False
    ts = now_ms()
    conn.execute(
        """
        INSERT INTO suggestions (user_id, text, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, text) DO UPDATE SET updated_at = excluded.updated_at
        """,
        (user_id, text, ts),
    )
    conn.execute(
        """
        DELETE FROM suggestions
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM suggestions
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT 50
          )
        """,
        (user_id, user_id),
    )
    return True


class AppHandler(SimpleHTTPRequestHandler):
    server_version = "TickerTokHTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._dispatch_api("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._dispatch_api("POST")
            return
        self._json_error(404, "NOT_FOUND", "Not found")

    def do_PATCH(self):
        if self.path.startswith("/api/"):
            self._dispatch_api("PATCH")
            return
        self._json_error(404, "NOT_FOUND", "Not found")

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._dispatch_api("DELETE")
            return
        self._json_error(404, "NOT_FOUND", "Not found")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET,POST,PATCH,DELETE,OPTIONS")
        self.end_headers()

    def _dispatch_api(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if method == "GET" and path == "/api/health":
                return self._json_ok({"serverTime": now_ms()})
            if method == "GET" and path == "/api/users":
                return self._handle_get_users()
            if method == "GET" and path == "/api/auth/me":
                return self._handle_auth_me()
            if method == "POST" and path == "/api/auth/login":
                return self._handle_auth_login()
            if method == "POST" and path == "/api/auth/logout":
                return self._handle_auth_logout()
            if method == "GET" and path == "/api/records":
                return self._handle_get_records(query)
            if method == "GET" and path == "/api/records/dates":
                return self._handle_get_record_dates(query)
            if method == "POST" and path == "/api/records":
                return self._handle_post_record()
            if method == "PATCH" and path.startswith("/api/records/"):
                legacy_id = unquote(path[len("/api/records/"):])
                return self._handle_patch_record(legacy_id)
            if method == "GET" and path == "/api/suggestions":
                return self._handle_get_suggestions(query)
            if method == "POST" and path == "/api/suggestions":
                return self._handle_post_suggestion()
            if method == "POST" and path == "/api/migration/localstorage":
                return self._handle_migrate_localstorage()
            if method == "GET" and path == "/api/todos":
                return self._handle_get_todos()
            if method == "POST" and path == "/api/todos":
                return self._handle_post_todo()
            if method == "PATCH" and path.startswith("/api/todos/"):
                todo_id = path[len("/api/todos/"):]
                return self._handle_patch_todo(todo_id)
            if method == "DELETE" and path.startswith("/api/todos/"):
                todo_id = path[len("/api/todos/"):]
                return self._handle_delete_todo(todo_id)
            return self._json_error(404, "NOT_FOUND", "Unknown API endpoint")
        except sqlite3.Error as e:
            return self._json_error(500, "DB_ERROR", str(e))
        except ValueError as e:
            return self._json_error(400, "BAD_REQUEST", str(e))
        except Exception as e:
            return self._json_error(500, "INTERNAL_ERROR", str(e))

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON body")

    def _json_ok(self, payload=None, status=200, extra_headers=None):
        body = {"ok": True}
        if payload:
            body.update(payload)
        return self._send_json(status, body, extra_headers=extra_headers)

    def _json_error(self, status, code, message):
        return self._send_json(status, {"ok": False, "code": code, "message": message})

    def _send_json(self, status, payload, extra_headers=None):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for name, value in extra_headers:
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def _parse_cookies(self):
        raw = self.headers.get("Cookie")
        jar = cookies.SimpleCookie()
        if raw:
            try:
                jar.load(raw)
            except cookies.CookieError:
                return {}
        return jar

    def _session_token(self):
        jar = self._parse_cookies()
        morsel = jar.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def _cookie_header(self, token):
        c = cookies.SimpleCookie()
        c[SESSION_COOKIE] = token
        c[SESSION_COOKIE]["path"] = "/"
        c[SESSION_COOKIE]["httponly"] = True
        c[SESSION_COOKIE]["samesite"] = "Lax"
        c[SESSION_COOKIE]["max-age"] = str(SESSION_TTL_SECONDS)
        return c.output(header="").strip()

    def _clear_cookie_header(self):
        c = cookies.SimpleCookie()
        c[SESSION_COOKIE] = ""
        c[SESSION_COOKIE]["path"] = "/"
        c[SESSION_COOKIE]["httponly"] = True
        c[SESSION_COOKIE]["samesite"] = "Lax"
        c[SESSION_COOKIE]["max-age"] = "0"
        return c.output(header="").strip()

    def _require_current_user(self, conn):
        token = self._session_token()
        sess = get_session(token)
        if not sess:
            self._json_error(401, "AUTH_REQUIRED", "Please login")
            return None
        user = fetch_user_by_id(conn, sess.get("user_id"))
        if not user:
            delete_session(token)
            self._json_error(401, "AUTH_REQUIRED", "Please login")
            return None
        return user

    def _resolve_target_user(self, conn, current_user, username):
        target = fetch_user_by_username(conn, username)
        if not target:
            self._json_error(404, "USER_NOT_FOUND", "User not found")
            return None
        if not can_access_user(current_user, target):
            self._json_error(403, "FORBIDDEN", "No permission to access this user")
            return None
        return target

    def _handle_get_users(self):
        with get_conn() as conn:
            rows = conn.execute("SELECT username FROM users ORDER BY id ASC").fetchall()
            users = [r["username"] for r in rows]
        return self._json_ok({"users": users})

    def _handle_auth_me(self):
        with get_conn() as conn:
            token = self._session_token()
            sess = get_session(token)
            if not sess:
                return self._json_ok({"user": None})
            user = fetch_user_by_id(conn, sess.get("user_id"))
            if not user:
                delete_session(token)
                return self._json_ok({"user": None})
            return self._json_ok({"user": row_to_user_public(user)})

    def _handle_auth_login(self):
        body = self._read_json()
        username = str(body.get("username") or "").strip()
        password = str(body.get("password") or "")
        if not username or not password:
            return self._json_error(400, "MISSING_CREDENTIALS", "Username and password are required")

        with get_conn() as conn:
            user = fetch_user_by_username(conn, username)
            if not user or user["password_hash"] != hash_password(password):
                return self._json_error(401, "INVALID_CREDENTIALS", "Invalid username or password")

        token = create_session(user["id"])
        headers = [("Set-Cookie", self._cookie_header(token))]
        return self._json_ok({"user": row_to_user_public(user)}, extra_headers=headers)

    def _handle_auth_logout(self):
        token = self._session_token()
        delete_session(token)
        headers = [("Set-Cookie", self._clear_cookie_header())]
        return self._json_ok({"loggedOut": True}, extra_headers=headers)

    def _handle_get_records(self, query):
        user_name = (query.get("user") or [""])[0].strip()
        date_str = (query.get("date") or [""])[0].strip() or None
        if not user_name:
            return self._json_error(400, "MISSING_USER", "user is required")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            records = list_records(conn, target["id"], date_str=date_str)
        return self._json_ok({"records": records})

    def _handle_get_record_dates(self, query):
        user_name = (query.get("user") or [""])[0].strip()
        if not user_name:
            return self._json_error(400, "MISSING_USER", "user is required")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            dates = list_dates_with_records(conn, target["id"])
        return self._json_ok({"dates": dates})

    def _handle_post_record(self):
        body = self._read_json()
        user_name = str(body.get("userName") or "").strip()
        record = body.get("record")
        if not user_name:
            return self._json_error(400, "MISSING_USER", "userName is required")
        if not isinstance(record, dict):
            return self._json_error(400, "MISSING_RECORD", "record is required")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            status, legacy_id = upsert_record(conn, target["id"], record)
            conn.commit()
        return self._json_ok({"recordId": legacy_id, "result": status})

    def _handle_patch_record(self, legacy_id):
        if not legacy_id:
            return self._json_error(400, "MISSING_RECORD_ID", "record id is required")

        body = self._read_json()
        user_name = str(body.get("userName") or "").strip()
        updates = body.get("updates") or {}
        if not user_name:
            return self._json_error(400, "MISSING_USER", "userName is required")
        if not isinstance(updates, dict):
            return self._json_error(400, "BAD_UPDATES", "updates must be an object")

        sets = []
        params = []
        if "description" in updates:
            sets.append("description = ?")
            params.append(str(updates.get("description") or ""))
        if "type" in updates:
            new_type = str(updates.get("type") or "")
            if new_type in ("productive", "other"):
                sets.append("type = ?")
                params.append(new_type)

        if not sets:
            return self._json_error(400, "UNSUPPORTED_UPDATE", "No supported fields to update")

        sets.append("updated_at = ?")
        params.append(now_ms())
        params.append(user_name)
        params.append(legacy_id)

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            params[-2] = target["id"]
            cur = conn.execute(
                f"UPDATE records SET {', '.join(sets)} WHERE user_id = ? AND legacy_record_id = ?",
                params,
            )
            conn.commit()
            if cur.rowcount == 0:
                return self._json_error(404, "RECORD_NOT_FOUND", "Record not found")
        return self._json_ok({"updated": True})

    def _handle_get_suggestions(self, query):
        user_name = (query.get("user") or [""])[0].strip()
        if not user_name:
            return self._json_error(400, "MISSING_USER", "user is required")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            suggestions = list_suggestions(conn, target["id"])
        return self._json_ok({"suggestions": suggestions})

    def _handle_post_suggestion(self):
        body = self._read_json()
        user_name = str(body.get("userName") or "").strip()
        text = str(body.get("text") or "")
        if not user_name:
            return self._json_error(400, "MISSING_USER", "userName is required")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            target = self._resolve_target_user(conn, current_user, user_name)
            if not target:
                return
            saved = upsert_suggestion(conn, target["id"], text)
            conn.commit()
        return self._json_ok({"saved": bool(saved)})

    def _handle_get_todos(self):
        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            rows = conn.execute(
                """
                SELECT id, content, priority, planned_date, planned_time,
                       deadline_date, deadline_time, estimated_hours, estimated_minutes,
                       actual_hours, actual_minutes, actual_completed_at,
                       completed, created_at, updated_at
                FROM todos
                WHERE user_id = ?
                ORDER BY completed ASC, created_at DESC
                """,
                (current_user["id"],),
            ).fetchall()
            todos = []
            for r in rows:
                todos.append({
                    "id": r["id"],
                    "content": r["content"],
                    "priority": r["priority"],
                    "plannedDate": r["planned_date"],
                    "plannedTime": r["planned_time"],
                    "deadlineDate": r["deadline_date"],
                    "deadlineTime": r["deadline_time"],
                    "estimatedHours": r["estimated_hours"],
                    "estimatedMinutes": r["estimated_minutes"],
                    "actualHours": r["actual_hours"],
                    "actualMinutes": r["actual_minutes"],
                    "actualCompletedAt": r["actual_completed_at"],
                    "completed": bool(r["completed"]),
                    "createdAt": r["created_at"],
                    "updatedAt": r["updated_at"],
                })
        return self._json_ok({"todos": todos})

    def _handle_post_todo(self):
        body = self._read_json()
        content = str(body.get("content") or "").strip()
        if not content:
            return self._json_error(400, "MISSING_CONTENT", "content is required")
        priority = _safe_int(body.get("priority"), 3)
        if priority < 1 or priority > 5:
            priority = 3
        planned_date = str(body.get("plannedDate") or "").strip()
        planned_time = str(body.get("plannedTime") or "").strip()
        deadline_date = str(body.get("deadlineDate") or "").strip()
        deadline_time = str(body.get("deadlineTime") or "").strip()
        estimated_hours = _safe_int(body.get("estimatedHours"), 0)
        estimated_minutes = _safe_int(body.get("estimatedMinutes"), 0)

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            ts = now_ms()
            cur = conn.execute(
                """
                INSERT INTO todos (user_id, content, priority, planned_date, planned_time,
                                   deadline_date, deadline_time, estimated_hours, estimated_minutes,
                                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (current_user["id"], content, priority, planned_date, planned_time,
                 deadline_date, deadline_time, estimated_hours, estimated_minutes, ts, ts),
            )
            conn.commit()
        return self._json_ok({"todoId": cur.lastrowid})

    def _handle_patch_todo(self, todo_id):
        try:
            todo_id = int(todo_id)
        except (ValueError, TypeError):
            return self._json_error(400, "BAD_ID", "Invalid todo id")

        body = self._read_json()
        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            existing = conn.execute(
                "SELECT id FROM todos WHERE id = ? AND user_id = ?",
                (todo_id, current_user["id"]),
            ).fetchone()
            if not existing:
                return self._json_error(404, "NOT_FOUND", "Todo not found")

            sets = []
            params = []
            for field, col in [("content", "content"),
                               ("plannedDate", "planned_date"), ("plannedTime", "planned_time"),
                               ("deadlineDate", "deadline_date"), ("deadlineTime", "deadline_time"),
                               ("actualCompletedAt", "actual_completed_at")]:
                if field in body:
                    sets.append(f"{col} = ?")
                    params.append(str(body[field] or "").strip())
            for field, col in [("priority", "priority"),
                               ("estimatedHours", "estimated_hours"), ("estimatedMinutes", "estimated_minutes"),
                               ("actualHours", "actual_hours"), ("actualMinutes", "actual_minutes")]:
                if field in body:
                    sets.append(f"{col} = ?")
                    params.append(_safe_int(body[field], 0))
            if "completed" in body:
                sets.append("completed = ?")
                params.append(1 if body["completed"] else 0)

            if not sets:
                return self._json_error(400, "NO_UPDATES", "No fields to update")

            sets.append("updated_at = ?")
            params.append(now_ms())
            params.append(todo_id)

            conn.execute(
                f"UPDATE todos SET {', '.join(sets)} WHERE id = ?",
                params,
            )
            conn.commit()
        return self._json_ok({"updated": True})

    def _handle_delete_todo(self, todo_id):
        try:
            todo_id = int(todo_id)
        except (ValueError, TypeError):
            return self._json_error(400, "BAD_ID", "Invalid todo id")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return
            cur = conn.execute(
                "DELETE FROM todos WHERE id = ? AND user_id = ?",
                (todo_id, current_user["id"]),
            )
            conn.commit()
            if cur.rowcount == 0:
                return self._json_error(404, "NOT_FOUND", "Todo not found")
        return self._json_ok({"deleted": True})

    def _handle_migrate_localstorage(self):
        body = self._read_json()
        local_data = body.get("data")
        if not isinstance(local_data, dict):
            return self._json_error(400, "BAD_PAYLOAD", "data must be an object")

        with get_conn() as conn:
            current_user = self._require_current_user(conn)
            if not current_user:
                return

            current_name = current_user["username"]
            records_by_user = local_data.get("records") or {}
            suggestions_by_user = local_data.get("suggestions") or {}
            raw_records = records_by_user.get(current_name) or []
            raw_suggestions = suggestions_by_user.get(current_name) or []

            inserted = 0
            updated = 0
            record_errors = 0

            if not isinstance(raw_records, list):
                raw_records = []
            if not isinstance(raw_suggestions, list):
                raw_suggestions = []

            for item in raw_records:
                try:
                    result, _legacy_id = upsert_record(conn, current_user["id"], item)
                except Exception:
                    record_errors += 1
                    continue
                if result == "inserted":
                    inserted += 1
                elif result == "updated":
                    updated += 1

            sug_added = 0
            for text in raw_suggestions:
                if upsert_suggestion(conn, current_user["id"], str(text or "")):
                    sug_added += 1

            conn.commit()

        return self._json_ok(
            {
                "summary": {
                    "user": current_name,
                    "recordsSeen": len(raw_records),
                    "recordsInserted": inserted,
                    "recordsUpdated": updated,
                    "recordErrors": record_errors,
                    "suggestionsSeen": len(raw_suggestions),
                    "suggestionsProcessed": sug_added,
                }
            }
        )


def main():
    parser = argparse.ArgumentParser(description="Ticker-Tok server (static + SQLite API)")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    args = parser.parse_args()

    init_db()

    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print("Ticker-Tok server running on http://%s:%s" % (args.host, args.port))
    print("SQLite DB: %s" % DB_PATH)
    print("Default password for seeded users: %s" % DEFAULT_PASSWORD)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
