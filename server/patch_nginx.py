#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 nginx 的 starwhisper 站点插入 /english/ 静态目录与 /english/api/ 反代。
幂等：已经有标记就跳过。改完自动备份。"""
import io
import os
import shutil
import sys
import time

MARK = "# ---- english-coach ----"
BLOCK = """    # ---- english-coach ----
    location = /english { return 301 /english/; }
    location /english/api/ {
        proxy_pass http://127.0.0.1:8093;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
        client_max_body_size 8m;
    }
    location /english/ {
        alias /opt/english-coach/web/;
        index index.html;
        add_header Cache-Control "no-cache";
    }
    # ---- english-coach end ----

"""

TARGETS = ["/etc/nginx/conf.d/starwhisper.conf", "/etc/nginx/conf.d/starwhisper-domain.conf"]


def patch(path):
    if not os.path.exists(path):
        return "skip (不存在)"
    with io.open(path, "r", encoding="utf-8") as f:
        text = f.read()
    if MARK in text:
        return "skip (已存在)"
    anchor = "\n    location / {"
    idx = text.find(anchor)
    if idx < 0:
        return "FAIL (找不到 location / 锚点)"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, path + ".bak-eng-" + stamp)
    new = text[:idx] + "\n" + BLOCK + text[idx + 1:]
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(new)
    return "patched (备份 .bak-eng-" + stamp + ")"


def main():
    for t in TARGETS:
        print("%-50s %s" % (t, patch(t)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
