import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Config} from "../Config"
import {Colors, Textures, Weight, white} from "../Theme"
import {IconButton} from "./IconButton"
import {addRoundedRect, addText, createChild, place, resizeRoundedRect, textWidthPx} from "./Primitives"

// Figma 20:439 "Top HUD Bar (lazy-follow)", px.
const HEIGHT = 83
const BORDER = 1.5
const PAD_LEFT = 28
const PAD_RIGHT = 12
const GAP = 20
const TITLE_PX = 28
const PROGRESS_PX = 26
const DIVIDER_W = 1.5
const DIVIDER_H = 32
const DOT = 12
const DOT_PITCH = 18
const DOT_RING = 1.5
const ICON_BUTTON = 56
/**
 * Pause ↔ Stop gap. Figma has 20 px; widened so their 2° colliders (ICON_BUTTON_COLLIDER_PX)
 * stay at least 1° (37 px) apart — see DEVIATIONS.md.
 */
const ICON_BUTTON_GAP = 61

/** "Set 1 of 2 · Rep 3 of 8" */
export function formatSetRep(set: number, sets: number, rep: number, reps: number): string {
  return `Set ${set} of ${sets} · Rep ${rep} of ${reps}`
}

/**
 * HudBar — exercise HUD (20:439): title, set / rep progress, rep dots, Pause and Stop.
 * Pause / Stop accept pinch, voice ("pause" / "stop") and head-aim dwell.
 *
 * Lifecycle: createComponent → set title / progress → initialize(); then setProgress().
 */
@component
export class HudBar extends BaseScriptComponent {
  title = ""
  set = 1
  rep = 1
  repsDone = 0
  /** Replaces the set / rep text (W "Open & close · 3 of 5", 4c "Set 1 done", 4g "Paused"). */
  status: string | null = null
  /** Status colour: cyan, or amber for 4g "Paused". */
  statusColor: vec4 = Colors.cyan
  /** Keep the rep dots beside the status (4c, 4g); W has no reps, so it hides them. */
  statusDots = false
  /**
   * Keep the bar as wide as it was before ("Paused" on an exercise, 4g, or the warm-up), so
   * Pause and Stop never slide under the aim or the hand that just pressed Pause (DEVIATIONS.md P30).
   */
  statusKeepsWidth = false

  pauseButton: IconButton
  stopButton: IconButton

  private background: RoundedRectangle
  private titleText: Text
  private divider: RoundedRectangle
  private progressText: Text
  private dotsRoot: SceneObject
  private readonly dots: RoundedRectangle[] = []
  private width = 0
  private progressSlotW = 0
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
    this.background = addRoundedRect(
      root,
      "Glass",
      10,
      HEIGHT,
      {fill: Colors.glassFill, borderPx: BORDER, borderColor: Colors.glassEdge},
      0
    )
    this.titleText = addText(root, "Title", this.title, {px: TITLE_PX, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.224}, 3)
    this.divider = addRoundedRect(root, "Divider", DIVIDER_W, DIVIDER_H, {fill: Colors.separator, radiusPx: 0}, 1)
    this.progressText = addText(root, "Progress", "", {px: PROGRESS_PX, weight: Weight.Medium, color: Colors.cyan}, 3)
    this.dotsRoot = createChild(root, "RepDots")
    for (let i = 0; i < Config.REPS_PER_SET; i++) {
      const dot = addRoundedRect(this.dotsRoot, `Dot${i}`, DOT, DOT, {fill: Colors.emerald, borderPx: DOT_RING, borderColor: white(0.4)}, 2)
      place(dot.sceneObject, -((Config.REPS_PER_SET - 1) * DOT_PITCH) / 2 + i * DOT_PITCH, 0)
      this.dots.push(dot)
    }
    this.pauseButton = this.createIconButton("Pause", Textures.pause, Colors.textPrimary, ["pause"])
    this.stopButton = this.createIconButton("Stop", Textures.close, Colors.coral, ["stop"])
    this.refresh()
  }

  setTitle(title: string): void {
    this.title = title
    this.refresh()
  }

  setStatus(status: string | null, color: vec4 = Colors.cyan, showDots = false, keepWidth = false): void {
    this.status = status
    this.statusColor = color
    this.statusDots = showDots
    this.statusKeepsWidth = keepWidth
    this.refresh()
  }

  setProgress(set: number, rep: number, repsDone: number): void {
    this.set = set
    this.rep = rep
    this.repsDone = repsDone
    this.refresh()
  }

  private createIconButton(name: string, icon: Texture, color: vec4, phrases: string[]): IconButton {
    const so = createChild(this.sceneObject, name)
    const button = so.createComponent(IconButton.getTypeName()) as IconButton
    button.icon = icon
    button.iconColor = color
    button.phrases = phrases
    button.initialize()
    return button
  }

  private refresh(): void {
    if (!this.built) return
    this.titleText.text = this.title
    this.progressText.text = this.status ?? formatSetRep(this.set, Config.SETS, this.rep, Config.REPS_PER_SET)
    this.progressText.textFill.color = this.status === null ? Colors.cyan : this.statusColor
    const showDots = this.status === null || this.statusDots
    this.dotsRoot.enabled = showDots
    this.dots.forEach((dot, i) => {
      const done = i < this.repsDone
      dot.backgroundColor = done ? Colors.emerald : white(0)
      dot.borderColor = done ? Colors.emerald : white(0.4)
    })

    const titleW = textWidthPx(this.titleText)
    let progressW = textWidthPx(this.progressText)
    if (!this.statusKeepsWidth) this.progressSlotW = progressW
    else progressW = Math.max(progressW, this.progressSlotW)
    const dotsW = showDots ? (Config.REPS_PER_SET - 1) * DOT_PITCH + DOT : -GAP
    this.width =
      PAD_LEFT + titleW + GAP + DIVIDER_W + GAP + progressW + GAP + dotsW + GAP + ICON_BUTTON + ICON_BUTTON_GAP + ICON_BUTTON + PAD_RIGHT
    resizeRoundedRect(this.background, this.width, HEIGHT)

    let x = -this.width / 2 + PAD_LEFT
    place(this.titleText.getSceneObject(), x, 0, 3)
    x += titleW + GAP
    place(this.divider.sceneObject, x + DIVIDER_W / 2, 0, 1)
    x += DIVIDER_W + GAP
    place(this.progressText.getSceneObject(), x, 0, 3)
    x += progressW + GAP
    place(this.dotsRoot, x + dotsW / 2, 0, 2)
    x += dotsW + GAP
    place(this.pauseButton.sceneObject, x + ICON_BUTTON / 2, 0, 1)
    x += ICON_BUTTON + ICON_BUTTON_GAP
    place(this.stopButton.sceneObject, x + ICON_BUTTON / 2, 0, 1)
  }
}
