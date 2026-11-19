const store = require("../../utils/store.js");

Page({
  data: {
    minutes: 0,
    cards: 0,
    newWords: 0,
    accuracy: 0,
    days: 0,
    best: 0,
    streak: 0,
    learned: 0,
    due: 0,
    rows: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const S = store.state();
    let cards = 0;
    let correct = 0;
    let sec = 0;
    let newW = 0;
    let days = 0;
    Object.keys(S.daily).forEach((k) => {
      const d = S.daily[k];
      if (!d || !d.cards) return;
      days += 1;
      cards += d.cards;
      correct += d.correct || 0;
      sec += d.sec || 0;
      newW += d.newW || 0;
    });

    const rows = [];
    for (let i = 13; i >= 0; i--) {
      const k = store.shiftKey(store.todayKey(), -i);
      const d = S.daily[k] || { cards: 0, sec: 0, newW: 0, reviews: 0, correct: 0 };
      rows.push({
        day: k.slice(5),
        cards: d.cards,
        newW: d.newW,
        min: Math.round((d.sec || 0) / 60),
        acc: d.cards ? Math.round((d.correct / d.cards) * 100) + "%" : "—",
      });
    }

    this.setData({
      minutes: Math.round(sec / 60),
      cards: cards,
      newWords: newW,
      accuracy: cards ? Math.round((correct / cards) * 100) : 0,
      days: days,
      best: S.meta.bestStreak || 0,
      streak: store.streak(),
      learned: store.learnedCount(),
      due: store.dueList().length,
      rows: rows,
    });
  },
});
