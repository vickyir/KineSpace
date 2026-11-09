/**
 * Config — every tunable number of the Physio Lens in one place.
 *
 * Units are centimetres, degrees and seconds unless the name says otherwise.
 * Each value cites its source:
 *   §6        the build brief's initial config
 *   4:4       Figma "Spatial System" board
 *   20:775    Figma session-flow / constraint tables
 *   1a…6b     the Spec panel under that Figma screen
 *   PROPOSED  not in Figma or §6; approved at the Phase 0 checkpoint as a starting value
 *
 * Targets are always a fraction of today's calibrated range (see TARGET_*); never add an
 * absolute angle or distance as a therapy target here.
 */
export const Config = {
  // ─── Layout ──────────────────────────────────────────────────────────────
  /** Distance of the window / HUD plane (the 1000 × 1400 canvas is the display at 1.1 m). §6, 4:4 */
  WINDOW_Z_CM: 110,
  /** One Figma px in cm on the WINDOW_Z_CM plane (1000 × 1400 px = 53 × 77 cm). §6 */
  PX_TO_CM: 0.053,
  /** Canvas-centre height relative to camera forward. §6 started at −8; the LS camera is centred on forward (DEVIATIONS.md P15), so 0. Tune on device. */
  LAYOUT_Y0_CM: 0,
  /** Horizontal / vertical extent of the display at WINDOW_Z_CM, derived from the canvas. 4:4 */
  DISPLAY_H_FOV_DEG: 27.1,
  DISPLAY_V_FOV_DEG: 38.6,
  /** Soft head-lock response time for HUD bar, phase strip and edge arrow. 4:4 */
  LAZY_FOLLOW_S: 0.4,
  /** Hand zone below the Neutral Forward Vector: chest height, −15° to −20°. 4:4 */
  HAND_ZONE_PITCH_DEG: -17.5,
  /** Hand zone reach. 4:4 */
  HAND_ZONE_REACH_CM: 45,
  /** Ghost-guide distance, slightly below eye (0.8–1.0 m). 4:4, 3 */
  GHOST_DIST_CM: 90,
  /** Minimum interactive target: 2° ≈ 4 cm at 110 cm. 4:4, §2 */
  MIN_TARGET_CM: 4,
  /** Minimum gap between interactive targets: 1° ≈ 1.9 cm. 4:4, §2 */
  MIN_TARGET_GAP_CM: 1.92,

  // ─── Targets: fraction of today's calibrated range ───────────────────────
  TARGET_GENTLE: 0.8, // §6, 2 — TODO: validate with physiotherapist
  TARGET_STANDARD: 0.9, // §6, 2 — TODO: validate with physiotherapist
  TARGET_AFTER_PAIN: 0.7, // §6, 6b — TODO: validate with physiotherapist
  SORE_DELTA: -0.05, // §6, 6a — TODO: validate with physiotherapist
  /** Sessions that default to Gentle. 2 */
  GENTLE_DEFAULT_SESSIONS: 3, // TODO: validate with physiotherapist

  // ─── Session structure ───────────────────────────────────────────────────
  REPS_PER_SET: 8, // §6 — TODO: validate with physiotherapist
  SETS: 2, // §6 — TODO: validate with physiotherapist
  REST_S: 15, // §6, 4c — TODO: validate with physiotherapist
  BREATH_IN_S: 4, // 4c — TODO: validate with physiotherapist
  BREATH_OUT_S: 6, // 4c — TODO: validate with physiotherapist
  WARMUP_REPS: 5, // §6, W — TODO: validate with physiotherapist
  /** Tempo halo: one open or close movement per beat. */
  WARMUP_TEMPO_S: 2, // W — TODO: validate with physiotherapist
  /** The warm-up can be skipped once the first session is this many days old. */
  WARMUP_SKIP_AFTER_DAYS: 7, // W — TODO: validate with physiotherapist
  /** Touches in the "Try it once" sandbox that unlock "Start exercise". */
  TUTORIAL_TOUCHES: 4, // 3
  SESSION_TARGET_MIN: 7, // §6, 20:775 — TODO: validate with physiotherapist
  SESSION_CAP_MIN: 10, // §6, 20:775 — TODO: validate with physiotherapist
  /** Daily goal shown on the summary ("session 2 of 3 today"). */
  DAILY_GOAL_SESSIONS: 3, // 6a, 20:775 — TODO: validate with physiotherapist
  /** Advice text only — Lenses cannot schedule notifications. */
  NEXT_SESSION_H: 4, // 6a — TODO: validate with physiotherapist

  // ─── Holds & timers ──────────────────────────────────────────────────────
  HOLD_S: 3, // §6, 3:122 — TODO: validate with physiotherapist
  /** Hold timer drains at this multiple of the fill rate when tolerance is lost. */
  HOLD_DRAIN_MULT: 2, // 3:122 — TODO: validate with physiotherapist
  OPPOSITION_HOLD_S: 1, // §6, 3, 4a — TODO: validate with physiotherapist
  HEAD_RANGE_HOLD_S: 2, // §6, 1c — TODO: validate with physiotherapist
  HAND_RANGE_HOLD_S: 3, // §6, 1d — TODO: validate with physiotherapist

  // ─── Calibration ─────────────────────────────────────────────────────────
  NEUTRAL_MAX_ERR_DEG: 2, // §6, 1b — TODO: validate with physiotherapist
  NEUTRAL_HOLD_S: 3, // §6, 1b — TODO: validate with physiotherapist
  NEUTRAL_DRIFT_RESET_DEG: 5, // §6, 1b — TODO: validate with physiotherapist
  /** Display scale of the 1c range gauge ("L 60° · 0° · R 60°"); not a target. */
  CAL_GAUGE_MAX_DEG: 60, // 1c
  /** 1c "at the comfortable limit": yaw stays within this band for HEAD_RANGE_HOLD_S. */
  CAL_LIMIT_STABLE_DEG: 2, // PROPOSED — TODO: validate with physiotherapist
  /** 1d "spread is stable": fingertip spread varies by at most this for HAND_RANGE_HOLD_S. */
  SPREAD_STABLE_CM: 0.5, // PROPOSED — TODO: validate with physiotherapist

  // ─── Movement detection ──────────────────────────────────────────────────
  PACER_DEG_S: 20, // §6, 4b, 4d — TODO: validate with physiotherapist
  /** Amber "Slower". 4b's spec says 60°/s; 20:775, 1c, 4d and §6 say 30 (see DEVIATIONS.md). */
  TOO_FAST_DEG_S: 30, // §6 — TODO: validate with physiotherapist
  SHOULDER_DROP_CM: 3, // §6, 4e — TODO: validate with physiotherapist
  /** Head target counts as reached within ± this. */
  HEAD_TARGET_TOL_DEG: 3, // PROPOSED — TODO: validate with physiotherapist
  /** Return arrow pulses until yaw is back within this of centre. */
  RETURN_CENTRE_DEG: 5, // 4b — TODO: validate with physiotherapist
  /**
   * 4b edge indicator appears once the centre is this far from where the head points and stays,
   * pulsing on the way back, until yaw < RETURN_CENTRE_DEG (DEVIATIONS.md F24).
   */
  EDGE_ARROW_SHOW_DEG: 20, // §7 4b — TODO: validate with physiotherapist
  /** Display scale of the 4b yaw gauge ("L 45° · 0° · R 45°"); widens in 15° steps if a target needs it. Not a target. */
  YAW_GAUGE_DEG: 45, // 4b
  /** Thumb-tip to finger-tip contact distance. */
  OPPOSITION_CONTACT_CM: 2.0, // §6, 20:939 — TODO: validate with physiotherapist
  /** Joint node turns amber ("approaching") below this fingertip distance. */
  OPPOSITION_APPROACH_CM: 4, // PROPOSED — TODO: validate with physiotherapist
  /** Tabletop pose MCP flexion before the pace factor is applied (pass = pace × this). */
  TABLETOP_MCP_DEG: 90, // 4f — TODO: validate with physiotherapist
  /** A finger segment counts as "straight" at or above this joint angle. */
  TENDON_STRAIGHT_DEG: 160, // PROPOSED — TODO: validate with physiotherapist
  /** Fist: every fingertip within this distance of the palm centre. */
  FIST_TIP_PALM_CM: 4, // PROPOSED — TODO: validate with physiotherapist
  /** 3: head height changing by more than SHOULDER_DROP_CM (torso tilt / shoulder hike) plays a gentle tone, at most this often. */
  POSTURE_CUE_COOLDOWN_S: 5, // PROPOSED — TODO: validate with physiotherapist

  // ─── Tracking ────────────────────────────────────────────────────────────
  TRACK_LOST_S: 0.5, // §6, 4g — TODO: validate with physiotherapist
  RESUME_STABLE_S: 1, // §6, 4g — TODO: validate with physiotherapist
  /** Both palm centres closer than this = hand-over-hand overlap. */
  HANDS_OVERLAP_CM: 8, // PROPOSED — TODO: validate with physiotherapist
  /** A keypoint jumping farther than this in one frame counts as low-confidence tracking. */
  KEYPOINT_JUMP_CM: 5, // PROPOSED — TODO: validate with physiotherapist

  // ─── Input ───────────────────────────────────────────────────────────────
  DWELL_S: 3, // §6, 4:4 — TODO: validate with physiotherapist
  DWELL_GRACE_MS: 300, // §6, 4:4 — TODO: validate with physiotherapist
  /** Focused hub card advances toward the user by this much. */
  HUB_FOCUS_DEPTH_CM: 3, // PROPOSED

  // ─── Device ──────────────────────────────────────────────────────────────
  BATTERY_END_PCT: 15, // §6, 20:775
}
