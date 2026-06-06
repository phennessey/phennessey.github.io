const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const FADE_SEC = FADE_MS / 1000;
const PRE_FADE_DELAY_MS = 500;

// === Inertia settings ===
const MAX_SPEED = 1.0;
const TONE_UPDATE_INTERVAL = 120;
const TONE_RAMP_MS = 280;

// Audio state
let audioCtx = null;
let filterNode = null;
let gainNode = null;
let isPlaying = false;
let isInitialized = false;

// Tone following state
let targetVal = 0;
let currentVal = 0;
let lastAppliedVal = -1;
let lastSlewTime = 0;
let lastUpdateTime = 0;
let toneLoop = null;

// DOM references (populated from main file if needed)
let audioEl = null;
let playBtn = null;
let btnIcon = null;

function initAudio() {
  if (isInitialized) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.Q.value = FILTER_Q;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = 0;

  audioCtx
    .createMediaElementSource(audioEl)
    .connect(filterNode)
    .connect(gainNode)
    .connect(audioCtx.destination);

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ocean Waves" });
  }

  isInitialized = true;
}

function toneSlewLoop() {
  if (!filterNode || !audioCtx) return;

  const now = performance.now();
  const dt = (now - lastSlewTime) / 1000;

  // Rate-limited movement
  const diff = targetVal - currentVal;
  if (Math.abs(diff) > 0.0005) {
    const maxMove = MAX_SPEED * dt;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), maxMove);
    currentVal += move;
  } else {
    currentVal = targetVal;
  }

  // Throttled AudioParam update
  if (
    now - lastUpdateTime > TONE_UPDATE_INTERVAL &&
    Math.abs(currentVal - lastAppliedVal) > 0.003
  ) {
    const curved = Math.pow(currentVal, 1 / EXPO);
    const targetFreq = MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);

    const audioNow = audioCtx.currentTime;
    filterNode.frequency.cancelScheduledValues(audioNow);
    filterNode.frequency.linearRampToValueAtTime(
      targetFreq,
      audioNow + TONE_RAMP_MS / 1000
    );

    lastAppliedVal = currentVal;
    lastUpdateTime = now;
  }

  lastSlewTime = now;
  toneLoop = requestAnimationFrame(toneSlewLoop);
}

function startToneSlew() {
  if (toneLoop) cancelAnimationFrame(toneLoop);
  lastSlewTime = performance.now();
  lastUpdateTime = performance.now();
  toneLoop = requestAnimationFrame(toneSlewLoop);
}

function setIcon(playing) {
  if (!btnIcon) return;
  btnIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="15"/><rect x="14" y="4" width="4" height="15"/>'
    : '<polygon points="5,3 19,12 5,21" transform="translate(1,0)"/>';
}

// Play / Pause handler
function setupPlayButton() {
  if (!playBtn || !audioEl) return;

  playBtn.addEventListener("click", async () => {
    if (!isInitialized) {
      initAudio();
      await audioCtx.resume();
    }

    if (isPlaying) {
      // Fade out
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + FADE_SEC);

      setTimeout(() => {
        if (gainNode) gainNode.gain.value = 0;
        audioEl.pause();
      }, FADE_MS + 20);

      isPlaying = false;
      setIcon(false);
    } else {
      // Start playback with inertia
      targetVal = currentVal;
      currentVal = currentVal;
      lastAppliedVal = currentVal;

      const curved = Math.pow(currentVal, 1 / EXPO);
      const freq = MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
      filterNode.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gainNode.gain.value = 0;
      await audioCtx.resume();
      audioEl.play().catch(() => {});

      setTimeout(() => {
        if (!gainNode || !audioCtx || !isPlaying) return;
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(1, now + FADE_SEC);
      }, PRE_FADE_DELAY_MS);

      isPlaying = true;
      setIcon(true);
      startToneSlew();
    }
  });

  // Enable button when ready
  playBtn.disabled = true;
  playBtn.style.opacity = "0.4";

  audioEl.addEventListener(
    "canplaythrough",
    () => {
      playBtn.disabled = false;
      playBtn.style.opacity = "1";
    },
    { once: true }
  );

  audioEl.load();
}

// Initialize audio engine (call this from main file)
function initAudioEngine(elements) {
  audioEl = elements.audioEl;
  playBtn = elements.playBtn;
  btnIcon = elements.btnIcon;

  setupPlayButton();
}
