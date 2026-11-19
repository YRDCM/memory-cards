/* 小程序发音：走自己服务器的转发接口，不依赖任何插件
 *
 * /english/api/audio?w=hello  →  服务端代理有道发音并落盘缓存
 * 好处：不用申请插件（同声传译插件要求类目匹配，加不上），
 *       域名已经在 request 白名单里，不用额外配置。
 */

const API = "https://mystarwhisper.cn/english/api";

let audio = null;
let current = "";

function getAudio() {
  if (audio) return audio;
  audio = wx.createInnerAudioContext();
  audio.obeyMuteSwitch = true; /* 跟着手机静音键走 */
  audio.onError(function () {
    current = "";
  });
  return audio;
}

/* 接口一直在，按钮恒可用 */
function available() {
  return true;
}

function speak(text) {
  const word = String(text || "").trim();
  if (!word) return;
  const a = getAudio();
  const url = API + "/audio?w=" + encodeURIComponent(word.slice(0, 120));
  current = url;
  try {
    a.stop();
  } catch (e) {}
  a.src = url;
  a.play();
}

function stop() {
  if (audio) {
    try {
      audio.stop();
    } catch (e) {}
  }
  current = "";
}

module.exports = { available: available, speak: speak, stop: stop };
