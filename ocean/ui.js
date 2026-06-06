// ==================== UI ====================
let sliderVal = 0;
let isDragging = false;
let dragRelative = false;
let dragStartY = 0;
let dragStartVal = 0;
const pillTrack = document.getElementById("pillTrack");
const pillFill = document.getElementById("pillFill");
const pillThumb = document.getElementById("pillThumb");
const sliderValue = document.getElementById("sliderValue");
const btnIcon = document.getElementById("btnIcon");
function getTrackMetrics() {
  const td = pillThumb.offsetWidth;
  const inset = (pillTrack.clientWidth - td) / 2;
  const travel = pillTrack.clientHeight - inset * 2 - td;
  return { td, inset, travel };
}
// Number of discrete slider stops = number of files. Falls back to 6.
function numStops() {
  return (typeof window.NUM_FILES === "number" && window.NUM_FILES > 0)
    ? window.NUM_FILES : 6;
}
// Snap a 0..1 value to the nearest of N evenly-spaced stops.
function snapVal(val) {
  const n = numStops();
  return Math.round(val * (n - 1)) / (n - 1);
}
function updateSliderUI(val) {
  const { td, inset, travel } = getTrackMetrics();
  const thumbTop = inset + val * travel;
  pillThumb.style.top = thumbTop + "px";
  pillFill.style.height =
    Math.max(0, pillTrack.clientHeight - (thumbTop + td / 2) - inset) + "px";
  // Show the file index: brightest = N-1 at the top, darkest = 0 at bottom.
  const n = numStops();
  sliderValue.textContent = Math.round((1 - val) * (n - 1));
}
function valFromY(clientY) {
  const { td, inset, travel } = getTrackMetrics();
  const y = clientY - pillTrack.getBoundingClientRect().top - inset - td / 2;
  return Math.max(0, Math.min(1, y / travel));
}
// Apply a tone change to the audio engine, if it's available.
// immediate=true tracks the finger during a drag; false is the damped settle.
function applyTone(val, immediate) {
  if (typeof window.setTone === "function") {
    window.setTone(val, immediate);
  }
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
    // Tap-to-jump: snap to the nearest stop.
    sliderVal = snapVal(valFromY(clientY));
    updateSliderUI(sliderVal);
    applyTone(sliderVal, false);
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
  sliderVal = snapVal(sliderVal);
  updateSliderUI(sliderVal);
  // Track the finger; snapping keeps it on discrete stops.
  applyTone(sliderVal, true);
}
function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  // Settle smoothly to the final position on release.
  applyTone(sliderVal, false);
}
function updatePlayIcon(playing) {
  if (!btnIcon) return;
  btnIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="15"/><rect x="14" y="4" width="4" height="15"/>'
    : '<polygon points="5,3 19,12 5,21" transform="translate(1,0)"/>';
}
function setUnit() {
  // Disable the detent transition during layout changes so the thumb doesn't
  // visibly slide when the unit/size recalculates (load, rotate, resize).
  pillThumb.style.transition = "none";
  pillFill.style.transition = "none";
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  updateSliderUI(sliderVal);
  // Re-enable on the next frame so subsequent moves animate.
  requestAnimationFrame(() => {
    pillThumb.style.transition = "";
    pillFill.style.transition = "";
  });
}
function initSlider() {
  pillTrack.addEventListener("mousedown", onDragStart);
  pillTrack.addEventListener("touchstart", onDragStart, { passive: true });
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("touchmove", onDragMove, { passive: false });
  window.addEventListener("mouseup", onDragEnd);
  window.addEventListener("touchend", onDragEnd);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", setUnit);
  window.addEventListener("resize", setUnit);
  setUnit();
  updateSliderUI(0);
  window.updatePlayIcon = updatePlayIcon;
}
