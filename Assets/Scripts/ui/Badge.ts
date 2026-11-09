import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Colors, Textures, Weight, withAlpha} from "../Theme"
import {addImage, addRoundedRect, addText, place, resizeRoundedRect, textWidthPx} from "./Primitives"

export type BadgeTone = "Safety" | "Info" | "Success"

const TONES: Record<BadgeTone, {icon: Texture; color: vec4}> = {
  Safety: {icon: Textures.shield, color: Colors.amber},
  Info: {icon: Textures.info, color: Colors.cyan},
  Success: {icon: Textures.check, color: Colors.emerald},
}

// Figma 3:93 "Badge", px.
const HEIGHT = 53
const PAD_LEFT = 18
const PAD_RIGHT = 24
const ICON = 28
const GAP = 12
const TEXT_PX = 24
/** Tone wash over the control fill (accent at 16 %). */
const TONE_ALPHA = 0.16
/** One pulse (1a: "badge pulses amber once"): wash up to this alpha and back. */
const PULSE_ALPHA = 0.45
const PULSE_S = 1.2

/**
 * Badge — Figma "Badge" (3:93): pill with a tone icon and one line of text. Not interactive.
 *
 * Lifecycle: createComponent → set tone / text → initialize(); setText() / pulse() at runtime.
 */
@component
export class Badge extends BaseScriptComponent {
  tone: BadgeTone = "Safety"
  text = "Move only within a pain-free range"

  private fill: RoundedRectangle
  private wash: RoundedRectangle
  private icon: RenderMeshVisual
  private label: Text
  private width = 0
  private pulseT = -1
  private built = false

  get widthPx(): number {
    return this.width
  }

  get heightPx(): number {
    return HEIGHT
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const tone = TONES[this.tone]
    const root = this.sceneObject
    this.label = addText(root, "Text", this.text, {px: TEXT_PX, weight: Weight.SemiBold, color: Colors.textPrimary}, 3)
    this.fill = addRoundedRect(root, "Fill", 10, HEIGHT, {fill: Colors.controlFill}, 0)
    this.wash = addRoundedRect(root, "Tone", 10, HEIGHT, {fill: withAlpha(tone.color, TONE_ALPHA)}, 1)
    place(this.wash.sceneObject, 0, 0, 1)
    this.icon = addImage(root, "Icon", tone.icon, ICON, ICON, tone.color, 3)
    this.layout()
    this.createEvent("UpdateEvent").bind(() => this.animatePulse())
  }

  setText(text: string): void {
    this.text = text
    if (!this.built) return
    this.label.text = text
    this.layout()
  }

  /** Pulses the tone wash once. */
  pulse(): void {
    this.pulseT = 0
  }

  private layout(): void {
    this.width = PAD_LEFT + ICON + GAP + textWidthPx(this.label) + PAD_RIGHT
    resizeRoundedRect(this.fill, this.width, HEIGHT)
    resizeRoundedRect(this.wash, this.width, HEIGHT)
    const left = -this.width / 2
    place(this.icon.getSceneObject(), left + PAD_LEFT + ICON / 2, 0, 3)
    place(this.label.getSceneObject(), left + PAD_LEFT + ICON + GAP, 0, 3)
  }

  private animatePulse(): void {
    if (this.pulseT < 0) return
    this.pulseT += getDeltaTime()
    const t = Math.min(1, this.pulseT / PULSE_S)
    const alpha = TONE_ALPHA + (PULSE_ALPHA - TONE_ALPHA) * Math.sin(Math.PI * t)
    this.wash.backgroundColor = withAlpha(TONES[this.tone].color, alpha)
    if (t >= 1) this.pulseT = -1
  }
}
