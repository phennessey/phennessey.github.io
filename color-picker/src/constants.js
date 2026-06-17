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
export const DEFAULT_MATCH_COUNT            = 5;   // default per-swatch match count
export const MIN_MATCHES          = 1;
export const MIN_WITH_PROMOTED    = 2;   // matchCount floor when a pantone is promoted
export const MAX_MATCHES          = 50;  // true max settable via wheel
export const MIN_MATCH_WIDTH      = 28;  // px; visible max = floor(rowWidth / MIN_MATCH_WIDTH)

// Chip "skyline": a chip slides down by  ratio = deltaE / chipCutoff  of the
// strip height (deltaE = OKLab distance); at/beyond the cutoff (ratio ≥ 1) it
// slides fully out and is hidden. The chipCutoff slider sets that distance —
// lowering it scales the skyline and hides more poor matches.
export const DEFAULT_CHIP_CUTOFF = 0.05;
export const MIN_CHIP_CUTOFF     = 0.01;
export const MAX_CHIP_CUTOFF     = 0.10;
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
