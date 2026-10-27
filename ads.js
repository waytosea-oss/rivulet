/* Portal ad adapter. Default is a no-op so the game never waits on a network.
   ?sdk=poki or ?sdk=crazygames loads that SDK. A portal zip can also set
   window.RIVULET_SDK and window.RIVULET_PORTAL before this file. */
(function (root) {
  'use strict';
  var q = new URLSearchParams(location.search);
  var baked = (root.RIVULET_SDK || '').toLowerCase();
  var asked = (q.get('sdk') || baked || '').toLowerCase();
  if (asked === 'crazy') asked = 'crazygames';
  var portal = root.RIVULET_PORTAL === 1 || root.RIVULET_PORTAL === true || q.get('portal') === '1' || !!asked;
  var preview = q.get('ads') === 'preview';
  var mode = 'stub';
  var ready = Promise.resolve();
  var lastMid = 0;
  var GAP = 180000;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('sdk')); };
      document.head.appendChild(s);
    });
  }

  function veil(label) {
    return new Promise(function (res) {
      var el = document.createElement('div');
      el.className = 'adveil';
      el.innerHTML = '<div class="adcard"><p>' + label + '</p><b id="adsec">2</b></div>';
      document.body.appendChild(el);
      var n = 2;
      var timer = setInterval(function () {
        n -= 1;
        var b = el.querySelector('#adsec');
        if (b) b.textContent = String(Math.max(0, n));
        if (n <= 0) { clearInterval(timer); el.remove(); res(); }
      }, 700);
    });
  }

  if (asked === 'poki') {
    mode = 'poki';
    ready = (root.PokiSDK ? Promise.resolve() : loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js'))
      .then(function () { return root.PokiSDK.init(); })
      .catch(function () { mode = 'stub'; });
  } else if (asked === 'crazygames') {
    mode = 'crazygames';
    ready = (root.CrazyGames && root.CrazyGames.SDK ? Promise.resolve() : loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js'))
      .then(function () { return root.CrazyGames.SDK.init(); })
      .catch(function () { mode = 'stub'; });
  } else if (preview) mode = 'preview';

  if (portal) document.documentElement.classList.add('portal');

  function call(fn) {
    try { fn(); } catch (e) {}
  }

  function gameplayStart() {
    ready.then(function () {
      if (mode === 'poki' && root.PokiSDK) call(function () { root.PokiSDK.gameplayStart(); });
      if (mode === 'crazygames' && root.CrazyGames) call(function () { root.CrazyGames.SDK.game.gameplayStart(); });
    });
  }
  function gameplayStop() {
    ready.then(function () {
      if (mode === 'poki' && root.PokiSDK) call(function () { root.PokiSDK.gameplayStop(); });
      if (mode === 'crazygames' && root.CrazyGames) call(function () { root.CrazyGames.SDK.game.gameplayStop(); });
    });
  }
  function loadingStart() {
    ready.then(function () {
      if (mode === 'poki' && root.PokiSDK && root.PokiSDK.gameLoadingStart) call(function () { root.PokiSDK.gameLoadingStart(); });
      if (mode === 'crazygames' && root.CrazyGames) call(function () { root.CrazyGames.SDK.game.loadingStart(); });
    });
  }
  function loadingStop() {
    ready.then(function () {
      if (mode === 'poki' && root.PokiSDK && root.PokiSDK.gameLoadingFinished) call(function () { root.PokiSDK.gameLoadingFinished(); });
      if (mode === 'crazygames' && root.CrazyGames) call(function () { root.CrazyGames.SDK.game.loadingStop(); });
    });
  }
  function commercialBreak() {
    return ready.then(function () {
      var now = Date.now();
      if (mode !== 'preview' && now - lastMid < GAP) return;
      lastMid = now;
      if (mode === 'poki' && root.PokiSDK) return root.PokiSDK.commercialBreak();
      if (mode === 'crazygames' && root.CrazyGames) return root.CrazyGames.SDK.ad.requestAd('midgame');
      if (mode === 'preview') return veil('Advertisement');
    }).catch(function () {});
  }
  function rewardedBreak() {
    return ready.then(function () {
      if (mode === 'poki' && root.PokiSDK) {
        return root.PokiSDK.rewardedBreak().then(function (ok) { return !!ok; });
      }
      if (mode === 'crazygames' && root.CrazyGames) {
        return root.CrazyGames.SDK.ad.requestAd('rewarded').then(function () { return true; }).catch(function () { return false; });
      }
      if (mode === 'preview') return veil('A short reward').then(function () { return true; });
      if (portal) return false;
      return true;
    }).catch(function () { return false; });
  }

  root.Ads = {
    portal: portal, mode: mode, ready: ready,
    gameplayStart: gameplayStart, gameplayStop: gameplayStop,
    loadingStart: loadingStart, loadingStop: loadingStop,
    commercialBreak: commercialBreak, rewardedBreak: rewardedBreak
  };
})(window);
