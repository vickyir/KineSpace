import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "./Config"
import {Colors, Textures, Weight, withAlpha} from "./Theme"
import {addImage, addRoundedRect, addText, Arc, place} from "./ui/Primitives"

export type HoldState = "Holding" | "Complete"

// Figma 3:122 "Radial Hold Timer", px (200 × 200).
const SIZE = 200
const STROKE = 10
const HALO_ALPHA = 0.1
/** Progress drop shadow (blur 10, emerald 70 %) drawn as two wider, fainter rings. */
const GLOW = [
  {grow: 5, alpha: 0.22},
  {grow: 10, alpha: 0.08},
]
const VALUE_PX = 52
const CAPTION_PX = 24
const CHECK = 64
// Readout rows relative to the ring centre (Figma column at top 50–51 px, gap 2 px), +y up.
const HOLDING_VALUE_Y = 18.5
const HOLDING_CAPTION_Y = -29.5
const COMPLETE_ICON_Y = 17
const COMPLETE_CAPTION_Y = -31.5

/**
 * HoldTimer — radial hold ring (3:122). Fills over `holdSeconds` while the user stays within
 * tolerance and drains at HOLD_DRAIN_MULT× when they leave it; at full it switches to
 * Complete ("HELD") and fires onComplete.
 *
 * Lifecycle: createComponent → set holdSeconds / showReadout → initialize(); then call
 * tick(dt, inTolerance) every frame from the owning screen.
 */
@component
export class HoldTimer extends BaseScriptComponent {
  holdSeconds = Config.HOLD_S
  /** Seconds and caption inside the ring. Off for hand-anchored timers (no near-field text). */
  showReadout = true

  private readonly completeEvent = new Event<void>()
  readonly onComplete: PublicApi<void> = this.completeEvent.publicApi()

  private progressValue = 0
  private stateValue: HoldState = "Holding"
  private progressArc: Arc
  private readonly glowArcs: Arc[] = []
  private valueText: Text
  private holdingCaption: Text
  private check: RenderMeshVisual
  private completeCaption: Text
  private built = false

  get progress(): number {
    return this.progressValue
  }

  get state(): HoldState {
    return this.stateValue
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const root = this.sceneObject
    const r = SIZE / 2
    addRoundedRect(root, "Halo", SIZE, SIZE, {fill: withAlpha(Colors.emerald, HALO_ALPHA)}, 0)
    const track = new Arc(root, "Track", r, r - STROKE, Colors.emerald20, 1)
    place(track.sceneObject, 0, 0, 1)
    for (const glow of GLOW) {
      const arc = new Arc(root, "Glow", r + glow.grow, r - STROKE - glow.grow, withAlpha(Colors.emerald, glow.alpha), 1)
      place(arc.sceneObject, 0, 0, 1)
      this.glowArcs.push(arc)
    }
    this.progressArc = new Arc(root, "Progress", r, r - STROKE, Colors.emerald, 2)
    place(this.progressArc.sceneObject, 0, 0, 2)

    if (this.showReadout) {
      this.valueText = addText(
        root,
        "Value",
        "",
        {px: VALUE_PX, weight: Weight.Bold, color: Colors.textPrimary, align: "center", trackingPx: -0.78},
        3
      )
      place(this.valueText.getSceneObject(), 0, HOLDING_VALUE_Y, 3)
      this.holdingCaption = addText(
        root,
        "Caption",
        "HOLD",
        {px: CAPTION_PX, weight: Weight.SemiBold, color: Colors.textSecondary, align: "center", trackingPx: 0.48},
        3
      )
      place(this.holdingCaption.getSceneObject(), 0, HOLDING_CAPTION_Y, 3)
      this.check = addImage(root, "Check", Textures.checkLarge, CHECK, CHECK, Colors.emerald, 3)
      place(this.check.getSceneObject(), 0, COMPLETE_ICON_Y, 3)
      this.completeCaption = addText(
        root,
        "CompleteCaption",
        "HELD",
        {px: CAPTION_PX, weight: Weight.SemiBold, color: Colors.textSecondary, align: "center", trackingPx: 0.48},
        3
      )
      place(this.completeCaption.getSceneObject(), 0, COMPLETE_CAPTION_Y, 3)
    }
    this.render()
  }

  /** Advance one frame: fill while within tolerance, drain at HOLD_DRAIN_MULT× otherwise. */
  tick(dt: number, inTolerance: boolean): void {
    if (this.stateValue === "Complete") return
    const rate = dt / this.holdSeconds
    const next = this.progressValue + (inTolerance ? rate : -rate * Config.HOLD_DRAIN_MULT)
    this.progressValue = Math.max(0, Math.min(1, next))
    if (this.progressValue >= 1) {
      this.stateValue = "Complete"
      this.render()
      this.completeEvent.invoke()
      return
    }
    this.render()
  }

  reset(): void {
    this.progressValue = 0
    this.stateValue = "Holding"
    this.render()
  }

  /** Shows a fixed state without timing (component gallery, previews). */
  show(state: HoldState, progress: number): void {
    this.stateValue = state
    this.progressValue = state === "Complete" ? 1 : Math.max(0, Math.min(1, progress))
    this.render()
  }

  private render(): void {
    if (!this.built) return
    this.progressArc.setFraction(this.progressValue)
    this.glowArcs.forEach((arc) => arc.setFraction(this.progressValue))
    if (!this.showReadout) return
    const complete = this.stateValue === "Complete"
    this.valueText.getSceneObject().enabled = !complete
    this.holdingCaption.getSceneObject().enabled = !complete
    this.check.getSceneObject().enabled = complete
    this.completeCaption.getSceneObject().enabled = complete
    if (!complete) {
      this.valueText.text = `${(this.progressValue * this.holdSeconds).toFixed(1)}s`
    }
  }
}
