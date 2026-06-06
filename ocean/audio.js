// ==================== AUDIO ENGINE ====================
const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const FADE_SEC = FADE_MS / 1000;
const PRE_FADE_DELAY_MS = 500;

// Time constants for setTargetAtTime (seconds). One time constant reaches
// ~63% of the way to target; the param is effectively settled after ~4 of
// them. DRAG is short so the filter tracks the finger; RELEASE is the
// damped settle used on tap-jump and on release.
const TONE_TC_DRAG = 0.02;
const TONE_TC_RELEASE = 0.25;

let audioCtx = null;
let filterNode = null;
let gainNode = null;
let isPlaying = false;
let isInitialized = false;

let audioEl = null;
let playBtn = null;

function freqFromVal(val) {
  const curved = Math.pow(val, 1 / EXPO);
  return MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
}

// Single entry point for tone changes. immediate=true tracks the slider
// during an active drag (short time constant); immediate=false applies the
// damped settle on tap-jump and on release.
window.setTone = function (val, immediate) {
  if (!filterNode || !audioCtx) return;
  const freq = freqFromVal(val);
  const now = audioCtx.currentTime;
  const tc = immediate ? TONE_TC_DRAG : TONE_TC_RELEASE;
  filterNode.frequency.cancelScheduledValues(now);
  filterNode.frequency.setTargetAtTime(freq, now, tc);
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
