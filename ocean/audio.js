// ==================== AUDIO ENGINE (crossfade, no AudioContext) ====================
//
// Plays N pre-filtered ocean loops as bare <audio> elements and equal-power
// crossfades between the two adjacent to the slider position. No AudioContext
// anywhere, so playback survives screen-off / backgrounding.
//
// Files are expected at FILE_PATTERN with two-digit labels, brightest first:
//   ocean_05.m4a (brightest) ... ocean_00.m4a (darkest)   when NUM_FILES = 6

const NUM_FILES = 6;                         // how many loops to blend across
const FILE_PATTERN = (label) => `ocean_${label}.m4a`;

const FADE_MS = 200;                          // play/stop master fade
const FADE_STEP_MS = 16;                      // master fade tick (~60fps)
const PRE_FADE_DELAY_MS = 500;                // delay before audible start

// Decorrelation offset: odd-labeled files (01, 03, 05 -> the odd-index
// elements here) start this many seconds into the loop, so no two
// crossfading neighbors play the same moment of the source and there's no
// comb-filtering / flange between them.
const STAGGER_SEC = 1;

let players = [];        // the N <audio> elements, index 0 = brightest
let masterGain = 0;      // 0..1 overall fade applied on top of the blend
let isPlaying = false;
let isUnlocked = false;
let playBtn = null;

// ---- file label helpers -------------------------------------------------
// Labels count down: index 0 -> highest label (brightest), last -> "00".
function labelForIndex(i) {
  const n = NUM_FILES - 1 - i;
  return String(n).padStart(2, "0");
}

// ---- equal-power blend --------------------------------------------------
// Map sliderVal (0..1) onto the active pair and per-element volumes.
// sliderVal 0 = brightest (index 0), sliderVal 1 = darkest (last index).
function applyBlend() {
  if (players.length === 0) return;

  // Position along the N-1 crossfade zones.
  const pos = sliderVal * (NUM_FILES - 1);
  const lower = Math.floor(pos);
  const upper = Math.min(lower + 1, NUM_FILES - 1);
  const t = pos - lower;                      // 0..1 within the zone

  // Equal-power crossfade gains.
  const gLower = Math.cos(t * Math.PI / 2);
  const gUpper = Math.sin(t * Math.PI / 2);

  for (let i = 0; i < players.length; i++) {
    let v = 0;
    if (i === lower) v = gLower;
    if (i === upper) v = (lower === upper) ? 1 : gUpper;
    players[i].volume = v * masterGain;
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
    applyBlend();
  }, FADE_STEP_MS);
}

// ---- the slider entry point (called by ui.js) ---------------------------
// immediate is unused here (no glide needed; volume tracks the slider
// directly), kept for signature compatibility with the UI.
window.setTone = function (val, immediate) {
  applyBlend();
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

// iOS only lets multiple media elements play after each is started by a user
// gesture. On the first tap we briefly play+pause all of them to unlock,
// then control freely afterward.
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

  // Enable the button as soon as we can plausibly start. We only need one
  // element ready to begin (the rest keep buffering), and some browsers
  // don't fire canplaythrough reliably for every element, so we also listen
  // for canplay and add a timeout safety net so the button is never stuck.
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

  // Safety net: enable after a short wait regardless, so a slow or missing
  // event can't leave the button permanently disabled.
  setTimeout(enable, 3000);

  playBtn.addEventListener("click", async () => {
    if (!isPlaying) {
      await unlockAll();

      // Start all elements playing (volumes still 0 / set by blend).
      masterGain = 0;
      applyBlend();

      // Decorrelate: offset odd-labeled files (01, 03, 05) into the loop so
      // crossfading neighbors never play the same moment -> no flange.
      players.forEach((a, i) => {
        const label = parseInt(labelForIndex(i), 10);
        if (label % 2 === 1) {
          try { a.currentTime = STAGGER_SEC; } catch (e) { /* ignore */ }
        }
      });

      await Promise.all(players.map((a) => a.play().catch(() => {})));

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
