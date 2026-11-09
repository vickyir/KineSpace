import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Config} from "../Config"
import {Colors, font, Weight} from "../Theme"
import {addRoundedRect, addText, place, resizeRoundedRect, textWidthPx} from "./Primitives"

/** Session phases in order (Figma phase strip copy). */
export const PHASES = ["Calibrate", "Warm-up", "Exercises", "Summary"]

// Figma 20:459 "Session phase strip", px.
const HEIGHT = 49
const PAD_X = 24
const GAP = 14
const TEXT_PX = 24
const DIVIDER_W = 1.5
const DIVIDER_H = 24

/** m:ss */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${m}:${rest < 10 ? "0" : ""}${rest}`
}

/**
 * PhaseStrip — "Calibrate › Warm-up › Exercises › Summary | 2:50 / 7:00" (20:459).
 * Done phases are secondary, the active phase is cyan semibold, upcoming phases are tertiary.
 *
 * Lifecycle: createComponent → set activeIndex / elapsedS → initialize(); then setActive() /
 * setElapsed() at runtime.
 */
@component
export class PhaseStrip extends BaseScriptComponent {
  activeIndex = 0
  elapsedS = 0
  targetMinutes = Config.SESSION_TARGET_MIN

  private background: RoundedRectangle
  private readonly phaseTexts: Text[] = []
  private readonly chevrons: Text[] = []
  private divider: RoundedRectangle
  private clock: Text
  private width = 0
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
    const root = this.sceneObject
    this.background = addRoundedRect(root, "Fill", 10, HEIGHT, {fill: Colors.controlFill}, 0)
    PHASES.forEach((phase, i) => {
      this.phaseTexts.push(addText(root, phase, phase, {px: TEXT_PX, weight: Weight.Medium, color: Colors.vibrantTertiary}, 2))
      if (i < PHASES.length - 1) {
        this.chevrons.push(addText(root, "Chevron", "›", {px: TEXT_PX, weight: Weight.Regular, color: Colors.vibrantTertiary}, 2))
      }
    })
    this.divider = addRoundedRect(root, "Divider", DIVIDER_W, DIVIDER_H, {fill: Colors.separator, radiusPx: 0}, 1)
    this.clock = addText(root, "Clock", "", {px: TEXT_PX, weight: Weight.Medium, color: Colors.vibrantSecondaryOnControl}, 2)
    this.refresh()
  }

  setActive(index: number): void {
    this.activeIndex = index
    this.refresh()
  }

  setElapsed(seconds: number): void {
    const before = formatClock(this.elapsedS)
    this.elapsedS = seconds
    if (this.built && formatClock(seconds) !== before) this.refresh()
  }

  private refresh(): void {
    if (!this.built) return
    this.phaseTexts.forEach((text, i) => {
      const active = i === this.activeIndex
      text.font = font(active ? Weight.SemiBold : Weight.Medium)
      text.textFill.color = active
        ? Colors.cyan
        : i < this.activeIndex
          ? Colors.vibrantSecondaryOnControl
          : Colors.vibrantTertiary
    })
    this.clock.text = `${formatClock(this.elapsedS)} / ${formatClock(this.targetMinutes * 60)}`

    const items: Text[] = []
    this.phaseTexts.forEach((text, i) => {
      items.push(text)
      if (i < this.chevrons.length) items.push(this.chevrons[i])
    })
    const widths = items.map((text) => textWidthPx(text))
    const clockWidth = textWidthPx(this.clock)
    const contentWidth = widths.reduce((a, b) => a + b, 0) + GAP * items.length + DIVIDER_W + GAP + clockWidth
    this.width = PAD_X * 2 + contentWidth
    resizeRoundedRect(this.background, this.width, HEIGHT)

    let x = -this.width / 2 + PAD_X
    items.forEach((text, i) => {
      place(text.getSceneObject(), x, 0, 2)
      x += widths[i] + GAP
    })
    place(this.divider.sceneObject, x + DIVIDER_W / 2, 0, 1)
    x += DIVIDER_W + GAP
    place(this.clock.getSceneObject(), x, 0, 2)
  }
}
