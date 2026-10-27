/* All sound is synthesized in the browser. No audio files, no third-party samples. */
(function (root) {
  'use strict';
  var ac = null, master = null, musicGain = null, pourGain = null, pourSrc = null;
  var soundOn = true, musicOn = true, started = false;
  var musicTimer = null, stepN = 0;

  function ctx() {
    if (!ac) {
      var C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
      pourGain = ac.createGain(); pourGain.gain.value = 0; pourGain.connect(master);
      var buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      pourSrc = ac.createBufferSource(); pourSrc.buffer = buf; pourSrc.loop = true;
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
      pourSrc.connect(bp); bp.connect(pourGain); pourSrc.start();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function envGain() {
    var g = ctx().createGain(); g.connect(master); return g;
  }
  function tone(freq, t, dur, type, vol) {
    if (!soundOn || !ctx()) return;
    var o = ac.createOscillator(), g = envGain();
    o.type = type || 'sine'; o.frequency.value = freq; o.connect(g);
    var now = ac.currentTime + (t || 0);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now); o.stop(now + dur + 0.02);
  }
  function noiseBurst(dur, vol, freq) {
    if (!soundOn || !ctx()) return;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = 0.6;
    var g = envGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); src.start();
  }

  var NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  function musicTick() {
    if (!musicOn || !ctx()) return;
    var f = NOTES[stepN % NOTES.length];
    stepN++;
    if (stepN % 4 === 0) f *= 0.5;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    o.connect(g); g.connect(musicGain);
    var now = ac.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    o.start(now); o.stop(now + 0.6);
  }

  root.SFX = {
    unlock: function () { started = true; ctx(); },
    setSound: function (on) { soundOn = !!on; if (pourGain && !soundOn) pourGain.gain.value = 0; },
    setMusic: function (on) {
      musicOn = !!on;
      if (!ctx()) return;
      if (musicOn && !musicTimer) musicTimer = setInterval(musicTick, 720);
      if (!musicOn && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      musicGain.gain.setTargetAtTime(musicOn ? 0.22 : 0, ac.currentTime, 0.05);
    },
    pour: function (on, amount) {
      if (!pourGain || !ctx()) return;
      var target = soundOn && on ? Math.min(0.18, 0.04 + (amount || 0.2) * 0.12) : 0;
      pourGain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
    },
    tap: function () { tone(540, 0, 0.09, 'triangle', 0.06); tone(320, 0, 0.07, 'sine', 0.03); },
    draw: function () { tone(660 + Math.random() * 80, 0, 0.05, 'sine', 0.03); },
    splash: function (n) { noiseBurst(0.18, Math.min(0.35, 0.08 + n * 0.01), 1800); tone(420, 0, 0.12, 'sine', 0.04); },
    win: function () {
      tone(523, 0, 0.18, 'triangle', 0.07);
      tone(659, 0.1, 0.2, 'triangle', 0.07);
      tone(784, 0.2, 0.22, 'triangle', 0.07);
      tone(1046, 0.32, 0.4, 'sine', 0.06);
    },
    fail: function () { tone(392, 0, 0.16, 'sine', 0.05); tone(262, 0.12, 0.28, 'triangle', 0.05); },
    suspend: function () { if (ac && ac.state === 'running') ac.suspend(); },
    resume: function () { if (started && ac && ac.state === 'suspended') ac.resume(); }
  };
})(window);
