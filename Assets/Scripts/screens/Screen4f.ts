import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {FINGERS, HandMetrics} from "../HandMetrics"
import {Colors, Silhouettes, Textures, Weight, white} from "../Theme"
import {addImage, addRoundedRect, addText, canvasPosition, createChild, place, resizeRoundedRect, textWidthPx} from "../ui/Primitives"
import {glassStyle} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 20:429, px.
const LINE = 1.211
/** Captions are 22 px in Figma; raised to the 24 px minimum (4:4, brief §2; DEVIATIONS.md F16). */
const CAPTION_PX = 24
const STEPPER = {top: 232, padX: 20, padY: 16, gap: 12, radius: 40}
const STEP = {padX: 20, padY: 10, gap: 8, labelGap: 2, radius: 28, miniW: 70, miniH: 86}
/** Side-view silhouette inside the 70 × 86 mini box (63.8 × 89.03 at x 3.1). */
const MINI = {w: 63.8, h: 89.03, y: -1.5}
const CHECK_ICON = 22
const GUIDE_CHIP = {left: 70, top: 481, padLeft: 20, padRight: 24, padY: 12}
/** Ghost 21:318: 330.75 × 460.5 texture box centred at (224.6, 782.25). */
const GHOST = {x: 224.6, y: 782.25, w: 330.75, h: 460.5}
const CARD = {left: 500, top: 592, w: 440, padTop: 28, padBottom: 30, padX: 32, gap: 18, rowGap: 8, barH: 10, radius: 46}

type PoseKey = "open" | "tabletop" | "fist"
type StepState = "done" | "current" | "next"

type Pose = {
  key: PoseKey
  label: string
  title: string
  mini: Texture
  /** The tabletop mini is drawn stronger in Figma (fill 20 %, full stroke) than the other two. */
  miniStrong: boolean
  ghost: Texture
  measureLabel: string
  checkLabel: string
}

/**
 * Tabletop copy is Figma 20:536. Open palm and Full fist have no Figma card; their rows are
 * DRAFT, built on the same pattern (DEVIATIONS.md F18).
 */
const POSES: Pose[] = [
  {key: "open", label: "1  Open palm", title: "Open palm", mini: Silhouettes.sideOpen, miniStrong: false, ghost: Silhouettes.ghostOpenSide, measureLabel: "Fingers open", checkLabel: "Palm facing you"},
  {key: "tabletop", label: "2  Tabletop", title: "Tabletop", mini: Silhouettes.sideTabletop, miniStrong: true, ghost: Silhouettes.ghostTabletopSide, measureLabel: "Knuckles bent", checkLabel: "Fingers straight"},
  {key: "fist", label: "3  Full fist", title: "Full fist", mini: Silhouettes.sideFist, miniStrong: false, ghost: Silhouettes.ghostFistSide, measureLabel: "Fingertips to palm", checkLabel: "Palm facing you"},
]

type Measurement = {value: string; fraction: number; met: boolean; check: boolean}

type StepView = {
  so: SceneObject
  bg: RoundedRectangle
  mini: RenderMeshVisual
  label: Text
  status: SceneObject
  statusIcon: RenderMeshVisual
  statusText: Text
  width: number
}

/**
 * 4f · Active HUD — Hand mode · Tendon gliding (20:429). Open palm → Tabletop → Full fist is one
 * rep; each pose is held HOLD_S once both checks are green (amber while approaching, emerald
 * when matched; the hold drains at HOLD_DRAIN_MULT× when the pose is lost). Angles come from
 * the front-view keypoints (HandMetrics); the side-view ghost is illustration only. Tabletop
 * passes at pace × TABLETOP_MCP_DEG knuckle flexion with straight fingers (approved at Phase 0).
 */
@component
export class Screen4f extends ScreenBase {
  readonly screenId: ScreenId = "4f"

  private stepper: SceneObject
  private stepperBg: RoundedRectangle
  private readonly steps: StepView[] = []
  private readonly chevrons: Text[] = []
  private ghostImage: RenderMeshVisual
  private cardTitle: Text
  private measureLabel: Text
  private measureValue: Text
  private barFill: RoundedRectangle
  private checkLabel: Text
  private checkIcon: RenderMeshVisual
  private checkValue: Text
  private poseIndex = 0
  private hold = 0
  private broken = false

  protected build(): void {
    const f = this.followRoot()
    this.buildStepper(f)
    this.buildGuideChip(f)
    const ghost = this.ghostRoot(f, GHOST.x, GHOST.y)
    this.ghostImage = addImage(ghost, "GhostGuide", POSES[0].ghost, GHOST.w, GHOST.h, Colors.cyan, 0)
    this.buildCard(f)
  }

  protected onShow(): void {
    this.poseIndex = 0
    this.hold = 0
    this.broken = false
    this.renderPose()
  }

  protected tick(dt: number): void {
    const hand = HandMetrics.instance
    const m = this.measure(POSES[this.poseIndex].key, hand)
    const matched = hand.trackingGood && m.met && m.check
    const rate = dt / Config.HOLD_S
    if (!matched && this.hold > 0) this.broken = true
    const before = Math.ceil((1 - this.hold) * Config.HOLD_S)
    this.hold = Math.max(0, Math.min(1, this.hold + (matched ? rate : -rate * Config.HOLD_DRAIN_MULT)))
    AudioCues.instance.approach(this.hold)
    this.renderMeasurement(m)
    if (this.hold >= 1) {
      this.poseDone()
    } else if (Math.ceil((1 - this.hold) * Config.HOLD_S) !== before) {
      this.renderSteps()
    }
  }

  private poseDone(): void {
    AudioCues.instance.play("reached")
    this.hold = 0
    this.poseIndex++
    if (this.poseIndex < POSES.length) {
      this.renderPose()
      return
    }
    const smooth = !this.broken
    this.poseIndex = 0
    this.broken = false
    this.renderPose()
    // Last: completing the set moves the session on (and may hide this screen).
    this.sm.completeRep(smooth)
  }

  /**
   * Front-view checks (4f spec): open = every joint near straight; tabletop = knuckles at
   * pace × TABLETOP_MCP_DEG with straight fingers; fist = every fingertip near the palm centre.
   */
  private measure(key: PoseKey, hand: HandMetrics): Measurement {
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    const mcp = mean(FINGERS.map((f) => hand.flexion[f].mcpDeg))
    const pip = mean(FINGERS.map((f) => hand.flexion[f].pipDeg))
    const straightPip = 180 - pip >= Config.TENDON_STRAIGHT_DEG
    switch (key) {
      case "open": {
        const extension = 180 - (mcp + pip) / 2
        const target = Config.TENDON_STRAIGHT_DEG
        return {value: `${Math.round(extension)}° / ${target}°`, fraction: extension / target, met: extension >= target, check: hand.facingCamera}
      }
      case "tabletop": {
        const target = Math.round(this.ctx.targetFactor * Config.TABLETOP_MCP_DEG)
        return {value: `${Math.round(mcp)}° / ${target}°`, fraction: mcp / target, met: mcp >= target, check: straightPip}
      }
      case "fist": {
        const distance = mean(FINGERS.map((f) => hand.tipToPalmCm[f]))
        const target = Config.FIST_TIP_PALM_CM
        return {
          value: `${distance.toFixed(1)} cm / ${target} cm`,
          fraction: distance > 0 ? target / distance : 0,
          met: hand.tracked && distance <= target,
          check: hand.facingCamera,
        }
      }
    }
  }

  // ─── Pose stepper 20:469 ───────────────────────────────────────────────

  private buildStepper(f: SceneObject): void {
    this.stepper = createChild(f, "PoseStepper")
    this.stepperBg = addRoundedRect(this.stepper, "Glass", 10, 10, glassStyle(STEPPER.radius), 0)
    POSES.forEach((pose, i) => {
      const so = createChild(this.stepper, `Step_${pose.key}`)
      const bg = addRoundedRect(so, "Selected", 10, 10, {fill: Colors.segmentSelected, radiusPx: STEP.radius}, 1)
      const mini = addImage(so, "Mini", pose.mini, MINI.w, MINI.h, white(1), 2)
      const label = addText(so, "Label", pose.label, {px: 26, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center"}, 3)
      const status = createChild(so, "Status")
      const statusIcon = addImage(status, "Check", Textures.check, CHECK_ICON, CHECK_ICON, Colors.emerald, 3)
      const statusText = addText(status, "Text", "", {px: CAPTION_PX, weight: Weight.Medium, color: Colors.emerald}, 3)
      this.steps.push({so, bg, mini, label, status, statusIcon, statusText, width: 0})
      if (i < POSES.length - 1) {
        this.chevrons.push(addText(this.stepper, "Chevron", "›", {px: 32, weight: Weight.Regular, color: Colors.vibrantTertiary, align: "center", trackingPx: -0.256}, 3))
      }
    })
  }

  private renderSteps(): void {
    const labelH = 26 * LINE
    const statusH = CAPTION_PX * LINE
    const stepH = STEP.padY * 2 + STEP.miniH + STEP.gap + labelH + STEP.labelGap + statusH
    const remaining = Math.max(1, Math.ceil((1 - this.hold) * Config.HOLD_S))
    this.steps.forEach((step, i) => {
      const pose = POSES[i]
      const state: StepState = i < this.poseIndex ? "done" : i === this.poseIndex ? "current" : "next"
      step.bg.sceneObject.enabled = state === "current"
      // Current: cyan ghost style. Others: white 12 % fill / 75 % stroke (the tabletop texture is baked stronger).
      step.mini.mainPass.baseColor = state === "current" ? Colors.cyan : white(pose.miniStrong ? 0.75 : 1)
      step.label.textFill.color = state === "done" ? Colors.vibrantSecondary : state === "current" ? Colors.textPrimary : Colors.vibrantTertiary
      step.statusIcon.getSceneObject().enabled = state === "done"
      step.statusText.text = state === "done" ? "Done" : state === "current" ? `Hold ${remaining} s` : "Next"
      step.statusText.textFill.color = state === "done" ? Colors.emerald : state === "current" ? Colors.cyan : Colors.vibrantTertiary
      const statusW = textWidthPx(step.statusText) + (state === "done" ? CHECK_ICON + 6 : 0)
      const contentW = Math.max(STEP.miniW, textWidthPx(step.label), statusW)
      step.width = contentW + STEP.padX * 2
      resizeRoundedRect(step.bg, step.width, stepH, STEP.radius)
      let y = stepH / 2 - STEP.padY
      place(step.mini.getSceneObject(), 0, y - STEP.miniH / 2 + MINI.y, 2)
      y -= STEP.miniH + STEP.gap
      place(step.label.getSceneObject(), 0, y - labelH / 2, 3)
      y -= labelH + STEP.labelGap
      place(step.status, 0, y - statusH / 2, 0)
      const left = -statusW / 2
      if (state === "done") {
        place(step.statusIcon.getSceneObject(), left + CHECK_ICON / 2, 0, 3)
        place(step.statusText.getSceneObject(), left + CHECK_ICON + 6, 0, 3)
      } else {
        place(step.statusText.getSceneObject(), left, 0, 3)
      }
    })
    const chevronWs = this.chevrons.map((c) => textWidthPx(c))
    const w = STEPPER.padX * 2 + this.steps.reduce((s, step) => s + step.width, 0) + chevronWs.reduce((a, b) => a + b, 0) + STEPPER.gap * (this.steps.length + this.chevrons.length - 1)
    const h = STEPPER.padY * 2 + stepH
    resizeRoundedRect(this.stepperBg, w, h, STEPPER.radius)
    let x = -w / 2 + STEPPER.padX
    this.steps.forEach((step, i) => {
      place(step.so, x + step.width / 2, 0, 1)
      x += step.width + STEPPER.gap
      if (i < this.chevrons.length) {
        place(this.chevrons[i].getSceneObject(), x + chevronWs[i] / 2, 0, 1)
        x += chevronWs[i] + STEPPER.gap
      }
    })
    this.stepper.getTransform().setLocalPosition(canvasPosition(500, STEPPER.top + h / 2))
  }

  // ─── Guide chip 20:523 and live pose check 20:536 ──────────────────────

  private buildGuideChip(f: SceneObject): void {
    const chip = createChild(f, "GuideChip")
    const text = addText(chip, "Text", "Guide · side view", {px: CAPTION_PX, weight: Weight.Medium, color: Colors.vibrantSecondaryOnControl}, 3)
    const w = GUIDE_CHIP.padLeft + textWidthPx(text) + GUIDE_CHIP.padRight
    const h = GUIDE_CHIP.padY * 2 + CAPTION_PX * LINE
    addRoundedRect(chip, "Fill", w, h, {fill: Colors.controlFill}, 0)
    place(text.getSceneObject(), -w / 2 + GUIDE_CHIP.padLeft, 0, 1)
    chip.getTransform().setLocalPosition(canvasPosition(GUIDE_CHIP.left + w / 2, GUIDE_CHIP.top + h / 2))
  }

  private buildCard(f: SceneObject): void {
    const card = createChild(f, "PoseCheck")
    const titleH = 34 * LINE
    const rowH = 26 * LINE
    const footH = 24 * LINE
    const h = CARD.padTop + titleH + CARD.gap + rowH + CARD.rowGap + CARD.barH + CARD.gap + rowH + CARD.gap + footH + CARD.padBottom
    addRoundedRect(card, "Glass", CARD.w, h, glassStyle(CARD.radius), 0)
    const left = -CARD.w / 2 + CARD.padX
    const right = CARD.w / 2 - CARD.padX
    const barW = CARD.w - CARD.padX * 2
    let y = h / 2 - CARD.padTop
    this.cardTitle = addText(card, "Title", "", {px: 34, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.272}, 3)
    place(this.cardTitle.getSceneObject(), left, y - titleH / 2, 1)
    y -= titleH + CARD.gap
    this.measureLabel = addText(card, "MeasureLabel", "", {px: 26, weight: Weight.Regular, color: Colors.textPrimary}, 3)
    place(this.measureLabel.getSceneObject(), left, y - rowH / 2, 1)
    this.measureValue = addText(card, "MeasureValue", "", {px: 26, weight: Weight.SemiBold, color: Colors.amber, align: "right"}, 3)
    place(this.measureValue.getSceneObject(), right, y - rowH / 2, 1)
    y -= rowH + CARD.rowGap
    const track = addRoundedRect(card, "Track", barW, CARD.barH, {fill: white(0.18), radiusPx: CARD.barH / 2}, 1)
    place(track.sceneObject, 0, y - CARD.barH / 2, 1)
    this.barFill = addRoundedRect(card, "Fill", barW, CARD.barH, {fill: Colors.amber, radiusPx: CARD.barH / 2}, 2)
    place(this.barFill.sceneObject, 0, y - CARD.barH / 2, 2)
    y -= CARD.barH + CARD.gap
    this.checkLabel = addText(card, "CheckLabel", "", {px: 26, weight: Weight.Regular, color: Colors.textPrimary}, 3)
    place(this.checkLabel.getSceneObject(), left, y - rowH / 2, 1)
    this.checkValue = addText(card, "CheckValue", "", {px: 26, weight: Weight.SemiBold, color: Colors.emerald, align: "right"}, 3)
    place(this.checkValue.getSceneObject(), right, y - rowH / 2, 1)
    this.checkIcon = addImage(card, "Check", Textures.check, 24, 24, Colors.emerald, 3)
    place(this.checkIcon.getSceneObject(), right, y - rowH / 2, 1)
    y -= rowH + CARD.gap
    const footer = addText(card, "Footer", `Hold ${Config.HOLD_S} s once both are green`, {px: 24, weight: Weight.Regular, color: Colors.vibrantSecondary}, 3)
    place(footer.getSceneObject(), left, y - footH / 2, 1)
    card.getTransform().setLocalPosition(canvasPosition(CARD.left + CARD.w / 2, CARD.top + h / 2))
  }

  private renderPose(): void {
    const pose = POSES[this.poseIndex]
    this.ghostImage.mainPass.baseTex = pose.ghost
    this.cardTitle.text = pose.title
    this.measureLabel.text = pose.measureLabel
    this.checkLabel.text = pose.checkLabel
    this.renderSteps()
  }

  /** Amber while approaching, emerald when matched (4f spec). */
  private renderMeasurement(m: Measurement): void {
    const color = m.met ? Colors.emerald : Colors.amber
    this.measureValue.text = m.value
    this.measureValue.textFill.color = color
    const barW = CARD.w - CARD.padX * 2
    const w = Math.max(CARD.barH, barW * Math.max(0, Math.min(1, m.fraction)))
    resizeRoundedRect(this.barFill, w, CARD.barH, CARD.barH / 2)
    const p = this.barFill.sceneObject.getTransform().getLocalPosition()
    this.barFill.sceneObject.getTransform().setLocalPosition(new vec3((-(barW - w) / 2) * Config.PX_TO_CM, p.y, p.z))
    this.barFill.backgroundColor = color
    this.checkValue.text = m.check ? "Yes" : "Not yet"
    this.checkValue.textFill.color = m.check ? Colors.emerald : Colors.amber
    this.checkIcon.getSceneObject().enabled = m.check
    if (m.check) {
      const right = CARD.w / 2 - CARD.padX
      const ic = this.checkIcon.getSceneObject().getTransform().getLocalPosition()
      this.checkIcon.getSceneObject().getTransform().setLocalPosition(new vec3((right - textWidthPx(this.checkValue) - 6 - 12) * Config.PX_TO_CM, ic.y, ic.z))
    }
  }
}
