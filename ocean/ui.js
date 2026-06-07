// ==================== UI (continuous slider) ====================
let sliderVal = 0;
let isDragging = false, dragRelative = false, dragStartY = 0, dragStartVal = 0;

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

function updateSliderUI(val) {
  const { td, inset, travel } = getTrackMetrics();
  const thumbTop = inset + val * travel;
  pillThumb.style.top = thumbTop + "px";
  pillFill.style.height = Math.max(0, pillTrack.clientHeight - (thumbTop + td / 2) - inset) + "px";
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
    updateSliderUI(sliderVal);
    if (typeof window.setTone === "function") window.setTone(sliderVal);
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
  updateSliderUI(sliderVal);
  if (typeof window.setTone === "function") window.setTone(sliderVal);
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  if (typeof window.setTone === "function") window.setTone(sliderVal);
}

function updatePlayIcon(playing) {
  if (!btnIcon) return;
  btnIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="15"/><rect x="14" y="4" width="4" height="15"/>'
    : '<polygon points="5,3 19,12 5,21" transform="translate(1,0)"/>';
}

function setUnit() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  updateSliderUI(sliderVal);
}

function applyOrientation() {
  // This is a fallback. Real orientation locking is very limited on iOS web.
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const wrap = document.querySelector(".player-wrap");
  if (wrap) {
    wrap.style.transform = angle ? `rotate(${(360 - angle) % 360}deg)` : "";
  }
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

  // Orientation handling (limited effectiveness on iOS)
  if (screen.orientation) {
    screen.orientation.addEventListener("change", applyOrientation);
  } else if (window.orientation !== undefined) {
    window.addEventListener("orientationchange", applyOrientation);
  }

  setUnit();
  updateSliderUI(0);
  applyOrientation();

  window.updatePlayIcon = updatePlayIcon;
}
