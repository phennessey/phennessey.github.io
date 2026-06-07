// ===== AUDIO ENGINE: AudioBuffer + live lowpass + MediaStream bridge =====
// Decodes one file into an AudioBuffer, loops it gaplessly with an
// AudioBufferSourceNode, runs it through a live BiquadFilter (the slider),
// then routes the output to a MediaStreamDestination -> hidden <audio>.
// The hidden media element is what iOS treats as backgroundable media, so
// the live-filtered audio has a chance of surviving screen-off. A silent
// keep-alive and resume-on-visibility help keep the context running.

const SRC_URL = "ocean.mp3";
const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const TONE_RAMP_MS = 120;

let ctx, buffer, source, filter, gain, dest, keepAlive;
let hiddenAudio = null, playBtn = null;
let isPlaying = false, isReady = false, unlocked = false;

function freqFromVal(val) {
  const curved = Math.pow(val, 1 / EXPO);
  return MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
}

// Slider entry point — live filter sweep.
window.setTone = function (val) {
  if (!filter || !ctx) return;
  const now = ctx.currentTime;
  filter.frequency.cancelScheduledValues(now);
  filter.frequency.setValueAtTime(filter.frequency.value, now);
  filter.frequency.linearRampToValueAtTime(freqFromVal(val), now + TONE_RAMP_MS / 1000);
};

async function ensureGraph() {
  if (isReady) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const resp = await fetch(SRC_URL);
  buffer = await ctx.decodeAudioData(await resp.arrayBuffer());

  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = FILTER_Q;
  filter.frequency.value = freqFromVal(typeof sliderVal === "number" ? sliderVal : 0);

  gain = ctx.createGain();
  gain.gain.value = 0;

  dest = ctx.createMediaStreamDestination();

  // Silent keep-alive into the destination so output is constant.
  keepAlive = ctx.createOscillator();
  const kaGain = ctx.createGain();
  kaGain.gain.value = 0.0001;
  keepAlive.connect(kaGain).connect(dest);
  keepAlive.start(0);

  hiddenAudio.srcObject = dest.stream;
  hiddenAudio.loop = true;

  isReady = true;
}

function startSource() {
  source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;                 // gapless
  source.connect(filter).connect(gain).connect(dest);
  source.start(0);
}

async function play() {
  await ensureGraph();
  await ctx.resume();
  startSource();
  await hiddenAudio.play();
  isPlaying = true;
  if (window.updatePlayIcon) window.updatePlayIcon(true);
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_MS / 1000);
}

function stop() {
  if (!ctx) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);
  setTimeout(() => { try { source.stop(); } catch (e) {} }, FADE_MS + 30);
  isPlaying = false;
  if (window.updatePlayIcon) window.updatePlayIcon(false);
}

function initAudioEngine(elements) {
  playBtn = elements.playBtn;
  hiddenAudio = elements.hiddenAudio;
  playBtn.addEventListener("click", async () => {
    if (!isPlaying) { try { await play(); } catch (e) {} }
    else { stop(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (ctx && ctx.state === "suspended") ctx.resume();
  });
  window.addEventListener("focus", () => {
    if (ctx && ctx.state === "suspended") ctx.resume();
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ocean Waves" });
  }
}
