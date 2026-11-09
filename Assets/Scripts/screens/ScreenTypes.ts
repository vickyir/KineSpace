import {Module, Pace} from "../CalibrationStore"
import {GlobalCommand} from "../VoiceCommands"

/** Figma screen IDs (brief §1). */
export type ScreenId = "1a" | "1b" | "1c" | "1d" | "2" | "W" | "3" | "4a" | "4b" | "4c" | "4d" | "4e" | "4f" | "4g" | "6a" | "6b"

export type ExerciseId = "4a" | "4b" | "4d" | "4e" | "4f"

/** Exercises per Hub module, in card order (approved at Phase 0; see DEVIATIONS.md F6). */
export const MODULE_EXERCISES: Record<Module, ExerciseId[]> = {
  hand: ["4a", "4f"],
  head: ["4d", "4e", "4b"],
}

/** HUD titles (Figma copy). */
export const EXERCISE_TITLES: Record<ExerciseId, string> = {
  "4a": "Finger opposition",
  "4b": "Turn left & right",
  "4d": "Look up & down",
  "4e": "Ear to shoulder",
  "4f": "Tendon gliding",
}

/** Exercises that have a tutorial frame (only 3 · Finger opposition; DEVIATIONS.md F9). */
export const TUTORIAL_FOR: Partial<Record<ExerciseId, ScreenId>> = {
  "4a": "3",
}

/** Hand-tracked steps where losing the hand shows 4g. */
export const HAND_TRACKED: ScreenId[] = ["3", "4a", "4f"]

/** Hand exercises: 4g also shows when the hand is not seen at all after TRACK_LOST_S. */
export const HAND_EXERCISES: ScreenId[] = ["4a", "4f"]

/** Phase strip index per screen (Calibrate › Warm-up › Exercises › Summary); −1 = no strip. */
export const PHASE_INDEX: Record<ScreenId, number> = {
  "1a": -1,
  "1b": -1,
  "1c": -1,
  "1d": -1,
  "2": -1,
  W: 1,
  "3": -1,
  "4a": 2,
  "4b": 2,
  "4c": 2,
  "4d": 2,
  "4e": 2,
  "4f": 2,
  "4g": 2,
  "6a": 3,
  "6b": -1,
}

/** Screens showing the top HUD bar. */
export const HUD_SCREENS: ScreenId[] = ["W", "4a", "4b", "4c", "4d", "4e", "4f", "4g"]

/** What a screen needs to render (read-only snapshot from the state machine). */
export type SessionContext = {
  firstRun: boolean
  /** Short daily calibration (every session after the first). */
  dailyCalibration: boolean
  module: Module | null
  pace: Pace
  /** Fraction of today's calibrated range used as target (§5). */
  targetFactor: number
  exercise: ExerciseId | null
  set: number
  rep: number
  repsDoneInSet: number
  totalReps: number
  smoothReps: number
  elapsedS: number
  /** Set that just finished (rest screen). */
  completedSet: number
}

/**
 * Contract for screens/Screen*.ts. Screens register with the SessionStateMachine, which owns
 * visibility: it calls show() / hide(), freezes them on pause or tracking loss, and forwards
 * global voice commands first to the visible screen.
 */
export interface ScreenController {
  readonly screenId: ScreenId
  show(context: SessionContext): void
  hide(): void
  /** Pause / tracking lost: timers, holds and rep counting stop until unfrozen. */
  setFrozen(frozen: boolean): void
  /** Tracking lost: the 4g card replaces this screen's content until uncovered (state is kept). */
  setCovered?(covered: boolean): void
  /** Return true when the screen handled the command. */
  handleCommand?(command: GlobalCommand): boolean
}
