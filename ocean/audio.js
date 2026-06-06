const MIN_CUTOFF = 200;
const MAX_CUTOFF = 20000;
const EXPO = 2;
const FILTER_Q = 0.1;
const FADE_MS = 200;
const FADE_SEC = FADE_MS / 1000;
const PRE_FADE_DELAY_MS = 500;

// === Very strong inertia settings ===
const MAX_SPEED = 1.0; // Max 1.0 = full range (0→1) takes 1 second
const TONE_UPDATE_INTERVAL = 120; // Update filter ~8 times per second max
const TONE_RAMP_MS = 280; // Long smooth ramps

let audioCtx, filterNode, gainNode;
let isPlaying = false;
let isInitialized = false;

let sliderVal = 0; // visual position
let targetVal = 0; // where slider currently is
let currentVal = 0; // rate-limited value (this is what the filter follows)
let lastAppliedVal = -1;
let lastUpdateTime = 0;

let toneLoop = null;
let isDragging = false;

const audioEl = document.getElementById("audioEl");
const playBtn = document.getElementById("playBtn");
const btnIcon = document.getElementById("btnIcon");
const pillTrack = document.getElementById("pillTrack");
const pillFill = document.getElementById("pillFill");
const pillThumb = document.getElementById("pillThumb");
const sliderValue = document.getElementById("sliderValue");

function initAudio() {
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
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Ocean Waves"
    });
  }
  isInitialized = true;
}

function toneSlewLoop() {
  if (!filterNode || !audioCtx) return;

  const now = performance.now();
  const dt = (now - lastUpdateTime) / 1000;

  // === Strict rate limiting (max speed) ===
  const diff = targetVal - currentVal;
  if (Math.abs(diff) > 0.0005) {
    const maxMoveThisFrame = MAX_SPEED * dt;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), maxMoveThisFrame);
    currentVal += move;
  } else {
    currentVal = targetVal;
  }

  // Only touch the AudioParam at a safe low rate with long ramps
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

  toneLoop = requestAnimationFrame(toneSlewLoop);
}

function startToneSlew() {
  if (toneLoop) cancelAnimationFrame(toneLoop);
  lastUpdateTime = performance.now();
  toneLoop = requestAnimationFrame(toneSlewLoop);
}

function setIcon(playing) {
  btnIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="15"/><rect x="14" y="4" width="4" height="15"/>'
    : '<polygon points="5,3 19,12 5,21" transform="translate(1,0)"/>';
}

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
    setIcon(false);
  } else {
    targetVal = sliderVal;
    currentVal = sliderVal;
    lastAppliedVal = sliderVal;

    const curved = Math.pow(sliderVal, 1 / EXPO);
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

// Enable button
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

// === Slider ===
function getTrackMetrics() {
  const td = pillThumb.offsetWidth;
  const inset = (pillTrack.clientWidth - td) / 2;
  const travel = pillTrack.clientHeight - inset * 2 - td;
  return { td, inset, travel };
}

function updateSliderUI(val) {
  const { td, inset, travel } = getTrackMetrics();
  const thumbTop = inset + val * travel;
  pillThumb.style.top = thumbTop + "px";
  pillFill.style.height =
    Math.max(0, pillTrack.clientHeight - (thumbTop + td / 2) - inset) + "px";
  sliderValue.textContent = Math.round((1 - val) * 100);
}

function valFromY(clientY) {
  const { td, inset, travel } = getTrackMetrics();
  const y = clientY - pillTrack.getBoundingClientRect().top - inset - td / 2;
  return Math.max(0, Math.min(1, y / travel));
}

function onDragStart(e) {
  isDragging = true;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const thumbTop = parseFloat(pillThumb.style.top) || 0;
  const yInPill = clientY - pillTrack.getBoundingClientRect().top;
  dragRelative =
    yInPill >= thumbTop && yInPill <= thumbTop + pillThumb.offsetWidth;
  dragStartY = clientY;
  dragStartVal = sliderVal;

  if (!dragRelative) {
    sliderVal = valFromY(clientY);
    targetVal = sliderVal;
    updateSliderUI(sliderVal);
  }
}

function onDragMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  if (dragRelative) {
    const { travel } = getTrackMetrics();
    sliderVal = Math.max(
      0,
      Math.min(1, dragStartVal + (clientY - dragStartY) / travel)
    );
  } else {
    sliderVal = valFromY(clientY);
  }
  targetVal = sliderVal;
  updateSliderUI(sliderVal);
}

function onDragEnd() {
  isDragging = false;
}

pillTrack.addEventListener("mousedown", onDragStart);
pillTrack.addEventListener("touchstart", onDragStart, { passive: true });
window.addEventListener("mousemove", onDragMove);
window.addEventListener("touchmove", onDragMove, { passive: false });
window.addEventListener("mouseup", onDragEnd);
window.addEventListener("touchend", onDragEnd);

function setUnit() {
  const h = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  updateSliderUI(sliderVal);
}
if (window.visualViewport)
  window.visualViewport.addEventListener("resize", setUnit);
window.addEventListener("resize", setUnit);
setUnit();
updateSliderUI(0);
