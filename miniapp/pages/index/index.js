const store = require("../../utils/store.js");
const sync = require("../../utils/sync.js");

Page({
  data: {
    coachText: "",
    today: "",
    pct: 0,
    newDone: 0,
    newGoal: 20,
    dueLeft: 0,
    minDone: 0,
    minGoal: 25,
    streak: 0,
    learned: 0,
    totalLeft: 0,
    ctaText: "开始学习",
    loaded: false,
  },

  onShow() {
    this.refresh();
    if (sync.enabled()) {
      sync.pull().then(() => this.refresh());
    }
  },

  onPullDownRefresh() {
    sync.pull().then(() => {
      this.refresh();
      wx.stopPullDownRefresh();
    });
  },

  refresh() {
    const S = store.state();
    const d = store.day();
    const due = store.dueList().length;
    const learned = store.learnedCount();
    const goal = S.set.dailyNew;
    const sec = d.sec || 0;

    const pctNew = Math.min(d.newW, goal) / Math.max(1, goal);
    const pctMin = Math.min(sec / 60, S.set.targetMin) / Math.max(1, S.set.targetMin);
    const pct = Math.round((pctNew * 0.7 + pctMin * 0.3) * 100);

    const totalLeft = due + goal;

    const plan = store.planToday(0);

    this.setData({
      coachText: this.coachLine(d, due, learned, goal),
      today: store.todayKey(),
      pct: pct,
      newDone: d.newW,
      newGoal: goal,
      dueLeft: due,
      minDone: Math.round(sec / 60),
      minGoal: S.set.targetMin,
      streak: store.streak(),
      learned: learned,
      totalLeft: totalLeft,
      ctaText:
        "开始学习 · 复习 " + plan.reviewTake +
        (plan.due > plan.reviewTake ? "（共 " + plan.due + "）" : "") +
        (plan.newQuota > 0 ? " + 新词 " + plan.newQuota : " · 先还债"),
      loaded: true,
    });
  },

  coachLine(d, due, learned, goal) {
    const S = store.state();
    const hour = new Date().getHours();
    if (d.cards === 0) {
      if (learned === 0) {
        return "第一次见面。今天的量很小：" + goal + " 个新词，" + S.set.targetMin + " 分钟。点下面的按钮，我们开始。";
      }
      if (hour >= 21) return "这么晚了还一个字没背。现在开始，20 分钟也够把今天救回来。";
      return "今天的任务：新词 " + goal + " 个" + (due ? "，到期复习 " + due + " 个" : "") + "。先做完，再去干别的。";
    }
    if (d.newW < goal) {
      return "已经背了 " + d.newW + " 个，还差 " + (goal - d.newW) + " 个。别停在半路 —— 一停，前面这些就白背了。";
    }
    if (due > 0) return "新词够了。但还有 " + due + " 个词到期没复习。复习比学新词值钱。";
    return "今天标准（" + goal + " 个新词）已经完成了。想接着背就点下面的按钮，不想就明天见。";
  },

  onStart() {
    wx.navigateTo({ url: "/pages/study/study?extra=0" });
  },

  onReviewOnly() {
    wx.navigateTo({ url: "/pages/study/study?review=1" });
  },
});
