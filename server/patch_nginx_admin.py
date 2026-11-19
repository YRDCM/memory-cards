#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 nginx 加管理后台的路由（静态页 + 接口反代），带 Basic Auth。
幂等：已有标记就跳过。"""
import io
import os
import shutil
import sys
import time

MARK = "# ---- english-coach admin ----"

BLOCK = """    # ---- english-coach admin ----
    location /english/admin/api/ {
        auth_basic "memory-cards admin";
        auth_basic_user_file /opt/english-coach/.htpasswd;
        proxy_pass http://127.0.0.1:8093;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
    location = /english/admin {
        auth_basic "memory-cards admin";
        auth_basic_user_file /opt/english-coach/.htpasswd;
        return 301 /english/admin/;
    }
    location /english/admin/ {
        auth_basic "memory-cards admin";
        auth_basic_user_file /opt/english-coach/.htpasswd;
        alias /opt/english-coach/admin/;
        index index.html;
        add_header Cache-Control "no-cache";
    }
    # ---- english-coach admin end ----

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
        return "FAIL (找不到锚点)"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, path + ".bak-admin-" + stamp)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(text[:idx] + "\n" + BLOCK + text[idx + 1:])
    return "patched (备份 .bak-admin-" + stamp + ")"


if __name__ == "__main__":
    for t in TARGETS:
        print("%-46s %s" % (t, patch(t)))
