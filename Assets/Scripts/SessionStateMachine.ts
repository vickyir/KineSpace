import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {AudioCues} from "./AudioCues"
import {BatteryGuard} from "./BatteryGuard"
import {CalibrationStore, Comfort, emptyRom, Module, Pace, SessionEnd, SessionRecord} from "./CalibrationStore"
import {Config} from "./Config"
import {HandMetrics} from "./HandMetrics"
import {HeadMetrics} from "./HeadMetrics"
import {
  EXERCISE_TITLES,
  ExerciseId,
  HAND_EXERCISES,
  HAND_TRACKED,
  HUD_SCREENS,
  MODULE_EXERCISES,
  PHASE_INDEX,
  ScreenController,
  ScreenId,
  SessionContext,
  TUTORIAL_FOR,
} from "./screens/ScreenTypes"
import {Colors} from "./Theme"
import {HudBar} from "./ui/HudBar"
import {LazyFollow} from "./ui/LazyFollow"
import {PhaseStrip} from "./ui/PhaseStrip"
import {canvasPosition, createChild} from "./ui/Primitives"
import {GlobalCommand, VoiceCommands} from "./VoiceCommands"

export type FlowState = ScreenId | "launch" | "end"

const DAY_MS = 24 * 60 * 60 * 1000

// Canvas positions of the shared HUD (Figma 4a–4g, 6a), px.
const HUD_BAR_Y = 97.5
const PHASE_STRIP_Y = 177.5
const PHASE_STRIP_SUMMARY_Y = 80.5

/**
 * SessionStateMachine — the session flow (brief §5, Figma 20:775):
 *
 *   LAUNCH ─ first run ─▶ 1a ▶ 1b ▶ 1c ▶ 1d ─┐
 *          └ otherwise ─▶ 1b ▶ 1c ▶ 1d (daily) ┤
 *   2 HUB ▶ W ▶ [3 if the exercise's tutorial is unseen] ▶ EXERCISE: REPS_PER_SET × SETS,
 *   4c REST between sets ▶ next exercise … ▶ 6a SUMMARY ▶ END
 *
 * Interrupts: tracking lost (3, 4a, 4f; or no hand seen on 4a / 4f) ▶ 4g covers the frozen step,
 * auto-resume · too fast (handled by the exercise, rep not counted) · pain (6a or HUD Stop) ▶ 6b ·
 * low battery ▶ finish set ▶ 6a · session cap ▶ 6a. Owns screen visibility, the session clock,
 * the HUD bar and the phase strip.
 */
@component
export class SessionStateMachine extends BaseScriptComponent {
  static instance: SessionStateMachine

  @input
  @hint("Start the session flow automatically when the Lens starts.")
  autoStart: boolean = true

  @input
  @hint("Dev only: open this screen ID at launch (e.g. 1c) to review it. Leave empty for the normal flow.")
  devStartAt: string = ""

  hud: HudBar
  phaseStrip: PhaseStrip

  private readonly stateEvent = new Event<FlowState>()
  readonly onStateChanged: PublicApi<FlowState> = this.stateEvent.publicApi()

  private readonly screens = new Map<ScreenId, ScreenController>()
  private stateValue: FlowState = "launch"
  private visible: ScreenController | null = null
  private hudRoot: SceneObject
  private sessionStartMs = 0
  private elapsed = 0
  private running = false
  private pausedByUser = false
  private trackingLostOverlay = false
  private endAfterSet = false
  private plan: ExerciseId[] = []
  private exerciseIndex = 0
  private end: SessionEnd = "complete"
  private comfort: Comfort | null = null
  private painFlag = false
  private warmupStatus = ""
  private readonly ctx: SessionContext = {
    firstRun: true,
    dailyCalibration: false,
    module: null,
    pace: "gentle",
    targetFactor: Config.TARGET_GENTLE,
    exercise: null,
    set: 1,
    rep: 1,
    repsDoneInSet: 0,
    totalReps: 0,
    smoothReps: 0,
    elapsedS: 0,
    completedSet: 0,
  }

  onAwake() {
    SessionStateMachine.instance = this
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.update())
    this.createEvent("OnPauseEvent").bind(() => this.autosave())
    this.createEvent("TurnOffEvent").bind(() => this.autosave())
  }

  // ─── Read-only state ───────────────────────────────────────────────────

  get state(): FlowState {
    return this.stateValue
  }

  get context(): Readonly<SessionContext> {
    return this.ctx
  }

  get isPaused(): boolean {
    return this.pausedByUser
  }

  get isTrackingLost(): boolean {
    return this.trackingLostOverlay
  }

  get elapsedS(): number {
    return this.elapsed
  }

  /** Exercises reached this session (6a "2 exercises"). */
  get exercisesRun(): number {
    return this.ctx.totalReps > 0 ? Math.min(this.plan.length, this.exerciseIndex + 1) : 0
  }

  /** The 6a comfort answer so far (null = not answered). */
  get comfortChoice(): Comfort | null {
    return this.comfort
  }

  /** How the session ended (6a: complete, 10-min cap or low battery; 6b: pain). */
  get ending(): SessionEnd {
    return this.end
  }

  /** W spec: the warm-up becomes skippable once the first session is WARMUP_SKIP_AFTER_DAYS old. */
  get canSkipWarmup(): boolean {
    const first = CalibrationStore.instance.firstSession()
    return first !== null && Date.now() - first.startedAt >= Config.WARMUP_SKIP_AFTER_DAYS * DAY_MS
  }

  /** IDs of registered screens (debug overlay). */
  get registeredScreens(): ScreenId[] {
    return Array.from(this.screens.keys())
  }

  registerScreen(screen: ScreenController): void {
    this.screens.set(screen.screenId, screen)
    screen.hide()
  }

  // ─── Flow API (called by screens) ──────────────────────────────────────

  /** Starts (or restarts) a session from LAUNCH. */
  start(): void {
    const store = CalibrationStore.instance
    this.sessionStartMs = Date.now()
    this.elapsed = 0
    this.running = true
    this.pausedByUser = false
    this.trackingLostOverlay = false
    this.endAfterSet = false
    this.end = "complete"
    this.comfort = null
    this.painFlag = false
    this.plan = []
    this.exerciseIndex = 0
    this.ctx.firstRun = !store.firstRunDone
    this.ctx.dailyCalibration = store.firstRunDone
    this.ctx.module = null
    this.ctx.pace = store.defaultPace()
    this.ctx.targetFactor = store.targetFactor(this.ctx.pace)
    this.ctx.totalReps = 0
    this.ctx.smoothReps = 0
    this.resetExercise(null)
    this.go(this.ctx.firstRun ? "1a" : "1b")
  }

  /** The visible step is done; move to the next one. */
  next(): void {
    switch (this.stateValue) {
      case "1a":
        return this.go("1b")
      case "1b":
        return this.go("1c")
      case "1c":
        return this.go("1d")
      case "1d":
        if (!CalibrationStore.instance.firstRunDone) CalibrationStore.instance.markFirstRunDone()
        return this.go("2")
      case "2":
        return this.chooseModule(this.ctx.module ?? "hand", this.ctx.pace)
      case "W":
        return this.startExercise(0)
      case "3":
        if (this.ctx.exercise) CalibrationStore.instance.markTutorialSeen(this.ctx.exercise)
        return this.go(this.ctx.exercise ?? "6a")
      case "4c":
        return this.startNextSet()
      case "4g":
        return
      case "6a":
      case "6b":
        return this.finish()
      default:
        return
    }
  }

  /** Hub (2): module and pace chosen → warm-up. */
  chooseModule(module: Module, pace: Pace): void {
    this.ctx.module = module
    this.ctx.pace = pace
    this.ctx.targetFactor = CalibrationStore.instance.targetFactor(pace)
    this.plan = MODULE_EXERCISES[module].slice()
    this.go("W")
  }

  /** Exercise screens: one rep done. `smooth` = within the speed limit the whole rep. */
  completeRep(smooth: boolean): void {
    if (!this.isExercise(this.stateValue) || this.pausedByUser || this.trackingLostOverlay) return
    this.ctx.totalReps++
    if (smooth) this.ctx.smoothReps++
    this.ctx.repsDoneInSet++
    if (this.ctx.repsDoneInSet >= Config.REPS_PER_SET) {
      this.finishSet()
    } else {
      this.ctx.rep = this.ctx.repsDoneInSet + 1
      this.refreshHud()
    }
  }

  /** "Skip rest", "Skip tutorial", voice "skip" (the warm-up only after its first week). */
  skip(): void {
    if (this.stateValue === "W" && !this.canSkipWarmup) return
    if (this.stateValue === "4c" || this.stateValue === "3" || this.stateValue === "W") this.next()
  }

  /** W: the HUD progress text ("Open & close · 3 of 5"). The warm-up has no sets or rep dots. */
  setWarmupStatus(status: string): void {
    this.warmupStatus = status
    this.refreshHud()
  }

  /** HUD Stop, voice "stop" or "Pain" on 6a → safety stop (6b). */
  reportPain(): void {
    if (this.stateValue === "6b" || this.stateValue === "end") return
    this.painFlag = true
    this.end = "pain"
    this.comfort = "pain"
    this.go("6b")
  }

  /** 6a comfort check. "Pain" goes straight to the safety stop. */
  setComfort(comfort: Comfort): void {
    this.comfort = comfort
    if (comfort === "pain") this.reportPain()
  }

  /** 4g "End exercise": leave the current exercise without penalty. */
  endExercise(): void {
    this.clearTrackingLost(false)
    this.nextExercise()
  }

  /** HUD Pause / voice "pause": freezes timers, holds and reps (toggle). */
  togglePause(): void {
    if (!this.isExercise(this.stateValue) && this.stateValue !== "W") return
    this.pausedByUser = !this.pausedByUser
    this.visible?.setFrozen(this.pausedByUser || this.trackingLostOverlay)
    this.refreshHud()
  }

  /** 6a "Done" / 6b "Okay": records the session and ends. */
  finish(): void {
    if (!this.running) return
    this.running = false
    CalibrationStore.instance.recordSession(this.record())
    AudioCues.instance?.play("saved")
    this.go("end")
  }

  /** Dev / self-test only: moves the session clock forward (10-min cap). */
  devAdvanceClock(seconds: number): void {
    this.sessionStartMs -= seconds * 1000
  }

  /** 6b "View progress". */
  showSummary(): void {
    this.go("6a")
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private onStart(): void {
    this.createHud()
    HandMetrics.instance.onTrackingLost.add(() => this.onTrackingLost())
    HandMetrics.instance.onTrackingResumed.add(() => this.clearTrackingLost(true))
    VoiceCommands.instance.onCommand.add((command) => this.onCommand(command))
    BatteryGuard.instance.onLow.add(() => this.onLowBattery())
    this.hud.pauseButton.onPressed.add(() => this.togglePause())
    this.hud.stopButton.onPressed.add(() => this.reportPain())
    if (this.autoStart) this.start()
    if (this.devStartAt) this.devStart(this.devStartAt as ScreenId)
  }

  /** Dev: opens `screen` with the module / exercise context it would have in the real flow. */
  private devStart(screen: ScreenId): void {
    if (!HeadMetrics.instance.hasNeutral) HeadMetrics.instance.captureNeutral()
    if (screen === "W") return this.chooseModule("hand", this.ctx.pace)
    if (screen === "4g") {
      this.devStart("4a")
      this.onTrackingLost()
      return
    }
    if (screen === "4c") {
      this.devStart("4a")
      this.ctx.repsDoneInSet = Config.REPS_PER_SET
      this.ctx.completedSet = 1
      this.go("4c")
      return
    }
    if (screen === "6a") {
      // A finished hand session at the target length (Figma 6a: 7 min · 2 exercises · 32 reps).
      this.devStart("4f")
      this.ctx.totalReps = MODULE_EXERCISES.hand.length * Config.SETS * Config.REPS_PER_SET
      this.ctx.smoothReps = this.ctx.totalReps - 1
      this.exerciseIndex = this.plan.length
      this.devAdvanceClock(Config.SESSION_TARGET_MIN * 60)
      this.go("6a")
      return
    }
    if (screen === "6b") {
      this.devStart("4a")
      this.reportPain()
      return
    }
    const exercise: ExerciseId | null = screen === "3" ? "4a" : this.isExercise(screen) ? screen : null
    if (exercise) {
      const module: Module = MODULE_EXERCISES.head.includes(exercise) ? "head" : "hand"
      this.ctx.module = module
      this.plan = MODULE_EXERCISES[module].slice()
      this.exerciseIndex = this.plan.indexOf(exercise)
      this.resetExercise(exercise)
    }
    this.go(screen)
  }

  private update(): void {
    if (!this.running) return
    this.updateClock()
    this.phaseStrip.setElapsed(this.elapsed)
    if (this.elapsed >= Config.SESSION_CAP_MIN * 60 && !this.isEnding()) {
      this.end = "cap"
      this.go("6a")
      return
    }
    // A hand exercise that starts (or continues) with no hand in view also shows 4g.
    const hand = HandMetrics.instance
    if (
      !this.trackingLostOverlay &&
      HAND_EXERCISES.includes(this.stateValue as ScreenId) &&
      !hand.trackingGood &&
      hand.lowConfidenceS >= Config.TRACK_LOST_S
    ) {
      this.onTrackingLost()
    }
  }

  private updateClock(): void {
    this.elapsed = (Date.now() - this.sessionStartMs) / 1000
    this.ctx.elapsedS = this.elapsed
  }

  private go(state: FlowState): void {
    const previous = this.stateValue
    if (previous === "4c") AudioCues.instance?.stopRestPad()
    if (this.trackingLostOverlay) {
      this.trackingLostOverlay = false
      this.screens.get("4g")?.hide()
    }
    this.visible?.hide()
    this.visible = null
    this.stateValue = state
    this.pausedByUser = false
    if (this.running) this.updateClock()
    if (state !== "end" && state !== "launch") {
      const screen = this.screens.get(state)
      if (screen) {
        this.visible = screen
        screen.show(this.ctx)
      } else {
        print(`SessionStateMachine: screen ${state} is not built yet`)
      }
    }
    this.refreshHud()
    this.autosave()
    this.stateEvent.invoke(state)
  }

  private startExercise(index: number): void {
    this.exerciseIndex = index
    if (index >= this.plan.length) {
      this.go("6a")
      return
    }
    const exercise = this.plan[index]
    this.resetExercise(exercise)
    const tutorial = TUTORIAL_FOR[exercise]
    this.go(tutorial && !CalibrationStore.instance.isTutorialSeen(exercise) ? tutorial : exercise)
  }

  private nextExercise(): void {
    if (this.endAfterSet) {
      this.end = "battery"
      this.go("6a")
      return
    }
    this.startExercise(this.exerciseIndex + 1)
  }

  private finishSet(): void {
    AudioCues.instance?.play("reached")
    this.ctx.completedSet = this.ctx.set
    if (this.endAfterSet) {
      this.end = "battery"
      this.go("6a")
    } else if (this.ctx.set < Config.SETS) {
      this.go("4c")
    } else {
      this.nextExercise()
    }
  }

  private startNextSet(): void {
    this.ctx.set++
    this.ctx.rep = 1
    this.ctx.repsDoneInSet = 0
    this.go(this.ctx.exercise ?? "6a")
  }

  private resetExercise(exercise: ExerciseId | null): void {
    this.ctx.exercise = exercise
    this.ctx.set = 1
    this.ctx.rep = 1
    this.ctx.repsDoneInSet = 0
    this.ctx.completedSet = 0
  }

  private onTrackingLost(): void {
    if (!HAND_TRACKED.includes(this.stateValue as ScreenId) || this.trackingLostOverlay) return
    this.trackingLostOverlay = true
    this.visible?.setFrozen(true)
    this.visible?.setCovered?.(true)
    this.screens.get("4g")?.show(this.ctx)
    this.refreshHud()
  }

  /** `resumed`: the hand came back (voice "Hand back in view"), not "End exercise". */
  private clearTrackingLost(resumed: boolean): void {
    if (!this.trackingLostOverlay) return
    this.trackingLostOverlay = false
    this.screens.get("4g")?.hide()
    this.visible?.setCovered?.(false)
    this.visible?.setFrozen(this.pausedByUser)
    if (resumed) AudioCues.instance?.speak("handBackInView")
    this.refreshHud()
  }

  private onLowBattery(): void {
    if (this.isEnding()) return
    if (this.isExercise(this.stateValue)) {
      this.endAfterSet = true
    } else {
      this.end = "battery"
      this.go("6a")
    }
  }

  private onCommand(command: GlobalCommand): void {
    if (this.visible?.handleCommand?.(command)) return
    switch (command) {
      case "pause":
        return this.togglePause()
      case "stop":
        return this.reportPain()
      case "next":
        if (this.stateValue === "4c" || this.stateValue === "3") this.next()
        return
      case "skip":
        return this.skip()
    }
  }

  private isExercise(state: FlowState): state is ExerciseId {
    return state === "4a" || state === "4b" || state === "4d" || state === "4e" || state === "4f"
  }

  private isEnding(): boolean {
    return this.stateValue === "6a" || this.stateValue === "6b" || this.stateValue === "end"
  }

  private createHud(): void {
    this.hudRoot = createChild(this.sceneObject, "Hud")
    this.hudRoot.createComponent(LazyFollow.getTypeName())
    const strip = createChild(this.hudRoot, "PhaseStrip")
    this.phaseStrip = strip.createComponent(PhaseStrip.getTypeName()) as PhaseStrip
    this.phaseStrip.initialize()
    const bar = createChild(this.hudRoot, "HudBar")
    this.hud = bar.createComponent(HudBar.getTypeName()) as HudBar
    this.hud.initialize()
    bar.getTransform().setLocalPosition(canvasPosition(500, HUD_BAR_Y))
  }

  private refreshHud(): void {
    if (!this.hud) return
    const screen = this.stateValue as ScreenId
    const phase = this.stateValue === "end" ? -1 : PHASE_INDEX[screen] ?? -1
    this.phaseStrip.getSceneObject().enabled = phase >= 0
    if (phase >= 0) {
      this.phaseStrip.setActive(phase)
      this.phaseStrip
        .getSceneObject()
        .getTransform()
        .setLocalPosition(canvasPosition(500, screen === "6a" ? PHASE_STRIP_SUMMARY_Y : PHASE_STRIP_Y))
    }
    const showHud = HUD_SCREENS.includes(screen) || this.trackingLostOverlay
    this.hud.getSceneObject().enabled = showHud
    if (showHud) {
      if (this.stateValue === "W") this.hud.setTitle("Warm-up")
      else if (this.stateValue === "4c") this.hud.setTitle("Rest")
      else if (this.ctx.exercise) this.hud.setTitle(EXERCISE_TITLES[this.ctx.exercise])
      this.hud.setProgress(this.ctx.set, this.ctx.rep, this.ctx.repsDoneInSet)
    }
    // Pause has no frame of its own; it reuses 4g's amber "Paused" label (approved at Phase 2).
    const exercise = this.isExercise(this.stateValue)
    if (this.pausedByUser || this.trackingLostOverlay) this.hud.setStatus("Paused", Colors.amber, exercise, true)
    else if (this.stateValue === "W") this.hud.setStatus(this.warmupStatus)
    else if (this.stateValue === "4c") this.hud.setStatus(`Set ${this.ctx.completedSet} done`, Colors.cyan, true)
    else this.hud.setStatus(null)
  }

  private record(): SessionRecord {
    return {
      startedAt: this.sessionStartMs,
      durationS: Math.round(this.elapsed),
      module: this.ctx.module,
      pace: this.ctx.pace,
      exercises: this.plan.slice(0, this.exerciseIndex + 1),
      reps: this.ctx.totalReps,
      smoothReps: this.ctx.smoothReps,
      rom: CalibrationStore.instance?.rom ?? emptyRom(),
      comfort: this.comfort,
      end: this.end,
      painFlag: this.painFlag,
    }
  }

  /** Keeps a snapshot of a session with progress, so pause / exit / overheating never loses it. */
  private autosave(): void {
    if (this.running && this.ctx.totalReps > 0 && CalibrationStore.instance) {
      CalibrationStore.instance.saveInProgress({...this.record(), end: "stopped"})
    }
  }
}
