// ==================== UI (continuous slider + aggressive orientation) ====================
let sliderVal = 0;
let isDragging = false, dragRelative = false, dragStartY = 0, dragStartVal = 0;

const pillTrack = document.getElementById("pillTrack");
const pillFill = document.getElementById("pillFill");
const pillThumb = document.getElementById("pillThumb");
const sliderValue = document.getElementById("sliderValue");
const btnIcon = document.getElementById("btnIcon");
const playerWrap = document.querySelector(".player-wrap");

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

function applyOrientation() {
  if (!playerWrap) return;

  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;

  playerWrap.style.transition = "transform 0.1s ease";
  playerWrap.style.transform = "";
  playerWrap.style.width = "";
  playerWrap.style.height = "";
  playerWrap.style.position = "";
  playerWrap.style.top = "";
  playerWrap.style.left = "";

  if (angle === 90 || angle === -90) {
    playerWrap.style.transform = `rotate(${-angle}deg)`;
    playerWrap.style.width = `${window.innerHeight}px`;
    playerWrap.style.height = `${window.innerWidth}px`;
    playerWrap.style.position = "absolute";
    playerWrap.style.top = "50%";
    playerWrap.style.left = "50%";
    playerWrap.style.transformOrigin = "center center";
  } else if (angle === 180) {
    playerWrap.style.transform = "rotate(180deg)";
  }
}

function setUnit() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--unit", (h * 0.86) / 209 + "px");
  updateSliderUI(sliderVal);
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

  // More aggressive orientation detection for iOS
  const handleOrientation = () => applyOrientation();

  if (screen.orientation) {
    screen.orientation.addEventListener("change", handleOrientation);
  }
  window.addEventListener("orientationchange", handleOrientation);
  window.addEventListener("resize", handleOrientation); // extra fallback

  setUnit();
  updateSliderUI(0);
  applyOrientation();

  window.updatePlayIcon = updatePlayIcon;
}
