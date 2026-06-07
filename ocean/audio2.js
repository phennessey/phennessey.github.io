// ==================== AUDIO ENGINE (single combined file, seek-based) ====================
//
// Plays ONE concatenated file (all N tones end to end) through a single bare
// <audio> element. Switching tone = seeking currentTime to that tone's region.
// Because the element never stops or reloads, the switch is a fast seek (no
// cold-start decode), which is the fastest method available on iOS. A light
// timeupdate wrap loops playback within the current region. No AudioContext,
// so playback survives screen-off.
//
// Build the combined file with bake_loops.sh (MAKE_COMBINED=1); it prints the
// exact SEGMENT_SEC and NUM_FILES to use here.

const NUM_FILES = 6;                          // number of tone regions
const SEGMENT_SEC = 34.3803;                  // exact per-segment duration (from bake output)
const COMBINED_SRC = "ocean_all.m4a";

window.NUM_FILES = NUM_FILES;

const FADE_MS = 200;                          // play/stop master fade
const FADE_STEP_MS = 16;
const PRE_FADE_DELAY_MS = 500;

// Small guard so the wrap re-seeks slightly before the hard region edge,
// avoiding bleeding one frame into the next region.
const WRAP_GUARD_SEC = 0.05;

let audioEl = null;
let activeIndex = 0;
let masterGain = 0;
let isPlaying = false;
let isUnlocked = false;
let playBtn = null;

// ---- region helpers -----------------------------------------------------
function regionStart(idx) { return idx * SEGMENT_SEC; }
function regionEnd(idx)   { return (idx + 1) * SEGMENT_SEC; }

function indexFromVal(val) {
  const idx = Math.round(val * (NUM_FILES - 1));
  return Math.max(0, Math.min(NUM_FILES - 1, idx));
}

// Keep playback inside the active region: when currentTime passes the region
// end, seek back to its start. Fires often via timeupdate.
function onTimeUpdate() {
  if (!isPlaying) return;
  const end = regionEnd(activeIndex) - WRAP_GUARD_SEC;
  const start = regionStart(activeIndex);
  if (audioEl.currentTime >= end || audioEl.currentTime < start) {
    try { audioEl.currentTime = start; } catch (e) {}
  }
}

// Switch tone = seek to the SAME offset within the new region, so playback
// keeps moving forward continuously and only jumps ahead/behind by whole
// region-widths (N seconds) rather than restarting the tone at 0.
function selectIndex(idx) {
  if (idx === activeIndex) return;
  const prevIdx = activeIndex;
  activeIndex = idx;
  if (!isPlaying) return;
  // Offset within the old region, carried into the new one.
  let offset = audioEl.currentTime - regionStart(prevIdx);
  if (offset < 0) offset = 0;
  if (offset > SEGMENT_SEC) offset = offset % SEGMENT_SEC;
  try { audioEl.currentTime = regionStart(idx) + offset; } catch (e) {}
}

window.setTone = function (val, immediate) {
  selectIndex(indexFromVal(val));
};

// ---- master fade (play/stop) -------------------------------------------
let fadeTimer = null;
function fadeMaster(to, ms, done) {
  if (fadeTimer) clearInterval(fadeTimer);
  const from = masterGain;
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  let k = 0;
  fadeTimer = setInterval(() => {
    k++;
    masterGain = from + (to - from) * (k / steps);
    if (audioEl) audioEl.volume = masterGain;
    if (k >= steps) {
      masterGain = to;
      if (audioEl) audioEl.volume = masterGain;
      clearInterval(fadeTimer);
      fadeTimer = null;
      if (done) done();
    }
  }, FADE_STEP_MS);
}

// ---- build + preload ----------------------------------------------------
function buildPlayer() {
  audioEl = new Audio();
  audioEl.src = COMBINED_SRC;
  audioEl.loop = true;             // whole-file loop as a backstop; region wrap handles the rest
  audioEl.preload = "auto";
  audioEl.playsInline = true;
  audioEl.volume = 0;
  audioEl.addEventListener("timeupdate", onTimeUpdate);
}

async function unlockPlayer() {
  if (isUnlocked) return;
  try {
    audioEl.muted = true;
    await audioEl.play();
    audioEl.pause();
    audioEl.muted = false;
  } catch (e) {
    audioEl.muted = false;
  }
  isUnlocked = true;
}

function setupPlayButton() {
  if (!playBtn) return;

  playBtn.disabled = true;
  playBtn.style.opacity = "0.4";

  buildPlayer();

  let enabled = false;
  function enable() {
    if (enabled) return;
    enabled = true;
    playBtn.disabled = false;
    playBtn.style.opacity = "1";
  }
  audioEl.addEventListener("canplaythrough", enable, { once: true });
  audioEl.addEventListener("canplay", enable, { once: true });
  audioEl.addEventListener("loadeddata", enable, { once: true });
  audioEl.load();
  setTimeout(enable, 3000);

  playBtn.addEventListener("click", async () => {
    if (!isPlaying) {
      await unlockPlayer();

      masterGain = 0;
      audioEl.volume = 0;
      try { audioEl.currentTime = regionStart(activeIndex); } catch (e) {}
      audioEl.play().catch(() => {});

      isPlaying = true;
      if (typeof window.updatePlayIcon === "function") window.updatePlayIcon(true);

      setTimeout(() => {
        if (!isPlaying) return;
        fadeMaster(1, FADE_MS);
      }, PRE_FADE_DELAY_MS);
    } else {
      fadeMaster(0, FADE_MS, () => {
        if (audioEl) audioEl.pause();
      });
      isPlaying = false;
      if (typeof window.updatePlayIcon === "function") window.updatePlayIcon(false);
    }
  });
}

function initAudioEngine(elements) {
  playBtn = elements.playBtn;
  setupPlayButton();
}
