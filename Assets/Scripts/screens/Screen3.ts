import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {FINGERS, HandMetrics} from "../HandMetrics"
import {Colors, Silhouettes, Textures, Weight, white} from "../Theme"
import {Badge} from "../ui/Badge"
import {PhysioButton} from "../ui/PhysioButton"
import {addImage, addRoundedRect, addText, canvasPosition, createChild, place, textWidthPx} from "../ui/Primitives"
import {addIconText, glassStyle, layoutRow, pillAround, RowItem, textItem} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:435, px.
const LINE = 1.211
const MICRO_HUD = {top: 56, padTop: 20, padBottom: 22, padX: 36, gap: 12, rowGap: 40, radius: 36}
/** Ghost 15:304 (384 × 496 at 308, 236) = Hand / OK 14:481 × 1.6; positions relative to its centre (500, 484). */
const GHOST_CENTRE = {x: 500, y: 484}
const GHOST = {x: -13.34, y: -14.88, w: 247.18, h: 434.24}
/** Numbered targets 5:538–5:545 (44 px), centres relative to the ghost centre; 1 = index … 4 = pinky. */
const TARGETS = [
  {x: -154, y: 76.8},
  {x: -1.6, y: 233.2},
  {x: 54.4, y: 207.6},
  {x: 115.2, y: 147.2},
]
const TARGET_PX = 44
/** The ghost highlights the next finger this often (illustration only — no per-finger frames exist). */
const GUIDE_STEP_S = 1.5
const LOOP_CHIP_Y = 774.5
const SANDBOX = {top: 832, padLeft: 36, padRight: 28, padY: 22, gap: 32, colGap: 8, radius: 36}
const DOT = 20
const DOT_GAP = 10
const START_Y = 1071
const SKIP_Y = 1191

/**
 * 3 · Tutorial — Phantom Guide (5:435), shown before 4a until it has been seen once. The ghost
 * (Hand / OK at 1:1 hand scale, GHOST_DIST_CM) loops the order index → pinky; the user mirrors
 * it once: each thumb-to-fingertip touch held OPPOSITION_HOLD_S counts. 4 / 4 touches unlock
 * "Start exercise"; "Skip tutorial" is always available. A head-height change beyond
 * SHOULDER_DROP_CM (torso tilt / shoulder hike) plays a gentle tone. Buttons stay on the 110 cm
 * plane (no near-field text; DEVIATIONS.md F5).
 */
@component
export class Screen3 extends ScreenBase {
  readonly screenId: ScreenId = "3"

  private readonly targets: {fill: RoundedRectangle; label: Text}[] = []
  private readonly dots: RoundedRectangle[] = []
  private touchesText: Text
  private badgeSo: SceneObject
  private touches = 0
  private hold = 0
  private guideStep = 0
  private guideT = 0
  private postureCooldown = 0

  protected build(): void {
    const f = this.followRoot()
    const at = (so: SceneObject, x: number, y: number) => so.getTransform().setLocalPosition(canvasPosition(x, y))

    this.buildMicroHud(f)

    // Ghost guide + numbered targets.
    const ghost = this.ghostRoot(f, GHOST_CENTRE.x, GHOST_CENTRE.y)
    const hand = addImage(ghost, "GhostGuide", Silhouettes.handOk, GHOST.w, GHOST.h, Colors.cyan, 0)
    place(hand.getSceneObject(), GHOST.x, GHOST.y, 0)
    TARGETS.forEach((p, i) => {
      const so = createChild(ghost, `Target${i + 1}`)
      place(so, p.x, p.y, 1)
      const fill = addRoundedRect(so, "Fill", TARGET_PX, TARGET_PX, {fill: white(0.18)}, 2)
      const label = addText(so, "Number", `${i + 1}`, {px: 24, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center", trackingPx: 0.72}, 3)
      place(label.getSceneObject(), 0, 0, 1)
      this.targets.push({fill, label})
    })

    // Loop chip 5:546.
    const chip = createChild(f, "LoopChip")
    pillAround(
      chip,
      [addIconText(chip, "Loop", Textures.repeat, 26, Colors.cyan, "Index → pinky, then repeat", {px: 24, weight: Weight.SemiBold, color: Colors.textPrimary}, 10)],
      0,
      18,
      22,
      12 * 2 + 24 * LINE,
      glassStyle()
    )
    at(chip, 500, LOOP_CHIP_Y)

    this.buildSandbox(f)

    const start = this.addButton(f, "Start exercise", "Primary", START_Y)
    start.onPressed.add(() => {
      if (this.touches >= Config.TUTORIAL_TOUCHES) {
        this.sm.next()
      } else {
        AudioCues.instance.play("driftReset")
      }
    })
    const skip = this.addButton(f, "Skip tutorial", "Secondary", SKIP_Y)
    skip.onPressed.add(() => this.sm.skip())
  }

  protected onShow(): void {
    this.touches = 0
    this.hold = 0
    this.guideStep = 0
    this.guideT = 0
    this.postureCooldown = 0
    this.renderTargets()
    this.renderTouches()
  }

  protected tick(dt: number): void {
    const hand = HandMetrics.instance
    this.badgeSo.enabled = hand.trackingGood

    this.guideT += dt
    if (this.guideT >= GUIDE_STEP_S) {
      this.guideT = 0
      this.guideStep = (this.guideStep + 1) % TARGETS.length
      this.renderTargets()
    }

    if (this.touches < Config.TUTORIAL_TOUCHES && hand.trackingGood) {
      const finger = FINGERS[this.touches % FINGERS.length]
      const contact = hand.thumbToTipCm[finger] < Config.OPPOSITION_CONTACT_CM
      const rate = dt / Config.OPPOSITION_HOLD_S
      this.hold = Math.max(0, Math.min(1, this.hold + (contact ? rate : -rate * Config.HOLD_DRAIN_MULT)))
      if (this.hold >= 1) {
        this.hold = 0
        this.touches++
        AudioCues.instance.play("reached")
        this.renderTouches()
      }
    }

    this.postureCooldown = Math.max(0, this.postureCooldown - dt)
    if (this.head.hasNeutral && Math.abs(this.head.heightDropCm) > Config.SHOULDER_DROP_CM && this.postureCooldown === 0) {
      AudioCues.instance.play("driftReset")
      this.postureCooldown = Config.POSTURE_CUE_COOLDOWN_S
    }
  }

  /** Micro-instruction HUD 5:436: glass, radius 36, two lines, centred. */
  private buildMicroHud(f: SceneObject): void {
    const hud = createChild(f, "MicroHud")
    const heading = addText(hud, "Heading", "Finger opposition · watch once", {px: 24, weight: Weight.SemiBold, color: Colors.cyan, align: "center"}, 3)
    const itemStyle = {px: 28, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.224}
    const row = createChild(hud, "Row")
    const items = [
      addIconText(row, "Posture", Textures.user, 30, Colors.cyan, "Palm facing you, hand low", itemStyle, 12),
      addIconText(row, "Hold", Textures.timer, 30, Colors.cyan, `Hold each touch for ${Config.OPPOSITION_HOLD_S} s`, itemStyle, 12),
    ]
    const rowW = layoutRow(items, MICRO_HUD.rowGap, 1)
    const headingH = 24 * LINE
    const rowH = 28 * LINE
    const w = Math.max(rowW, textWidthPx(heading)) + MICRO_HUD.padX * 2
    const h = MICRO_HUD.padTop + headingH + MICRO_HUD.gap + rowH + MICRO_HUD.padBottom
    addRoundedRect(hud, "Glass", w, h, glassStyle(MICRO_HUD.radius), 0)
    const top = h / 2
    place(heading.getSceneObject(), 0, top - MICRO_HUD.padTop - headingH / 2, 1)
    place(row, 0, top - MICRO_HUD.padTop - headingH - MICRO_HUD.gap - rowH / 2, 0)
    hud.getTransform().setLocalPosition(canvasPosition(500, MICRO_HUD.top + h / 2))
  }

  /** "Try it once" sandbox 5:553: Your turn / Mirror the guide once / touch dots + badge. */
  private buildSandbox(f: SceneObject): void {
    const box = createChild(f, "Sandbox")
    const yourTurn = addText(box, "YourTurn", "Your turn", {px: 24, weight: Weight.SemiBold, color: Colors.cyan}, 3)
    const mirror = addText(box, "Mirror", "Mirror the guide once", {px: 30, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.24}, 3)
    const row = createChild(box, "Touches")
    const rowItems: RowItem[] = []
    for (let i = 0; i < Config.TUTORIAL_TOUCHES; i++) {
      const dot = addRoundedRect(row, `Dot${i}`, DOT, DOT, {fill: white(0), borderPx: 2, borderColor: Colors.cyan}, 2)
      this.dots.push(dot)
      rowItems.push({so: dot.sceneObject, widthPx: DOT, anchor: "center"})
    }
    // Laid out with the widest count so the card never resizes (the text is left-anchored).
    const widest = `${Config.TUTORIAL_TOUCHES} of ${Config.TUTORIAL_TOUCHES} touches`
    this.touchesText = addText(row, "Count", widest, {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary}, 3)
    rowItems.push(textItem(this.touchesText))
    const rowW = rowItems.reduce((s, item) => s + item.widthPx, 0) + DOT_GAP * (rowItems.length - 1)

    this.badgeSo = createChild(box, "TrackingBadge")
    const badge = this.badgeSo.createComponent(Badge.getTypeName()) as Badge
    badge.tone = "Success"
    badge.text = "Hand visible to cameras"
    badge.initialize()

    const colW = Math.max(textWidthPx(yourTurn), textWidthPx(mirror), rowW)
    const col = [24 * LINE, 30 * LINE, 24 * LINE]
    const colH = col[0] + col[1] + col[2] + SANDBOX.colGap * 2
    const w = SANDBOX.padLeft + colW + SANDBOX.gap + badge.widthPx + SANDBOX.padRight
    const h = colH + SANDBOX.padY * 2
    addRoundedRect(box, "Glass", w, h, glassStyle(SANDBOX.radius), 0)
    const left = -w / 2 + SANDBOX.padLeft
    let y = colH / 2
    place(yourTurn.getSceneObject(), left, y - col[0] / 2, 1)
    y -= col[0] + SANDBOX.colGap
    place(mirror.getSceneObject(), left, y - col[1] / 2, 1)
    y -= col[1] + SANDBOX.colGap
    place(row, 0, 0, 0)
    layoutRow(rowItems, DOT_GAP, 1, left, y - col[2] / 2)
    place(this.badgeSo, left + colW + SANDBOX.gap + badge.widthPx / 2, 0, 1)
    box.getTransform().setLocalPosition(canvasPosition(500, SANDBOX.top + h / 2))
  }

  private addButton(f: SceneObject, label: string, style: "Primary" | "Secondary", y: number): PhysioButton {
    const so = createChild(f, label)
    const button = so.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = label
    button.style = style
    button.initialize()
    so.getTransform().setLocalPosition(canvasPosition(500, y))
    return button
  }

  /** The guide's current finger is cyan with on-accent text, the others white 18 %. */
  private renderTargets(): void {
    this.targets.forEach((t, i) => {
      const active = i === this.guideStep
      t.fill.backgroundColor = active ? Colors.cyan : white(0.18)
      t.label.textFill.color = active ? Colors.textOnAccent : Colors.textPrimary
    })
  }

  /** Dots: done emerald, current cyan ring, upcoming cyan 40 % ring (5:558–5:561). */
  private renderTouches(): void {
    this.dots.forEach((dot, i) => {
      const done = i < this.touches
      dot.backgroundColor = done ? Colors.emerald : white(0)
      dot.borderColor = done ? Colors.emerald : i === this.touches ? Colors.cyan : Colors.cyan40
    })
    this.touchesText.text = `${this.touches} of ${Config.TUTORIAL_TOUCHES} touches`
  }
}
