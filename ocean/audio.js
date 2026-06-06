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

// Samples per second used to build the slider-space value curve. The curve
// is linear in slider-space so even a coarse rate is smooth; 256/s keeps
// arrays small while sounding continuous.
const CURVE_SAMPLE_RATE = 256;

let audioCtx = null;
let filterNode = null;
let gainNode = null;
let isPlaying = false;
let isInitialized = false;

let audioEl = null;
let playBtn = null;

// Analytic model of the tone ramp currently in flight, so we never have to
// read filterNode.frequency.value mid-ramp (that read can lag the audio
// thread or report a stale value right after cancelScheduledValues, which is
// what caused the sudden jumps). We track the ramp in slider-space (linear),
// which is EXACT: the scheduled ramp is exponential in frequency, and
// freqFromVal maps slider-space exponentially, so motion is linear in
// slider-space. Equal time = equal perceived pitch change.
// startVal -> endVal over [startTime, startTime + dur].
let rampStartVal = 0;
let rampEndVal = 0;
let rampStartTime = 0;
let rampDur = 0;

// Where the in-flight ramp is right now, in slider-space (0..1).
function currentRampVal(now) {
  if (rampDur <= 0) return rampEndVal;
  const t = (now - rampStartTime) / rampDur;
  if (t <= 0) return rampStartVal;
  if (t >= 1) return rampEndVal;
  return rampStartVal + (rampEndVal - rampStartVal) * t;
}

// Mark the tone as settled (no ramp in flight) at a given slider value.
function settleRampAt(val) {
  rampStartVal = val;
  rampEndVal = val;
  rampDur = 0;
}

function freqFromVal(val) {
  const curved = Math.pow(val, 1 / EXPO);
  return MAX_CUTOFF * Math.pow(MIN_CUTOFF / MAX_CUTOFF, curved);
}

// Single entry point for tone changes. immediate=true tracks the slider
// during an active drag with a short fixed ramp (responsive finger-follow).
// immediate=false (tap-jump and release) uses a ramp whose duration scales
// with distance, so a full 0<->1 sweep always takes SWEEP_SECONDS and can
// never glide instantly. Both redirect cleanly mid-slew with no step,
// because the new ramp is anchored at the in-flight ramp's exact current
// position computed analytically (not read from the AudioParam).
window.setTone = function (val, immediate) {
  if (!filterNode || !audioCtx) return;
  const now = audioCtx.currentTime;

  // Where the tone actually is this instant, in slider-space.
  const fromVal = currentRampVal(now);

  let dur;
  if (immediate) {
    dur = DRAG_SEC;
  } else {
    const dist = Math.abs(val - fromVal);
    dur = Math.max(dist * SWEEP_SECONDS, 0.001);
  }

  // Build the ramp in SLIDER-SPACE: glide the slider value linearly from
  // fromVal to val over dur, then map each sampled point through freqFromVal.
  // setValueCurveAtTime plays the resulting frequency samples. This makes the
  // SLIDER VALUE glide uniformly (the control variable we actually care
  // about), with frequency derived from it -- so up and down are symmetric
  // and the rate is consistent. The AudioParam ramp primitives can't do this
  // because they interpolate frequency, not the slider value.
  const steps = Math.max(2, Math.ceil(dur * CURVE_SAMPLE_RATE));
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);              // 0..1 along the ramp
    const v = fromVal + (val - fromVal) * t; // linear in slider-space
    curve[i] = freqFromVal(v);
  }

  filterNode.frequency.cancelScheduledValues(now);
  // setValueCurveAtTime can throw if a prior curve is still running and
  // overlaps. Cancelling then anchoring at the current value clears the
  // schedule so the new curve starts clean on rapid interruption.
  try {
    filterNode.frequency.setValueCurveAtTime(curve, now, dur);
  } catch (e) {
    filterNode.frequency.cancelScheduledValues(now);
    filterNode.frequency.setValueAtTime(curve[0], now);
    filterNode.frequency.setValueCurveAtTime(curve, now, dur);
  }

  rampStartVal = fromVal;
  rampEndVal = val;
  rampStartTime = now;
  rampDur = dur;
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
  settleRampAt(sliderVal);

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
      settleRampAt(sliderVal);

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
