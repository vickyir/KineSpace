import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "./Config"
import {HeadMetrics} from "./HeadMetrics"

export type PacerAxis = "yaw" | "pitch"

/**
 * PacerController — the pacer dot of W, 4b and 4d. It glides one leg at a time (centre →
 * target, target → centre) along one head axis at ≤ PACER_DEG_S, world-locked relative to the
 * Neutral Forward Vector at WINDOW_Z_CM. While the head turns faster than TOO_FAST_DEG_S the dot
 * stops, onTooFast(true) fires (amber "Slower") and the current rep is marked as not counted.
 *
 * Lifecycle: createComponent → set axis / dot → startLeg(from, to) for every leg.
 */
@component
export class PacerController extends BaseScriptComponent {
  axis: PacerAxis = "yaw"
  /** Visual positioned by the pacer (optional; logic runs without it). */
  dot: SceneObject | null = null

  private readonly arrivedEvent = new Event<void>()
  readonly onArrived: PublicApi<void> = this.arrivedEvent.publicApi()
  private readonly tooFastEvent = new Event<boolean>()
  readonly onTooFast: PublicApi<boolean> = this.tooFastEvent.publicApi()

  private value = 0
  private goal = 0
  private running = false
  private paused = false
  private tooFastNow = false
  private repValid = true

  onAwake() {
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  get valueDeg(): number {
    return this.value
  }

  get isTooFast(): boolean {
    return this.tooFastNow
  }

  /** False once the head exceeded TOO_FAST_DEG_S since the rep started. */
  get repCounted(): boolean {
    return this.repValid
  }

  get arrived(): boolean {
    return !this.running
  }

  /** Sign of the dot's motion: +1 / −1 while a leg runs, 0 while it waits (4b gauge trail). */
  get direction(): number {
    return this.running && !this.paused && !this.tooFastNow ? Math.sign(this.goal - this.value) : 0
  }

  /** Starts a leg from `fromDeg` to `toDeg`. `newRep` clears the too-fast flag of the previous rep. */
  startLeg(fromDeg: number, toDeg: number, newRep = false): void {
    this.value = fromDeg
    this.goal = toDeg
    this.running = true
    if (newRep) this.repValid = true
    this.place()
  }

  /** Freezes the dot (pause, tracking lost); resume() continues the leg. */
  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  private update(): void {
    const head = HeadMetrics.instance
    if (!head || !this.running || this.paused) return
    const tooFast = head.speedDegS > Config.TOO_FAST_DEG_S
    if (tooFast !== this.tooFastNow) {
      this.tooFastNow = tooFast
      if (tooFast) this.repValid = false
      this.tooFastEvent.invoke(tooFast)
    }
    if (tooFast) return
    const step = Config.PACER_DEG_S * getDeltaTime()
    const remaining = this.goal - this.value
    if (Math.abs(remaining) <= step) {
      this.value = this.goal
      this.running = false
      this.place()
      this.arrivedEvent.invoke()
      return
    }
    this.value += Math.sign(remaining) * step
    this.place()
  }

  private place(): void {
    const head = HeadMetrics.instance
    if (!this.dot || !head) return
    const yaw = this.axis === "yaw" ? this.value : 0
    const pitch = this.axis === "pitch" ? this.value : 0
    const t = this.dot.getTransform()
    t.setWorldPosition(head.pointFromNeutral(yaw, pitch, Config.WINDOW_Z_CM))
    t.setWorldRotation(head.rotationFacingNeutral(yaw, pitch))
  }
}
