// ==================== AUDIO ENGINE ====================
const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const FADE_SEC = FADE_MS / 1000;
const PRE_FADE_DELAY_MS = 500;

const MAX_SPEED = 1.0;
const TONE_UPDATE_INTERVAL = 120;
const TONE_RAMP_MS = 280;

let audioCtx = null;
let filterNode = null;
let gainNode = null;
let isPlaying = false;
let isInitialized = false;

let lastAppliedVal = -1;
let lastSlewTime = performance.now();
let lastUpdateTime = 0;
let toneLoop = null;

let audioEl = null;
let playBtn = null;

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
  let dt = (now - lastSlewTime) / 1000;

  if (dt > 0.5) dt = 0.016;

  const diff = targetVal - currentVal;

  if (Math.abs(diff) > 0.0008) {
    const maxMove = MAX_SPEED * dt;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), maxMove);
    currentVal += move;
  } else {
    currentVal = targetVal;
  }

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

window.resetToneSlewTimer = function () {
  lastSlewTime = performance.now();
};

function setupPlayButton() {
  if (!playBtn || !audioEl) return;

  playBtn.addEventListener("click", async () => {
    if (!isInitialized) {
      initAudio();
      await audioCtx.resume();
    }

    if (isPlaying) {
      const now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + FADE_SEC);

      setTimeout(() => {
        if (gainNode) gainNode.gain.value = 0;
        audioEl.pause();
      }, FADE_MS + 20);

      isPlaying = false;

      if (typeof window.updatePlayIcon === "function") {
        window.updatePlayIcon(false);
      }
    } else {
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

      if (typeof window.updatePlayIcon === "function") {
        window.updatePlayIcon(true);
      }

      startToneSlew();
    }
  });

  playBtn.disabled = true;
  playBtn.style.opacity = "0.4";

  audioEl.addEventListener("canplaythrough", () => {
    playBtn.disabled = false;
    playBtn.style.opacity = "1";
  }, { once: true });

  audioEl.load();
}

function initAudioEngine(elements) {
  audioEl = elements.audioEl;
  playBtn = elements.playBtn;

  setupPlayButton();
}
