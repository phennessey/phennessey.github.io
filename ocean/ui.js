// ==================== UI (continuous slider) ====================
let sliderVal = 0;
let isDragging = false, dragRelative = false, dragStartY = 0, dragStartVal = 0;
const pillTrack = document.getElementById("pillTrack");
const pillThumb = document.getElementById("pillThumb");
const sliderValue = document.getElementById("sliderValue");
const btnIcon = document.getElementById("btnIcon");
const moonImages = [];
function preloadMoonImages() {
  for (let i = 0; i <= 100; i++) {
    const n = String(i).padStart(3, "0");
    const img = new Image();
    img.src = "img/moon_" + n + ".png";
    moonImages[i] = img;
  }
}
function getTrackMetrics() {
  const td = pillThumb.offsetWidth;
  const inset = (pillTrack.clientWidth - td) / 2;
  const travel = pillTrack.clientHeight - inset * 2 - td;
  return { td, inset, travel };
}
function updateMoonImage(displayVal) {
  const el = document.getElementById("moonImg");
  if (!el) return;
  const idx = Math.round(displayVal);
  el.src = "img/moon_" + String(idx).padStart(3, "0") + ".png";
}
function updateSliderUI(val) {
  const { td, inset, travel } = getTrackMetrics();
  const thumbTop = inset + val * travel;
  pillThumb.style.top = thumbTop + "px";
  const displayVal = Math.round((1 - val) * 100);
  sliderValue.textContent = displayVal;
  updateMoonImage(displayVal);
}
function valFromY(clientY) {
  const { td, inset, travel } = getTrackMetrics();
  const y = clientY - pillTrack.getBoundingClientRect().top - inset - td / 2;
  return Math.max(0, Math.min(1, y / travel));
}
function applyTone(val) { if (typeof window.setTone === "function") window.setTone(val); }
function onDragStart(e) {
  isDragging = true;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const thumbTop = parseFloat(pillThumb.style.top) || 0;
  const yInPill = clientY - pillTrack.getBoundingClientRect().top;
  dragRelative = yInPill >= thumbTop && yInPill <= thumbTop + pillThumb.offsetWidth;
  dragStartY = clientY; dragStartVal = sliderVal;
  if (!dragRelative) { sliderVal = valFromY(clientY); updateSliderUI(sliderVal); applyTone(sliderVal); }
}
function onDragMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  if (dragRelative) {
    const { travel } = getTrackMetrics();
    sliderVal = Math.max(0, Math.min(1, dragStartVal + (clientY - dragStartY) / travel));
  } else { sliderVal = valFromY(clientY); }
  updateSliderUI(sliderVal); applyTone(sliderVal);
}
function onDragEnd() { if (!isDragging) return; isDragging = false; applyTone(sliderVal); }
function updatePlayIcon(playing) {
  if (!btnIcon) return;
  btnIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="15"/><rect x="14" y="4" width="4" height="15"/>'
    : '<polygon points="5,3 19,12 5,21" transform="translate(1,0)"/>';
}
function setUnit() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  document.documentElement.style.setProperty("--bg-h", (h * 1.76) + "px");
  document.documentElement.style.setProperty("--bg-y", "30%");
  updateSliderUI(sliderVal);
}
function initSlider() {
  preloadMoonImages();
  pillTrack.addEventListener("mousedown", onDragStart);
  pillTrack.addEventListener("touchstart", onDragStart, { passive: true });
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("touchmove", onDragMove, { passive: false });
  window.addEventListener("mouseup", onDragEnd);
  window.addEventListener("touchend", onDragEnd);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", setUnit);
  window.addEventListener("resize", setUnit);
  setUnit(); updateSliderUI(0);
  window.updatePlayIcon = updatePlayIcon;
}
