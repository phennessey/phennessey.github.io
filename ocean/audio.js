// ==================== AUDIO ENGINE (one WAV per tone, native loop) ====================
//
// Plays N pre-filtered ocean loops as bare <audio> elements, one per tone.
// WAV (PCM) has no encoder padding, so the native `loop` attribute loops each
// file gaplessly -- no seeking, no manual wrap, no click. Only ONE element
// plays at a time (iOS allows one simultaneous media element); switching tone
// pauses the old and plays the new. No AudioContext, so playback survives
// screen-off / backgrounding.
//
// Files: ocean_05.wav (brightest) ... ocean_00.wav (darkest) when NUM_FILES = 6

const NUM_FILES = 6;                          // how many loops / slider stops
const FILE_PATTERN = (label) => `ocean_${label}.wav`;
window.NUM_FILES = NUM_FILES;

const FADE_MS = 200;                          // play/stop master fade
const FADE_STEP_MS = 16;                      // fade tick (~60fps)
const PRE_FADE_DELAY_MS = 500;                // delay before audible start
const SWITCH_MS = 0;                          // 0 = instant file swap (no fade)

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

// ---- switch which single file is playing -------------------------------
// Pause the current element, start the next. With SWITCH_MS = 0 the swap is
// instant; with SWITCH_MS > 0 the old fades out, pauses, then the new starts
// and fades in (no overlap, so within iOS's single-element limit).
let switchTimer = null;
function selectIndex(idx) {
  if (idx === activeIndex) return;
  const prev = players[activeIndex];
  const next = players[idx];
  activeIndex = idx;

  if (!isPlaying) {
    applyActive();
    return;
  }

  if (switchTimer) clearInterval(switchTimer);

  // Pause everything that isn't the incoming element.
  for (let i = 0; i < players.length; i++) {
    if (players[i] !== next) {
      players[i].pause();
      players[i].volume = 0;
    }
  }

  if (SWITCH_MS <= 0) {
    next.volume = masterGain;
    next.play().catch(() => {});
    applyActive();
    return;
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
        prev.volume = 0;
        prev.pause();
        next.volume = 0;
        next.play().catch(() => {});
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
    if (k >= steps) {
      masterGain = to;
      clearInterval(fadeTimer);
      fadeTimer = null;
      if (done) done();
    }
    applyActive();
  }, FADE_STEP_MS);
}

// ---- build + preload ----------------------------------------------------
function buildPlayers() {
  for (let i = 0; i < NUM_FILES; i++) {
    const a = new Audio();
    a.src = FILE_PATTERN(labelForIndex(i));
    a.loop = true;            // native gapless loop (WAV has no padding)
    a.preload = "auto";
    a.playsInline = true;
    a.volume = 0;
    players.push(a);
  }
}

// iOS requires a user gesture to allow a media element to play. Unlock all on
// the first tap (muted play+pause), then only one plays at a time after.
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
