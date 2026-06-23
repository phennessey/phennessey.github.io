// Shared configuration constants and inline icon assets.

// Picker geometry
export const DISC_SIZE   = 264;
export const DISC_LB_GAP = 26;
export const LB_WIDTH    = 40;
export const LB_HEIGHT   = 256;
export const HANDLE_R    = 6;
export const HANDLE_SW   = 1.75;
export const MIDDLE_GRAY = 0.57;
export const MAX_COLORS  = 10;
// Magnetic snap radius (px) around the chroma cusp during a Shift lightbar drag.
export const CUSP_SNAP_PX = 10;

// Pantone dot rendering
export const DOT_RADIUS       = 1.5;
export const DOT_PEAK_OPACITY = 0.3;
export const DOT_FALLOFF_L    = 0.02;
export const DOT_PROMOTED_RADIUS = 2.5;
export const DOT_PROMOTED_STROKE = 1.75;

// Pantone matching
export const DEFAULT_MATCH_COUNT  = 5;   // fallback chip count when row width is unknown
export const MIN_MATCHES          = 1;
export const MAX_MATCHES          = 50;  // candidate-pool / cell-count ceiling
export const MIN_MATCH_WIDTH      = 28;  // px; visible max = floor(rowWidth / MIN_MATCH_WIDTH)

// Chip "skyline": every swatch fills with as many chips as physically fit
// (floor(rowWidth / MIN_MATCH_WIDTH)). Bar heights are scaled per swatch to
// maximize dynamic range: the worst match (largest deltaE) sits at SKYLINE_FLOOR
// and the rest scale linearly against a perfect (deltaE = 0) match at full
// height, so the best lands at its true relative position — never pinned to the
// top.
export const SKYLINE_FLOOR = 0.08;
// Below this bar height (px), a chip has no room for its out-of-gamut icon, so
// the icon is hidden.
export const MIN_GAMUT_BAR_H       = 26;

// Misc
export const HISTORY_LIMIT        = 100;
export const WHEEL_DEBOUNCE_MS    = 500;
export const BG_LEVELS            = 32;

// Inline SVG icons (used by swatch DOM and pantone chips)
export const GAMUT_ICON_SVG = `<svg viewBox="0 0 18 16" fill="currentColor"><path d="M17.8,13.6L10.4.8c-.7-1.1-2.2-1.1-2.9,0L.2,13.6c-.6,1.1.2,2.4,1.5,2.4h14.7c1.3,0,2.1-1.3,1.5-2.4ZM7.8,4.4c0-.7.6-1.2,1.2-1.2s1.2.6,1.2,1.2v5.1c0,.7-.6,1.2-1.2,1.2s-1.2-.6-1.2-1.2v-5.1ZM9,14.8c-.8,0-1.4-.6-1.4-1.4s.7-1.4,1.4-1.4,1.4.6,1.4,1.4-.6,1.4-1.4,1.4Z"/></svg>`;

export const CLOSE_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8,0C3.6,0,0,3.6,0,8s3.6,8,8,8,8-3.6,8-8S12.4,0,8,0ZM12.1,10.6l-1.6,1.6-2.6-2.6-2.6,2.6-1.6-1.6,2.6-2.6-2.6-2.6,1.6-1.6,2.6,2.6,2.6-2.6,1.6,1.6-2.6,2.6,2.6,2.6Z"/></svg>`;
