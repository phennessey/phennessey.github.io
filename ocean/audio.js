// ==================== AUDIO ENGINE (single-file, no AudioContext) ====================
//
// Plays N pre-filtered ocean loops as bare <audio> elements. Only ONE element
// plays at a time (iOS allows only one simultaneous media element), so the
// slider snaps to N discrete positions and switching position swaps which
// single file is playing. No AudioContext anywhere, so playback survives
// screen-off / backgrounding.
//
// Files are expected at FILE_PATTERN with two-digit labels, brightest first:
//   ocean_05.m4a (brightest) ... ocean_00.m4a (darkest)   when NUM_FILES = 6

const NUM_FILES = 6;                         // how many loops / slider stops
window.NUM_FILES = NUM_FILES;
const FILE_PATTERN = (label) => `ocean_${label}.m4a`;

const FADE_MS = 200;                          // play/stop master fade
const FADE_STEP_MS = 16;                      // master fade tick (~60fps)
const PRE_FADE_DELAY_MS = 500;                // delay before audible start

let players = [];        // the N <audio> elements, index 0 = brightest
let activeIndex = 0;     // which file is currently selected
let masterGain = 0;      // 0..1 fade applied to the active element
let isPlaying = false;
let isUnlocked = false;
let playBtn = null;

// ---- file label helpers -------------------------------------------------
// Labels count down: index 0 -> highest label (brightest), last -> "00".
function labelForIndex(i) {
  const n = NUM_FILES - 1 - i;
  return String(n).padStart(2, "0");
}

// ---- slider -> discrete file index --------------------------------------
// sliderVal 0 = brightest (index 0), sliderVal 1 = darkest (last index).
function indexFromVal(val) {
  const idx = Math.round(val * (NUM_FILES - 1));
  return Math.max(0, Math.min(NUM_FILES - 1, idx));
}

// Set volumes so only the active element is audible (at masterGain).
function applyActive() {
  for (let i = 0; i < players.length; i++) {
    players[i].volume = (i === activeIndex) ? masterGain : 0;
  }
}

// Switch which single file is playing. The new one is started at the old
// one's loop position so the ambient texture doesn't jump, the old one is
// paused. Only relevant while playing.
function selectIndex(idx) {
  if (idx === activeIndex) return;
  const prev = players[activeIndex];
  const next = players[idx];
  activeIndex = idx;

  if (isPlaying) {
    try { next.currentTime = prev.currentTime % (next.duration || 1e9); } catch (e) {}
    next.play().catch(() => {});
    applyActive();
    prev.pause();
  } else {
    applyActive();
  }
}

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
    if (k >= steps) {
      masterGain = to;
      clearInterval(fadeTimer);
      fadeTimer = null;
      if (done) done();
    }
    applyActive();
  }, FADE_STEP_MS);
}

// ---- the slider entry point (called by ui.js) ---------------------------
// immediate is unused (snapping is instant); kept for signature compatibility.
window.setTone = function (val, immediate) {
  selectIndex(indexFromVal(val));
};

// ---- build + preload ----------------------------------------------------
function buildPlayers() {
  for (let i = 0; i < NUM_FILES; i++) {
    const a = new Audio();
    a.src = FILE_PATTERN(labelForIndex(i));
    a.loop = true;
    a.preload = "auto";
    a.playsInline = true;
    a.volume = 0;
    players.push(a);
  }
}

// iOS requires a user gesture to allow a media element to play. We unlock all
// of them on the first tap (play+pause), then only one plays at a time after.
async function unlockAll() {
  if (isUnlocked) return;
  await Promise.all(players.map(async (a) => {
    try {
      await a.play();
      a.pause();
      a.currentTime = 0;
    } catch (e) { /* ignore */ }
  }));
  isUnlocked = true;
}

function setupPlayButton() {
  if (!playBtn) return;

  playBtn.disabled = true;
  playBtn.style.opacity = "0.4";

  buildPlayers();

  // Enable as soon as one element is ready; timeout safety net so the button
  // is never stuck if an event doesn't fire.
  let enabled = false;
  function enable() {
    if (enabled) return;
    enabled = true;
    playBtn.disabled = false;
    playBtn.style.opacity = "1";
  }
  players.forEach((a) => {
    a.addEventListener("canplaythrough", enable, { once: true });
    a.addEventListener("canplay", enable, { once: true });
    a.addEventListener("loadeddata", enable, { once: true });
    a.load();
  });
  setTimeout(enable, 3000);

  playBtn.addEventListener("click", async () => {
    if (!isPlaying) {
      await unlockAll();

      masterGain = 0;
      applyActive();
      players[activeIndex].play().catch(() => {});

      isPlaying = true;
      if (typeof window.updatePlayIcon === "function") window.updatePlayIcon(true);

      setTimeout(() => {
        if (!isPlaying) return;
        fadeMaster(1, FADE_MS);
      }, PRE_FADE_DELAY_MS);
    } else {
      fadeMaster(0, FADE_MS, () => {
        players.forEach((a) => a.pause());
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
