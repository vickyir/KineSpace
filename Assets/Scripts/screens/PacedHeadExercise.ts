import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {HoldTimer} from "../HoldTimer"
import {PacerAxis, PacerController} from "../PacerController"
import {createChild} from "../ui/Primitives"
import {ScreenBase} from "./ScreenBase"

export type PacedPhase = "out" | "hold" | "back" | "settle"

/** One side of a rep: direction (− = left / down) and today's target in degrees. */
export type PacedSide = {sign: 1 | -1; targetDeg: number}

/**
 * PacedHeadExercise — the shared flow of 4b (yaw) and 4d (pitch). A rep visits both sides:
 *   out     the pacer glides centre → target at ≤ PACER_DEG_S and the user follows it
 *   hold    within ±HEAD_TARGET_TOL_DEG of the target the hold ring fills over HOLD_S → chime
 *   back    the pacer leads back to centre
 *   settle  waits until the head is within RETURN_CENTRE_DEG of centre
 * Targets are today's calibrated range × pace, never a fixed angle. Turning faster than
 * TOO_FAST_DEG_S stops the pacer (amber "Slower, please") and the rep is not counted: it
 * starts again (brief §5).
 */
export abstract class PacedHeadExercise extends ScreenBase {
  protected abstract readonly axis: PacerAxis

  protected pacer: PacerController
  protected timer: HoldTimer
  protected sides: PacedSide[] = []
  protected sideIndex = 0
  protected phase: PacedPhase = "out"
  protected tooFast = false

  /** Builds the screen; must call createTimer() once. */
  protected abstract buildScreen(): void
  /** Today's targets, in the order a rep visits them. */
  protected abstract computeSides(): PacedSide[]
  /** Head angle on the exercise axis (+ = right / up). */
  protected abstract metric(): number
  /** A side starts: place its target, band, labels. */
  protected abstract onSideStart(): void
  /** Per-frame visuals (readouts, gauge, chips). */
  protected abstract render(): void

  /** The hold on a side completed (4b speaks the return cue). */
  protected onHeld(): void {}

  protected build(): void {
    const logic = createChild(this.root, "PacerController")
    this.pacer = logic.createComponent(PacerController.getTypeName()) as PacerController
    this.pacer.axis = this.axis
    this.pacer.onArrived.add(() => this.onArrived())
    this.pacer.onTooFast.add((fast) => (this.tooFast = fast))
    this.buildScreen()
  }

  protected createTimer(parent: SceneObject, showReadout: boolean): HoldTimer {
    const so = createChild(parent, "HoldTimer")
    this.timer = so.createComponent(HoldTimer.getTypeName()) as HoldTimer
    this.timer.holdSeconds = Config.HOLD_S
    this.timer.showReadout = showReadout
    this.timer.initialize()
    this.timer.onComplete.add(() => this.held())
    return this.timer
  }

  protected get side(): PacedSide {
    return this.sides[this.sideIndex]
  }

  protected get signedTarget(): number {
    return this.side.sign * this.side.targetDeg
  }

  protected get onTarget(): boolean {
    return Math.abs(this.metric() - this.signedTarget) <= Config.HEAD_TARGET_TOL_DEG
  }

  protected onShow(): void {
    this.sides = this.computeSides()
    this.tooFast = false
    this.pacer.resume()
    this.startRep()
  }

  protected onHide(): void {
    this.pacer.pause()
    AudioCues.instance.approach(0)
  }

  setFrozen(frozen: boolean): void {
    super.setFrozen(frozen)
    if (frozen) this.pacer.pause()
    else this.pacer.resume()
  }

  protected tick(dt: number): void {
    if (this.phase === "hold") {
      this.timer.tick(dt, this.onTarget) // may complete the hold → back
      if (this.phase === "hold") AudioCues.instance.approach(this.timer.progress)
    } else if (this.phase === "settle" && Math.abs(this.metric()) < Config.RETURN_CENTRE_DEG) {
      this.nextSide()
    }
    if (this.root.enabled) this.render()
  }

  private startRep(): void {
    this.sideIndex = 0
    this.startSide(true)
  }

  private startSide(newRep: boolean): void {
    this.phase = "out"
    this.timer.reset()
    this.onSideStart()
    this.pacer.startLeg(0, this.signedTarget, newRep)
  }

  private onArrived(): void {
    if (!this.root.enabled) return
    if (this.phase === "out") this.phase = "hold"
    else if (this.phase === "back") this.phase = "settle"
  }

  private held(): void {
    AudioCues.instance.approach(0)
    AudioCues.instance.play("reached")
    this.phase = "back"
    this.onHeld()
    this.pacer.startLeg(this.signedTarget, 0)
  }

  private nextSide(): void {
    if (this.sideIndex + 1 < this.sides.length) {
      this.sideIndex++
      this.startSide(false)
      return
    }
    const counted = this.pacer.repCounted
    this.startRep()
    // Last: finishing the set moves the session on (and hides this screen).
    if (counted) this.sm.completeRep(true)
  }
}
