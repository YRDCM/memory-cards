#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「记忆卡片盒」的同步数据翻译成能说出口的话。

给大肥鱼用的只读工具。数据在 /opt/english-coach/data/<同步码>.json，
是她自己机器上的普通文件，不需要任何接口。

用法：
    python3 study-report.py                # 人话版进度
    python3 study-report.py --json         # 机器版，方便她再加工
    python3 study-report.py --nag          # 一句催人的话（晚上推送用）
    python3 study-report.py --quiz 5       # 抽 5 个该复习的词，只给英文
    python3 study-report.py --quiz 5 --answers   # 连答案一起给
    python3 study-report.py --code xxxx    # 指定同步码（默认取最新的那个）
"""
import glob
import json
import os
import random
import sys
import time

DATA_DIR = os.environ.get("EYC_DATA_DIR", "/opt/english-coach/data")
WORDS_PATH = os.environ.get("EYC_WORDS", "/opt/english-coach/words.json")


def word_map():
    try:
        with open(WORDS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def load(code=None):
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.json")), key=os.path.getmtime, reverse=True)
    if not files:
        return None, None
    if code:
        p = os.path.join(DATA_DIR, code + ".json")
        if not os.path.exists(p):
            return None, code
    else:
        p = files[0]
    try:
        with open(p, "r", encoding="utf-8") as f:
            blob = json.load(f)
    except Exception:
        return None, os.path.basename(p)[:-5]
    return blob.get("state") or {}, os.path.basename(p)[:-5]


def summarize(state):
    prog = state.get("prog") or {}
    daily = state.get("daily") or {}
    meta = state.get("meta") or {}
    st = state.get("set") or {}
    now = time.time() * 1000
    today = time.strftime("%Y-%m-%d")

    due = sorted(
        (k for k, v in prog.items() if (v.get("due") or 0) <= now),
        key=lambda k: prog[k].get("due") or 0,
    )
    d = daily.get(today) or {}
    goal = int(st.get("dailyNew") or 20)
    target = int(st.get("targetMin") or 25)

    # 连续天数
    def checked(day):
        x = daily.get(day) or {}
        return (x.get("cards") or 0) >= max(5, goal)

    streak = 0
    t = time.time()
    for i in range(400):
        day = time.strftime("%Y-%m-%d", time.localtime(t - i * 86400))
        if checked(day):
            streak += 1
        elif i > 0:
            break

    # 最该复习的：拖得最久的
    urgent = []
    for k in due[:8]:
        p = prog[k]
        lag = max(0.0, (now - (p.get("seen") or now)) / 86400000.0)
        urgent.append({"word": k, "days": round(lag, 1)})

    return {
        "date": today,
        "newDone": int(d.get("newW") or 0),
        "newGoal": goal,
        "reviews": int(d.get("reviews") or 0),
        "minutes": round((d.get("sec") or 0) / 60.0),
        "targetMin": target,
        "cards": int(d.get("cards") or 0),
        "due": len(due),
        "learned": len(prog),
        "streak": streak,
        "bestStreak": int(meta.get("bestStreak") or 0),
        "lastActive": meta.get("lastActive") or "",
        "urgent": urgent,
        "dueList": due[:200],
    }


def wo_ren_hua(s):
    lines = []
    lines.append("【记忆卡片盒】%s" % s["date"])
    lines.append(
        "今日：新词 %d/%d · 复习 %d 个 · 专注 %d/%d 分"
        % (s["newDone"], s["newGoal"], s["reviews"], s["minutes"], s["targetMin"])
    )
    lines.append("待复习 %d 个 · 已学 %d 词 · 连续 %d 天（最长 %d）" % (s["due"], s["learned"], s["streak"], s["bestStreak"]))
    if s["urgent"]:
        top = "、".join("%s(拖了%g天)" % (u["word"], u["days"]) for u in s["urgent"][:5])
        lines.append("最该看：" + top)
    if s["cards"] == 0:
        lines.append("→ 今天还一张卡没背。")
    elif s["newDone"] < s["newGoal"]:
        lines.append("→ 还差 %d 个新词。别停在半路。" % (s["newGoal"] - s["newDone"]))
    elif s["due"] > 0:
        lines.append("→ 新词够了，但还有 %d 个到期没复习。" % s["due"])
    else:
        lines.append("→ 今天全部完成。")
    return "\n".join(lines)


def nag(s):
    if s["cards"] == 0:
        if s["streak"] > 0:
            return "今天一张卡都没背，你的 %d 天连续要断了。" % s["streak"]
        return "今天还没开始背，%d 个新词在等你。" % s["newGoal"]
    if s["newDone"] < s["newGoal"]:
        return "差 %d 个新词就完成了，别停在半路。" % (s["newGoal"] - s["newDone"])
    if s["due"] > 0:
        return "新词够了，但还有 %d 个词到期没复习，越拖越难记。" % s["due"]
    return "今天完成了，明天见。"


def quiz(state, n, with_answers):
    prog = state.get("prog") or {}
    now = time.time() * 1000
    due = [k for k, v in prog.items() if (v.get("due") or 0) <= now]
    pool = due or list(prog.keys())
    random.shuffle(pool)
    picked = pool[:n]
    wm = word_map()
    out = []
    for k in picked:
        p = prog.get(k) or {}
        meta = wm.get(k.lower()) or wm.get(k) or {}
        out.append({
            "word": k,
            "pos": meta.get("p") or "",
            "cn": meta.get("c") or "",
            "lag": round(max(0.0, (now - (p.get("seen") or now)) / 86400000.0), 1),
        })
    return out


def main():
    args = sys.argv[1:]
    code = None
    if "--code" in args:
        i = args.index("--code")
        if i + 1 < len(args):
            code = args[i + 1]

    state, used = load(code)
    if state is None:
        print("还没有任何学习数据。")
        print("先在 App 的「设置 → 多设备同步」里生成并启用同步码，数据才会落到服务器上。")
        return 1

    s = summarize(state)
    s["syncCode"] = used

    if "--json" in args:
        print(json.dumps(s, ensure_ascii=False, indent=1))
    elif "--nag" in args:
        print(nag(s))
    elif "--quiz" in args:
        i = args.index("--quiz")
        n = int(args[i + 1]) if i + 1 < len(args) and args[i + 1].isdigit() else 5
        for q in quiz(state, n, "--answers" in args):
            if "--answers" in args:
                print("%s  %s %s" % (q["word"], q["pos"], q["cn"]))
            else:
                print(q["word"])
    else:
        print(wo_ren_hua(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
