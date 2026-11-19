/* 小程序发音：走「微信同声传译」插件（WechatSI）的 textToSpeech
 *
 * 前提：必须在小程序后台添加插件
 *   设置 → 第三方设置 → 插件管理 → 添加插件 → 搜「微信同声传译」
 *   provider: wx069ba97219f66d99
 * 没添加就在 app.json 里声明会编译报错，所以这里是懒加载 + 兜底。
 */

let plugin = null;
let probed = false;
let usable = false;
let audio = null;
let lastSrc = "";
let speaking = false;

function probe() {
  if (probed) return usable;
  probed = true;
  try {
    /* 只有 app.json 里声明了 plugins.WechatSI 才能拿到 */
    plugin = requirePlugin("WechatSI");
    usable = !!(plugin && plugin.textToSpeech);
  } catch (e) {
    plugin = null;
    usable = false;
  }
  return usable;
}

function available() {
  return probe();
}

function getAudio() {
  if (audio) return audio;
  audio = wx.createInnerAudioContext();
  audio.obeyMuteSwitch = true; /* 跟着手机的静音键走，不硬放 */
  audio.onEnded(function () {
    speaking = false;
  });
  audio.onError(function () {
    speaking = false;
  });
  return audio;
}

function play(src) {
  if (!src) return;
  const a = getAudio();
  try {
    a.stop();
  } catch (e) {}
  lastSrc = src;
  a.src = src;
  a.play();
}

/**
 * 朗读一个英文单词
 * @param {string} text
 * @param {object} opt  { rate, onFail }
 */
function speak(text, opt) {
  const t = String(text || "").trim();
  if (!t) return;
  if (!probe()) {
    if (opt && opt.onFail) opt.onFail("plugin-unavailable");
    return;
  }
  try {
    plugin.textToSpeech({
      lang: "en_US",
      tts: true,
      content: t,
      success: function (res) {
        if (res && res.filename) {
          speaking = true;
          play(res.filename);
        } else if (opt && opt.onFail) {
          opt.onFail("no-audio");
        }
      },
      fail: function (e) {
        if (opt && opt.onFail) opt.onFail((e && (e.msg || e.retcode)) || "tts-failed");
      },
    });
  } catch (e) {
    if (opt && opt.onFail) opt.onFail(e.message || "tts-error");
  }
}

function stop() {
  if (audio) {
    try {
      audio.stop();
    } catch (e) {}
  }
  speaking = false;
}

module.exports = { available: available, speak: speak, stop: stop };
