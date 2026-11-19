#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""记忆卡片盒 · 同步服务
只做一件事：按「同步码」存取一份 JSON 状态，带版本号防覆盖。
不存账号、不存密码，同步码本身即凭据。
"""
import glob
import json
import os
import re
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs, quote

ROOT = os.environ.get("EYC_DATA", "/opt/english-coach/data")
AUDIO_DIR = os.path.join(os.path.dirname(ROOT.rstrip("/")), "audio")
PORT = int(os.environ.get("EYC_PORT", "8093"))
CODE_RE = re.compile(r"^[a-z0-9]{16,64}$")
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z' \-]{0,59}$")
MAX_BODY = 4 * 1024 * 1024
LOCK = threading.Lock()


def path_for(code):
    return os.path.join(ROOT, code + ".json")


def read_state(code):
    p = path_for(code)
    if not os.path.exists(p):
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_state(code, obj):
    p = path_for(code)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def _today():
    return time.strftime("%Y-%m-%d")


def _streak(daily, goal):
    def ok(day):
        d = daily.get(day) or {}
        return (d.get("cards") or 0) >= max(5, goal)

    n = 0
    t = time.time()
    for i in range(400):
        day = time.strftime("%Y-%m-%d", time.localtime(t - i * 86400))
        if ok(day):
            n += 1
        elif i > 0:
            break
    return n


def user_summary(code, blob):
    """把一个同步码的数据压成后台列表用的一行。"""
    st = blob.get("state") or {}
    prog = st.get("prog") or {}
    daily = st.get("daily") or {}
    st_set = st.get("set") or {}
    meta = st.get("meta") or {}
    now = time.time() * 1000
    today = _today()
    d = daily.get(today) or {}
    goal = int(st_set.get("dailyNew") or 20)

    due = 0
    for v in prog.values():
        if (v.get("due") or 0) <= now:
            due += 1

    cards = 0
    sec = 0
    neww = 0
    correct = 0
    for x in daily.values():
        cards += x.get("cards") or 0
        sec += x.get("sec") or 0
        neww += x.get("newW") or 0
        correct += x.get("correct") or 0

    days = [k for k, v in daily.items() if (v.get("cards") or 0) > 0]

    return {
        "code": code,
        "short": code[:8],
        "learned": len(prog),
        "due": due,
        "todayNew": int(d.get("newW") or 0),
        "goal": goal,
        "todayCards": int(d.get("cards") or 0),
        "todayMin": round((d.get("sec") or 0) / 60.0),
        "cards": cards,
        "minutes": round(sec / 60.0),
        "newWords": neww,
        "accuracy": round((correct / cards) * 100) if cards else 0,
        "streak": _streak(daily, goal),
        "best": int(meta.get("bestStreak") or 0),
        "activeDays": len(days),
        "deck": st_set.get("deck") or "all",
        "lastActive": meta.get("lastActive") or "",
        "updatedAt": blob.get("updatedAt") or 0,
        "rev": blob.get("rev") or 0,
        "bytes": len(json.dumps(blob, ensure_ascii=False)),
    }


def user_detail(code, blob):
    row = user_summary(code, blob)
    st = blob.get("state") or {}
    daily = st.get("daily") or {}
    days = []
    for i in range(29, -1, -1):
        k = time.strftime("%Y-%m-%d", time.localtime(time.time() - i * 86400))
        x = daily.get(k) or {}
        days.append(
            {
                "day": k,
                "cards": int(x.get("cards") or 0),
                "newW": int(x.get("newW") or 0),
                "reviews": int(x.get("reviews") or 0),
                "min": round((x.get("sec") or 0) / 60.0),
                "correct": int(x.get("correct") or 0),
            }
        )
    row["days"] = days
    row["totalWords"] = int((st.get("set") or {}).get("dailyNew") or 20)
    return row


def admin_users():
    out = []
    for p in glob.glob(os.path.join(ROOT, "*.json")):
        code = os.path.basename(p)[:-5]
        if not CODE_RE.match(code):
            continue
        try:
            with open(p, "r", encoding="utf-8") as f:
                blob = json.load(f)
        except Exception:
            continue
        try:
            out.append(user_summary(code, blob))
        except Exception:
            continue
    out.sort(key=lambda x: x.get("updatedAt") or 0, reverse=True)
    return out


def admin_user(code):
    p = path_for(code)
    if not CODE_RE.match(code) or not os.path.exists(p):
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            blob = json.load(f)
        return user_detail(code, blob)
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "eyc-sync/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _code(self):
        q = parse_qs(urlparse(self.path).query)
        return ((q.get("code") or [""])[0] or "").strip().lower()

    def do_GET(self):
        if "ping" in self.path:
            return self._send(200, {"ok": True, "service": "eyc-sync", "time": int(time.time() * 1000)})
        if "/admin/api/" in self.path:
            return self.admin_get()
        parsed0 = urlparse(self.path)
        if parsed0.path.endswith("/audio"):
            return self.audio(parse_qs(parsed0.query))
        code = self._code()
        if not CODE_RE.match(code):
            return self._send(400, {"error": "bad code"})
        with LOCK:
            try:
                data = read_state(code)
            except Exception:
                return self._send(500, {"error": "read failed"})
        if data is None:
            return self._send(404, {"error": "empty"})
        return self._send(200, data)

    def _send_audio(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=2592000")
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    def audio(self, q):
        """单词发音：代理 + 落盘缓存，客户端不用碰第三方域名"""
        word = ((q.get("w") or [""])[0] or "").strip()
        if not WORD_RE.match(word):
            return self._send(400, {"error": "bad word"})
        key = re.sub(r"[^a-z0-9]", "", word.lower()) or "x"
        try:
            os.makedirs(AUDIO_DIR, exist_ok=True)
        except Exception:
            pass
        fn = os.path.join(AUDIO_DIR, key + ".mp3")
        try:
            if os.path.exists(fn) and os.path.getsize(fn) > 512:
                with open(fn, "rb") as f:
                    return self._send_audio(f.read())
        except Exception:
            pass
        try:
            url = "https://dict.youdao.com/dictvoice?type=2&audio=" + quote(word)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as r:
                data = r.read()
        except Exception:
            return self._send(502, {"error": "tts failed"})
        if not data or len(data) < 512:
            return self._send(404, {"error": "no audio"})
        try:
            with open(fn, "wb") as f:
                f.write(data)
        except Exception:
            pass
        return self._send_audio(data)

    def admin_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        q = parse_qs(parsed.query)
        if path.endswith("/users"):
            with LOCK:
                data = admin_users()
            return self._send(200, {"users": data, "serverTime": int(time.time() * 1000)})
        if path.endswith("/user"):
            code = ((q.get("code") or [""])[0] or "").strip().lower()
            with LOCK:
                data = admin_user(code)
            if not data:
                return self._send(404, {"error": "not found"})
            return self._send(200, data)
        return self._send(404, {"error": "unknown"})

    def do_PUT(self):
        code = self._code()
        if not CODE_RE.match(code):
            return self._send(400, {"error": "bad code"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self._send(413, {"error": "bad length"})
        try:
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._send(400, {"error": "bad json"})
        if not isinstance(payload, dict) or not isinstance(payload.get("state"), dict):
            return self._send(400, {"error": "bad payload"})

        rev = payload.get("rev") or 0
        with LOCK:
            try:
                cur = read_state(code)
            except Exception:
                cur = None
            if cur is not None and (cur.get("rev") or 0) != rev:
                return self._send(409, cur)
            old = (cur.get("rev") if cur else 0) or 0
            new = {
                "rev": old + 1,
                "updatedAt": int(time.time() * 1000),
                "state": payload["state"],
            }
            try:
                write_state(code, new)
            except Exception:
                return self._send(500, {"error": "write failed"})
        return self._send(200, {"rev": new["rev"], "updatedAt": new["updatedAt"]})


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    if not os.path.isdir(ROOT):
        os.makedirs(ROOT)
    srv = Server(("127.0.0.1", PORT), Handler)
    sys.stderr.write("eyc-sync listening 127.0.0.1:%d  data=%s\n" % (PORT, ROOT))
    sys.stderr.flush()
    srv.serve_forever()


if __name__ == "__main__":
    main()
