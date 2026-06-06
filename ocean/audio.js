// ==================== AUDIO ENGINE ====================
const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const FADE_SEC = FADE_MS / 1000;
const PRE_FADE_DELAY_MS = 500;

// Seconds for a FULL 0->1 (or 1->0) tone sweep on a tap-jump or release.
// The ramp duration scales with the slider distance moved, so a half sweep
// takes half this, and a full sweep is guaranteed to take this long (never
// instant). DRAG_SEC is a short ramp used while the finger is moving so the
// filter tracks responsively rather than gliding.
const SWEEP_SECONDS = 1.0;
const DRAG_SEC = 0.03;

let audioCtx = null;
let filterNode = null;
let gainNode = null;
let isPlaying = false;
let isInitialized = false;

let audioEl = null;
let playBtn = null;

// The slider value the tone was last aimed at, used to measure how far a
// new move travels so the ramp duration can scale with distance.
let lastToneVal = 0;

function freqFromVal(val) {
  const curved = Math.pow(val, 1 / EXPO);
  return MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
}

// Single entry point for tone changes. immediate=true tracks the slider
// during an active drag with a short fixed ramp (responsive finger-follow).
// immediate=false (tap-jump and release) uses a linear ramp whose duration
// scales with the distance moved, so a full 0<->1 sweep always takes
// SWEEP_SECONDS and can never glide instantly.
window.setTone = function (val, immediate) {
  if (!filterNode || !audioCtx) return;
  const freq = freqFromVal(val);
  const now = audioCtx.currentTime;
  const cur = filterNode.frequency.value;

  let dur;
  if (immediate) {
    dur = DRAG_SEC;
  } else {
    const dist = Math.abs(val - lastToneVal);
    dur = Math.max(dist * SWEEP_SECONDS, 0.001);
  }

  filterNode.frequency.cancelScheduledValues(now);
  filterNode.frequency.setValueAtTime(cur, now); // anchor the ramp start
  filterNode.frequency.linearRampToValueAtTime(freq, now + dur);
  lastToneVal = val;
};

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

  // Initialize the filter to the slider's current position with no glide.
  filterNode.frequency.setValueAtTime(freqFromVal(sliderVal), audioCtx.currentTime);
  lastToneVal = sliderVal;

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Ocean Waves" });
  }

  isInitialized = true;
}

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
      // Snap filter to the current slider position with no glide.
      filterNode.frequency.cancelScheduledValues(audioCtx.currentTime);
      filterNode.frequency.setValueAtTime(freqFromVal(sliderVal), audioCtx.currentTime);
      lastToneVal = sliderVal;

      gainNode.gain.value = 0;
      await audioCtx.resume();
      audioEl.play().catch(() => {});

      isPlaying = true;

      if (typeof window.updatePlayIcon === "function") {
        window.updatePlayIcon(true);
      }

      // Fade gain in after the pre-fade delay.
      setTimeout(() => {
        if (!gainNode || !audioCtx || !isPlaying) return;
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(1, now + FADE_SEC);
      }, PRE_FADE_DELAY_MS);
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
