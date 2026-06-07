// ==================== AUDIO ENGINE ====================
const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 50;

let ctx, buffer, source, filter, gain, dest, keepAlive, hiddenAudio, playBtn, isPlaying, isInitialized, isUnlocked;

async function ensureGraph() {
  if (isInitialized) return;

  ctx = new (window.AudioContext || window.webkitAudioContext)();

  const response = await fetch("ocean.mp3");
  buffer = await ctx.decodeAudioData(await response.arrayBuffer());

  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = FILTER_Q;
  filter.frequency.value = freqFromVal(0);

  gain = ctx.createGain();
  gain.gain.value = 0;

  dest = ctx.createMediaStreamDestination();

  filter.connect(gain).connect(dest);

  keepAlive = ctx.createOscillator();
  const kaGain = ctx.createGain();
  kaGain.gain.value = 0.0001;
  keepAlive.connect(kaGain).connect(dest);
  keepAlive.start();

  if (!hiddenAudio) {
    hiddenAudio = new Audio();
    hiddenAudio.style.display = "none";
    document.body.appendChild(hiddenAudio);
  }
  hiddenAudio.srcObject = dest.stream;
  hiddenAudio.loop = true;

  isInitialized = true;
}

function freqFromVal(val) {
  const curved = Math.pow(val, 1 / EXPO);
  return MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
}

window.setTone = function (val) {
  if (!filter || !ctx) return;
  filter.frequency.setValueAtTime(freqFromVal(val), ctx.currentTime);
};

function startSource() {
  if (source) {
    try { source.stop(); } catch (e) {}
  }
  source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(filter);
  source.start();
}

async function unlockAudio() {
  if (isUnlocked) return;
  await ensureGraph();
  await ctx.resume();

  try {
    hiddenAudio.muted = true;
    await hiddenAudio.play().catch(() => {});
    hiddenAudio.pause();
    hiddenAudio.currentTime = 0;
    hiddenAudio.muted = false;
  } catch (e) {
    // Still mark as unlocked so we don't keep retrying
  }
  isUnlocked = true;
}

async function play() {
  await unlockAudio();

  startSource();
  await hiddenAudio.play().catch(() => {});

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

  const stoppingSource = source;

  setTimeout(() => {
    if (stoppingSource) {
      try { stoppingSource.stop(); } catch (e) {}
    }
    if (source === stoppingSource) source = null;

    if (!isPlaying && hiddenAudio) hiddenAudio.pause();
  }, FADE_MS + 50);

  isPlaying = false;
  if (window.updatePlayIcon) window.updatePlayIcon(false);
}

function initAudioEngine(elements) {
  playBtn = elements.playBtn;
  hiddenAudio = elements.hiddenAudio || null;

  playBtn?.addEventListener("click", () => {
    isPlaying ? stop() : play().catch(console.error);
  });

  document.addEventListener("visibilitychange", () => {
    if (ctx?.state === "suspended") ctx.resume();
  });
  window.addEventListener("focus", () => {
    if (ctx?.state === "suspended") ctx.resume();
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ocean Waves" });
  }
}
