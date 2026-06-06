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
const SWITCH_MS = 100;                        // fade-out/fade-in ramp when switching files

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

// Switch which file is audible. All elements stay PLAYING (muted) the whole
// time, so none ever goes cold -- switching just fades volume from the old to
// the new with no overlap (old to 0, then new up). Because every element is
// already warm, the switch has no decode/buffer delay. Only one is ever
// audible. NOTE: this keeps all N elements playing at once; if iOS refuses
// that, it will silence some and we fall back to the slower model.
let switchTimer = null;
function selectIndex(idx) {
  if (idx === activeIndex) return;
  const prevIdx = activeIndex;
  activeIndex = idx;

  if (!isPlaying) {
    applyActive();
    return;
  }

  const prev = players[prevIdx];
  const next = players[idx];

  if (switchTimer) clearInterval(switchTimer);

  // Make sure everything except the two involved is silent (but still
  // playing, so it stays warm).
  for (let i = 0; i < players.length; i++) {
    if (i !== prevIdx && i !== idx) players[i].volume = 0;
  }

  const steps = Math.max(1, Math.round(SWITCH_MS / FADE_STEP_MS));
  const startGain = prev.volume;
  let phase = "out";
  let k = 0;

  switchTimer = setInterval(() => {
    k++;
    const t = k / steps;
    if (phase === "out") {
      prev.volume = startGain * (1 - t);
      if (k >= steps) {
        prev.volume = 0;            // muted but STILL PLAYING (stays warm)
        next.volume = 0;
        phase = "in";
        k = 0;
      }
    } else {
      next.volume = masterGain * t;
      if (k >= steps) {
        next.volume = masterGain;
        clearInterval(switchTimer);
        switchTimer = null;
        applyActive();
      }
    }
  }, FADE_STEP_MS);
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
// of them on the first tap by briefly playing each one, but MUTED, so the
// unlock is silent (otherwise iOS plays an audible cascade of all six).
// Sequential rather than parallel so they don't pile up audibly.
async function unlockAll() {
  if (isUnlocked) return;
  for (const a of players) {
    try {
      a.muted = true;
      await a.play();
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    } catch (e) {
      a.muted = false;
    }
  }
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
      // Start ALL elements playing at volume 0 so every file stays warm and
      // switching has no cold-start delay. Only the active one will be faded
      // up. (If iOS refuses simultaneous playback, the inactive ones simply
      // won't sound -- but the active one still plays.)
      players.forEach((a) => { a.volume = 0; });
      await Promise.all(players.map((a) => a.play().catch(() => {})));
      applyActive();

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
