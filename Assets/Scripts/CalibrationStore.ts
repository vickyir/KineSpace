import {Config} from "./Config"

export type HandSide = "right" | "left"
export type Pace = "gentle" | "standard"
export type Module = "hand" | "head"
export type Comfort = "good" | "sore" | "pain"
export type SessionEnd = "complete" | "pain" | "battery" | "cap" | "stopped"

/** Max_ROM_User — today's comfortable maxima from calibration (1c, 1d). 0 = not calibrated. */
export type RangeOfMotion = {
  fingerSpreadCm: number
  yawLeftDeg: number
  yawRightDeg: number
  pitchUpDeg: number
  pitchDownDeg: number
  rollLeftDeg: number
  rollRightDeg: number
}

export type SessionRecord = {
  /** Epoch ms. */
  startedAt: number
  durationS: number
  module: Module | null
  pace: Pace
  /** Exercise screen IDs run, e.g. ["4a", "4f"]. */
  exercises: string[]
  reps: number
  /** Reps done within the speed limit (6a "Slow, smooth movement"). */
  smoothReps: number
  rom: RangeOfMotion
  comfort: Comfort | null
  end: SessionEnd
  /** Flagged for the physio (6b). */
  painFlag: boolean
}

type Stored = {
  version: 1
  hand: HandSide
  firstRunDone: boolean
  rom: RangeOfMotion
  romCapturedAt: number
  /** Neutral Forward Vector (1b). Valid only within the tracking session it was captured in. */
  neutral: {forward: number[]; headHeightCm: number; capturedAt: number} | null
  tutorialSeen: Record<string, boolean>
  /** Applied to the next session's targets, from the last comfort check / safety stop. */
  nextTargetAdjustment: "none" | "pain" | "sore"
  history: SessionRecord[]
  /** Session interrupted by pause / exit; moved to history on the next launch. */
  inProgress: SessionRecord | null
}

export const STORAGE_KEY = "kinespace.physio.v1"
const HISTORY_LIMIT = 120
const DAY_MS = 24 * 60 * 60 * 1000

export function emptyRom(): RangeOfMotion {
  return {fingerSpreadCm: 0, yawLeftDeg: 0, yawRightDeg: 0, pitchUpDeg: 0, pitchDownDeg: 0, rollLeftDeg: 0, rollRightDeg: 0}
}

function emptyStore(): Stored {
  return {
    version: 1,
    hand: "right",
    firstRunDone: false,
    rom: emptyRom(),
    romCapturedAt: 0,
    neutral: null,
    tutorialSeen: {},
    nextTargetAdjustment: "none",
    history: [],
    inProgress: null,
  }
}

/**
 * CalibrationStore — everything that survives between sessions, in Persistent Storage:
 * Neutral Forward Vector, Max_ROM_User, chosen hand, session history, tutorial-seen flags and
 * the next-target adjustment after "Pain" / "A bit sore". No network (physio sharing is phase 2).
 * Saves on every change and again on pause / exit.
 */
@component
export class CalibrationStore extends BaseScriptComponent {
  static instance: CalibrationStore

  @input
  @hint("Dev only: clear calibration, history and flags at launch (first-run testing). Keep off for release.")
  resetOnStart: boolean = false

  @input
  @hint("Dev only: fill uncalibrated head ranges with sample values so W, 4b, 4d and 4e can be previewed without running 1c. Keep off for release.")
  devSeedHeadRom: boolean = false

  private data: Stored = emptyStore()

  onAwake() {
    CalibrationStore.instance = this
    this.data = this.load()
    if (this.resetOnStart) {
      this.data = emptyStore()
      this.save()
    }
    if (this.devSeedHeadRom) this.seedHeadRom()
    if (this.data.inProgress) {
      this.pushHistory(this.data.inProgress)
      this.data.inProgress = null
      this.save()
    }
    global.persistentStorageSystem.store.onStoreFull = () => print("CalibrationStore: persistent storage is full")
    this.createEvent("OnPauseEvent").bind(() => this.save())
    this.createEvent("TurnOffEvent").bind(() => this.save())
  }

  // ─── Calibration ───────────────────────────────────────────────────────

  get hand(): HandSide {
    return this.data.hand
  }

  setHand(hand: HandSide): void {
    this.data.hand = hand
    this.save()
  }

  get firstRunDone(): boolean {
    return this.data.firstRunDone
  }

  markFirstRunDone(): void {
    this.data.firstRunDone = true
    this.save()
  }

  get rom(): RangeOfMotion {
    return {...this.data.rom}
  }

  get romCapturedAt(): number {
    return this.data.romCapturedAt
  }

  /** Merges today's calibrated maxima. */
  setRom(values: Partial<RangeOfMotion>): void {
    this.data.rom = {...this.data.rom, ...values}
    this.data.romCapturedAt = Date.now()
    this.save()
  }

  get neutral(): Stored["neutral"] {
    return this.data.neutral
  }

  setNeutral(forward: vec3, headHeightCm: number): void {
    this.data.neutral = {forward: [forward.x, forward.y, forward.z], headHeightCm, capturedAt: Date.now()}
    this.save()
  }

  isTutorialSeen(exercise: string): boolean {
    return this.data.tutorialSeen[exercise] === true
  }

  markTutorialSeen(exercise: string): void {
    this.data.tutorialSeen[exercise] = true
    this.save()
  }

  // ─── Targets ───────────────────────────────────────────────────────────

  /** Completed sessions (any ending). */
  get sessionCount(): number {
    return this.data.history.length
  }

  /** Gentle for the first GENTLE_DEFAULT_SESSIONS sessions (2). */
  defaultPace(): Pace {
    return this.data.history.length < Config.GENTLE_DEFAULT_SESSIONS ? "gentle" : "standard"
  }

  get nextTargetAdjustment(): Stored["nextTargetAdjustment"] {
    return this.data.nextTargetAdjustment
  }

  /** Fraction of today's calibrated range used as the target (§5). */
  targetFactor(pace: Pace): number {
    if (this.data.nextTargetAdjustment === "pain") return Config.TARGET_AFTER_PAIN
    const base = pace === "gentle" ? Config.TARGET_GENTLE : Config.TARGET_STANDARD
    return this.data.nextTargetAdjustment === "sore" ? base + Config.SORE_DELTA : base
  }

  // ─── History ───────────────────────────────────────────────────────────

  get history(): SessionRecord[] {
    return this.data.history.slice()
  }

  sessionsOn(dayMs: number): SessionRecord[] {
    const start = new Date(dayMs)
    start.setHours(0, 0, 0, 0)
    const from = start.getTime()
    return this.data.history.filter((s) => s.startedAt >= from && s.startedAt < from + DAY_MS)
  }

  firstSession(): SessionRecord | null {
    return this.data.history.length > 0 ? this.data.history[0] : null
  }

  /** Sessions that started 7–14 days before `nowMs` ("last week"). */
  lastWeek(nowMs: number): SessionRecord[] {
    return this.data.history.filter((s) => s.startedAt >= nowMs - 14 * DAY_MS && s.startedAt < nowMs - 7 * DAY_MS)
  }

  /** Snapshot of the running session, kept so a pause / exit never loses it. */
  saveInProgress(record: SessionRecord): void {
    this.data.inProgress = record
    this.save()
  }

  /** Ends a session: stores it and sets the next session's target adjustment. */
  recordSession(record: SessionRecord): void {
    this.data.inProgress = null
    this.pushHistory(record)
    this.data.nextTargetAdjustment =
      record.painFlag || record.comfort === "pain" ? "pain" : record.comfort === "sore" ? "sore" : "none"
    this.save()
  }

  /**
   * Dev preview data, not therapy values: ranges that give the Figma example targets at Gentle
   * (4b 30°, 4d up 24° / down 28°, 4e 24°). Only fills ranges that are still 0.
   */
  private seedHeadRom(): void {
    const sample: Partial<RangeOfMotion> = {yawLeftDeg: 37.5, yawRightDeg: 37.5, pitchUpDeg: 30, pitchDownDeg: 35, rollLeftDeg: 30, rollRightDeg: 30}
    const missing: Partial<RangeOfMotion> = {}
    for (const key of Object.keys(sample) as (keyof RangeOfMotion)[]) {
      if (this.data.rom[key] <= 0) missing[key] = sample[key]
    }
    if (Object.keys(missing).length > 0) {
      this.data.rom = {...this.data.rom, ...missing}
      this.save()
    }
  }

  /** Clears everything (debug). */
  reset(): void {
    this.data = emptyStore()
    this.save()
  }

  /** Re-reads Persistent Storage (after a dev tool restored a snapshot). */
  reload(): void {
    this.data = this.load()
  }

  save(): void {
    try {
      global.persistentStorageSystem.store.putString(STORAGE_KEY, JSON.stringify(this.data))
    } catch (e) {
      print(`CalibrationStore: save failed — ${e}`)
    }
  }

  private pushHistory(record: SessionRecord): void {
    this.data.history.push(record)
    if (this.data.history.length > HISTORY_LIMIT) {
      this.data.history.splice(0, this.data.history.length - HISTORY_LIMIT)
    }
  }

  private load(): Stored {
    const store = global.persistentStorageSystem.store
    try {
      if (!store.has(STORAGE_KEY)) return emptyStore()
      const parsed = JSON.parse(store.getString(STORAGE_KEY)) as Stored
      return parsed && parsed.version === 1 ? {...emptyStore(), ...parsed} : emptyStore()
    } catch (e) {
      print(`CalibrationStore: stored data unreadable, starting fresh — ${e}`)
      return emptyStore()
    }
  }
}
