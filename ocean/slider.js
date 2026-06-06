let sliderVal = 0;
let targetVal = 0; // shared with audio engine
let currentVal = 0; // shared with audio engine

const pillTrack = document.getElementById("pillTrack");
const pillFill = document.getElementById("pillFill");
const pillThumb = document.getElementById("pillThumb");
const sliderValue = document.getElementById("sliderValue");

let isDragging = false;
let dragRelative = false;
let dragStartY = 0;
let dragStartVal = 0;

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

  dragRelative = yInPill >= thumbTop && yInPill <= thumbTop + pillThumb.offsetWidth;
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
    sliderVal = Math.max(0, Math.min(1, dragStartVal + (clientY - dragStartY) / travel));
  } else {
    sliderVal = valFromY(clientY);
  }

  targetVal = sliderVal;
  updateSliderUI(sliderVal);
}

function onDragEnd() {
  isDragging = false;
}

function setUnit() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  updateSliderUI(sliderVal);
}

// Initialize slider
function initSlider() {
  pillTrack.addEventListener("mousedown", onDragStart);
  pillTrack.addEventListener("touchstart", onDragStart, { passive: true });

  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("touchmove", onDragMove, { passive: false });

  window.addEventListener("mouseup", onDragEnd);
  window.addEventListener("touchend", onDragEnd);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setUnit);
  }
  window.addEventListener("resize", setUnit);

  setUnit();
  updateSliderUI(0);
}

// Expose shared state (optional - for audio-engine.js to access)
window.getSliderState = () => ({ sliderVal, targetVal, currentVal });
