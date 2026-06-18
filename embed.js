/* =====================================================================
 * embed.js — AI 虛擬人嵌入載入器
 * 用法：在任何網站貼一行（跨網站請用部署後的完整網址）：
 *   <script src="https://YOUR-DEPLOY.example/embed.js"></script>
 *   同網域可用： <script src="embed.js" data-widget="widget.html"></script>
 *
 * 建立右下角 iframe（裝虛擬人）+ 收合泡泡，用 postMessage 與 iframe 溝通，
 * 並開好 microphone 權限。對外提供 window.AvatarWidget = { open, close, say }。
 * ===================================================================== */
(function () {
  'use strict';

  // 注入收合泡泡的 hover / 注意力 pulse 動畫
  var awStyle = document.createElement('style');
  awStyle.textContent =
    '#avatar-widget-root .aw-bubble{transition:transform .15s, box-shadow .15s;}'
    + '#avatar-widget-root .aw-bubble:hover{transform:scale(1.07);}'
    + '#avatar-widget-root .aw-bubble:active{transform:scale(.95);}'
    + '#avatar-widget-root .aw-bubble:focus-visible{outline:3px solid rgba(91,84,232,.45);outline-offset:3px;}'
    + '#avatar-widget-root .aw-bubble::after{content:"";position:absolute;inset:0;border-radius:50%;animation:awpulse 2.2s ease-out infinite;pointer-events:none;}'
    + '@keyframes awpulse{0%{box-shadow:0 0 0 0 rgba(91,84,232,.5);}70%{box-shadow:0 0 0 13px rgba(91,84,232,0);}100%{box-shadow:0 0 0 0 rgba(91,84,232,0);}}';
  (document.head || document.documentElement).appendChild(awStyle);

  // 1) 找出自己的位置，推算 widget.html 的網址（可用 data-widget 覆蓋）
  var me = document.currentScript || (function () {
    var ss = document.getElementsByTagName('script');
    for (var i = ss.length - 1; i >= 0; i--) { if (/embed\.js(\?|$)/.test(ss[i].src || '')) return ss[i]; }
    return null;
  })();
  var base = me ? me.src.replace(/[^/]*$/, '') : '';
  var widgetUrl = (me && me.getAttribute('data-widget')) || (base + 'widget.html');
  var startOpen = (me && me.getAttribute('data-open') === 'true'); // 預設一進來就展開
  var widgetOrigin = (function () { try { return new URL(widgetUrl, location.href).origin; } catch (e) { return '*'; } })();

  // 把可設定項帶進 widget：皮=model / 肉的語音後端=api / 內容=knowledge / 聲線=voice
  var cfg = new URLSearchParams();
  ['model', 'api', 'knowledge', 'voice'].forEach(function (k) {
    var v = me && me.getAttribute('data-' + k);
    if (v) cfg.set(k, v);
  });
  var cfgQs = cfg.toString();
  var iframeSrc = widgetUrl + (cfgQs ? (widgetUrl.indexOf('?') < 0 ? '?' : '&') + cfgQs : '');

  var EXPANDED = { w: 238, h: 336 };
  var NS_OUT = 'avatar-widget-host'; // 父 → 子
  var NS_IN  = 'avatar-widget';      // 子 → 父

  // 2) 建外層容器
  var root = document.createElement('div');
  root.id = 'avatar-widget-root';
  root.style.cssText = [
    'position:fixed', 'left:16px', 'bottom:16px',
    'z-index:2147483000', 'width:' + EXPANDED.w + 'px', 'height:' + EXPANDED.h + 'px'
  ].join(';');

  // 3) iframe（虛擬人本體）
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.title = 'AI 虛擬人助理';                 // 無障礙：給 iframe 一個名字
  iframe.setAttribute('allow', 'microphone; autoplay'); // 語音輸入 + 音訊播放
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';

  // 4) 收合後的小泡泡（iframe 收起時顯示，點它再展開）
  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'aw-bubble';
  bubble.setAttribute('aria-label', '開啟 AI 虛擬人助理');
  bubble.textContent = '💬';
  bubble.style.cssText = [
    'position:absolute', 'left:2px', 'bottom:2px', 'width:40px', 'height:40px',
    'border:0', 'border-radius:50%', 'cursor:pointer', 'font-size:18px',
    'background:linear-gradient(135deg,#7d78f0,#5b54e8)', 'color:#fff',
    'box-shadow:0 8px 22px rgba(0,0,0,.3)',
    'display:none', 'align-items:center', 'justify-content:center'
  ].join(';');

  root.appendChild(iframe);
  root.appendChild(bubble);
  (document.body || document.documentElement).appendChild(root);

// 5) 展開 / 收合
  function setOpen(open) {
    if (open) {
      root.style.width = EXPANDED.w + 'px';
      root.style.height = EXPANDED.h + 'px';
      iframe.style.visibility = 'visible';
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'auto'; // 確保展開時可以點擊
      bubble.style.display = 'none';
    } else {
      // 這裡的 51px 請對應你目前設定的泡泡大小
      root.style.width = '51px'; 
      root.style.height = '51px';
      iframe.style.visibility = 'hidden';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none'; // 確保收起時，隱形的畫布不會擋住滑鼠點擊
      bubble.style.display = 'flex';
    }
  }
  bubble.onclick = function () { setOpen(true); };
  setOpen(startOpen);

// 6) 接收 iframe 的訊息（放寬 origin 驗證，避免本地端或跨域測試被擋）
  window.addEventListener('message', function (e) {
    // 移除這一行：if (widgetOrigin !== '*' && e.origin !== widgetOrigin) return; 
    
    var d = e.data || {};
    if (d.ns !== NS_IN) return;
    
    if (d.type === 'close') setOpen(false);                 // 使用者按 ✕ → 收成泡泡
    if (d.type === 'ready') { /* 之後可在這觸發歡迎語 */ }
    if (d.type === 'error') console.warn('[avatar] widget error:', d.message);
  });

  // 7) 對外 API：別的程式可以叫她說話 / 開關
  window.AvatarWidget = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    say: function (text) {
      setOpen(true);
      iframe.contentWindow && iframe.contentWindow.postMessage(
        { ns: NS_OUT, type: 'say', text: String(text || '').slice(0, 600) }, widgetOrigin);
    }
  };
})();
