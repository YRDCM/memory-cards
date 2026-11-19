#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""记忆卡片盒 · 同步服务
只做一件事：按「同步码」存取一份 JSON 状态，带版本号防覆盖。
不存账号、不存密码，同步码本身即凭据。
"""
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

ROOT = os.environ.get("EYC_DATA", "/opt/english-coach/data")
PORT = int(os.environ.get("EYC_PORT", "8093"))
CODE_RE = re.compile(r"^[a-z0-9]{16,64}$")
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
