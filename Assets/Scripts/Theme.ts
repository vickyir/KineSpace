import {Config} from "./Config"

/**
 * Theme — design tokens from the Figma file (variables, 4:4 palette, type scale) plus the
 * device mappings of visionOS materials, and the px → cm helpers every UI script uses.
 *
 * Additive display: black is transparent and white is brightest. The visionOS "vibrant"
 * materials (luminosity / colour-dodge blends over a blurred background) cannot be composited
 * on Spectacles, so they are mapped to the colour they render as on a dark background in the
 * Figma screenshots (see DEVIATIONS.md, "Glass & vibrancy").
 */

/** "#RRGGBB" or "#RRGGBBAA" → linear 0–1 vec4. `alpha` overrides the hex alpha. */
export function hex(value: string, alpha?: number): vec4 {
  const h = value.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
  return new vec4(r, g, b, alpha ?? a)
}

/** White at the given alpha. */
export function white(alpha: number): vec4 {
  return new vec4(1, 1, 1, alpha)
}

export function withAlpha(color: vec4, alpha: number): vec4 {
  return new vec4(color.x, color.y, color.z, alpha)
}

export const Colors = {
  // Figma variables
  void: hex("#000000"),
  cyan: hex("#00F5D4"), // accent/cyan/100 — neutral · focus · primary
  cyan70: hex("#00F5D4", 0.7), // accent/cyan/70 (step indicator, steps done)
  cyan40: hex("#00F5D4", 0.4), // accent/cyan/40
  cyan20: hex("#00F5D4", 0.2), // accent/cyan/20
  emerald: hex("#10B981"), // accent/emerald/100 — target reached · success
  emerald20: hex("#10B981", 0.2), // accent/emerald/20
  emerald10: hex("#10B981", 0.1), // accent/emerald/10
  amber: hex("#F59E0B"), // accent/amber/100 — approaching · caution · safety
  amber20: hex("#F59E0B", 0.2), // accent/amber/20
  coral: hex("#EF4444"), // accent/coral/100 — stop · pain · exit (sparingly)
  /** Off-white text, never #FFF fills (4:4 palette swatch, approved over the #FFFFFFF5 variable). */
  textPrimary: hex("#E8FFFB"),
  textSecondary: hex("#9BC9C1"), // text/secondary/100
  textMuted: hex("#5E8A84"), // text/muted/100
  textOnAccent: hex("#00211C"), // text/on-accent

  // Device mappings of visionOS materials (rendered appearance on black)
  /** visionOS/Glass · Window → low-alpha neutral tint (Figma renders #272727 on black). */
  glassFill: white(0.15),
  /** Window / HUD edge highlight: 1.5 px border, white 40 %. */
  glassEdge: white(0.4),
  /** visionOS/Control · Idle (secondary pills, badges, phase strip, HUD round buttons). */
  controlFill: white(0.08),
  /** visionOS/Control · Hover. */
  controlHover: white(0.14),
  /** visionOS/View · Recessed (segmented-control track); a darker-than-glass well cannot exist additively. */
  recessedTrack: white(0.05),
  /** Selected segment in a recessed segmented control (1d hand selector, 2 pace selector). */
  segmentSelected: white(0.18),
  /** visionOS/Separator (dividers on glass and controls). */
  separator: white(0.12),
  /** visionOS/Text · Secondary on window glass (renders #858585). */
  vibrantSecondary: hex("#858585"),
  /** visionOS/Text · Secondary on a control or strip (renders #6E6E6E). */
  vibrantSecondaryOnControl: hex("#6E6E6E"),
  /** visionOS/Text · Tertiary (renders #343434). */
  vibrantTertiary: hex("#343434"),
  /** Primary button divider and sublabel: text/on-accent at 20 % and 60 %. */
  onAccentDivider: hex("#00211C", 0.2),
  onAccentSublabel: hex("#00211C", 0.6),
}

/** Inter weights used in the Figma file. */
export enum Weight {
  Regular = 400,
  Medium = 500,
  SemiBold = 600,
  Bold = 700,
}

const FONTS: Record<Weight, Font> = {
  [Weight.Regular]: requireAsset("../Fonts/Inter-Regular.ttf") as Font,
  [Weight.Medium]: requireAsset("../Fonts/Inter-Medium.ttf") as Font,
  [Weight.SemiBold]: requireAsset("../Fonts/Inter-SemiBold.ttf") as Font,
  [Weight.Bold]: requireAsset("../Fonts/Inter-Bold.ttf") as Font,
}

export function font(weight: Weight): Font {
  return FONTS[weight]
}

/** Type scale (4:4) — px on the 1000 × 1400 canvas. Body ≥ 28 px, never below 24 px. */
export const Type = {
  largeTitle: {px: 56, weight: Weight.Bold},
  title: {px: 40, weight: Weight.SemiBold},
  body: {px: 28, weight: Weight.Regular},
  caption: {px: 24, weight: Weight.SemiBold},
}

/** Corner radii in px. Pills use half their height. */
export const Radius = {
  window: 46,
}

export const Textures = {
  aim: requireAsset("../UI/Icons/icon_aim_128x128.png") as Texture,
  aimDot: requireAsset("../UI/Icons/aim_dot_128x128.png") as Texture,
  shield: requireAsset("../UI/Icons/icon_shield_128x128.png") as Texture,
  info: requireAsset("../UI/Icons/icon_info_128x128.png") as Texture,
  check: requireAsset("../UI/Icons/icon_check_128x128.png") as Texture,
  checkLarge: requireAsset("../UI/Icons/icon_check_large_128x128.png") as Texture,
  pause: requireAsset("../UI/Icons/icon_pause_128x128.png") as Texture,
  close: requireAsset("../UI/Icons/icon_x_128x128.png") as Texture,
  user: requireAsset("../UI/Icons/icon_user_128x128.png") as Texture,
  clock: requireAsset("../UI/Icons/icon_clock_128x128.png") as Texture,
  repeat: requireAsset("../UI/Icons/icon_repeat_128x128.png") as Texture,
  battery: requireAsset("../UI/Icons/icon_battery_128x128.png") as Texture,
  signal: requireAsset("../UI/Icons/icon_signal_128x128.png") as Texture,
  handPosture: requireAsset("../UI/Icons/icon_hand_posture_128x128.png") as Texture,
  timer: requireAsset("../UI/Icons/icon_timer_128x128.png") as Texture,
  chevRight: requireAsset("../UI/Icons/icon_chev_right_128x128.png") as Texture,
  alert: requireAsset("../UI/Icons/icon_alert_128x128.png") as Texture,
  up: requireAsset("../UI/Icons/icon_up_128x128.png") as Texture,
  wind: requireAsset("../UI/Icons/icon_wind_128x128.png") as Texture,
  /** 4g "Move back arrow" (80 × 40 px design). */
  moveBackArrow: requireAsset("../UI/Icons/move_back_arrow_256x128.png") as Texture,
  /** 1d capture frame corners (440 × 470 px design, white 85 %). */
  captureFrame: requireAsset("../UI/Icons/capture_frame_479x512.png") as Texture,
  /** Hub head-card movement arrow (260 × 60 px design, white 85 %). */
  movementArrow: requireAsset("../UI/Icons/movement_arrow_512x118.png") as Texture,
}

export const Silhouettes = {
  handOpen: requireAsset("../UI/Silhouettes/sil_hand_open_314x512.png") as Texture,
  handSpread: requireAsset("../UI/Silhouettes/sil_hand_spread_400x512.png") as Texture,
  handOk: requireAsset("../UI/Silhouettes/sil_hand_ok_291x512.png") as Texture,
  headFront: requireAsset("../UI/Silhouettes/sil_head_front_451x512.png") as Texture,
  sideOpen: requireAsset("../UI/Silhouettes/sil_side_open_183x256.png") as Texture,
  sideTabletop: requireAsset("../UI/Silhouettes/sil_side_tabletop_184x256.png") as Texture,
  sideFist: requireAsset("../UI/Silhouettes/sil_side_fist_183x256.png") as Texture,
  ghostTabletopSide: requireAsset("../UI/Silhouettes/sil_ghost_tabletop_side_368x512.png") as Texture,
  /** 4f ghost for Open palm / Full fist: the 21:285 / 21:307 minis at the 21:318 ghost scale (no Figma frame). */
  ghostOpenSide: requireAsset("../UI/Silhouettes/sil_ghost_open_side_367x512.png") as Texture,
  ghostFistSide: requireAsset("../UI/Silhouettes/sil_ghost_fist_side_367x512.png") as Texture,
  /** 4g "Hand · outside the zone": dashed amber outline, white 10 % fill (colours baked in; tint white). */
  handOutsideZone: requireAsset("../UI/Silhouettes/ill_hand_outside_zone_396x512.png") as Texture,
}

/** Unlit, alpha-blended material for procedural meshes (arcs, rings). Clone before use. */
export const UNLIT_MATERIAL = requireAsset("../Materials/PhysioUnlit.mat") as Material

/** Figma px → cm on the WINDOW_Z_CM plane. */
export function px(value: number): number {
  return value * Config.PX_TO_CM
}

/**
 * Em size in cm produced by Text.size = 1 (measured in Lens Studio 5.24 with Inter:
 * size 100 → 2.2447 cm per em, from the laid-out width of "Continue").
 */
export const EM_CM_PER_TEXT_SIZE = 0.022447

/** Figma font size in px → Lens Text.size giving the same em on the WINDOW_Z_CM plane. */
export function textSize(fontPx: number): number {
  return px(fontPx) / EM_CM_PER_TEXT_SIZE
}
