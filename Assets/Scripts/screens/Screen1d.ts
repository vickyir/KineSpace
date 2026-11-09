import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {FINGERS, HandMetrics} from "../HandMetrics"
import {HoldTimer} from "../HoldTimer"
import {Colors, Textures, Weight, white} from "../Theme"
import {Badge} from "../ui/Badge"
import {PhysioButton} from "../ui/PhysioButton"
import {addImage, addRoundedRect, addText, canvasPosition, createChild} from "../ui/Primitives"
import {SEGMENTED_STYLES, SegmentedControl} from "../ui/SegmentedControl"
import {addIconText, addStepIndicator, glassStyle, pillAround} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:126, px.
const CAPTURE_FRAME = {w: 440, h: 470}
/** Instruction card inner width (880 − 2 × 48 padding). */
const CARD_TEXT_W = 784
/** Capture frame follows the palm with this response time (s), so tracking jitter doesn't shake it. */
const FRAME_FOLLOW_S = 0.15
/** Fingertip dot 15:292–296: 22 px, white 2.5 px ring. Scaled to keep that angular size near the hand. */
const DOT_PX = 22
const DOT_RING_PX = 2.5
const DOT_RENDER_ORDER = 800

type DotState = "neutral" | "holding" | "captured"
/** Joint Node semantics (3:105): cyan neutral, amber approaching, emerald reached. */
const DOT_COLORS: Record<DotState, vec4> = {neutral: Colors.cyan, holding: Colors.amber, captured: Colors.emerald}

/**
 * 1d · Calibration — Step 4 · Comfortable hand range. Instruction card, Right / Left hand
 * selector (persisted), hold timer and "Save baseline" on the soft head-locked 110 cm plane; the
 * capture frame sits in the hand zone (chest height, HAND_ZONE_PITCH_DEG, HAND_ZONE_REACH_CM)
 * and fingertip dots follow the SIK keypoints (no near-field text). When the spread stays within
 * SPREAD_STABLE_CM for HAND_RANGE_HOLD_S with the palm facing the user, the dots turn emerald and
 * "Save baseline" stores Max finger spread.
 */
@component
export class Screen1d extends ScreenBase {
  readonly screenId: ScreenId = "1d"

  private body: Text
  private selector: SegmentedControl
  private timer: HoldTimer
  private trackingBadge: SceneObject
  private zone: SceneObject
  private readonly dots: {so: SceneObject; rect: RoundedRectangle}[] = []
  private anchor = 0
  private best = 0
  private captured = false
  private capturedSpread = 0

  protected build(): void {
    const f = this.followRoot()
    const at = (so: SceneObject, x: number, y: number) => so.getTransform().setLocalPosition(canvasPosition(x, y))

    // Instruction card 5:127 (60, 60, 880 × 282), radius 36.
    const card = createChild(f, "InstructionCard")
    addRoundedRect(card, "Glass", 880, 282, glassStyle(36), 0)
    at(card, 500, 201)
    const inCard = (so: SceneObject, x: number, y: number) => this.placeCanvas(so, x, y, 500, 201, 1)
    inCard(addStepIndicator(card, 4, 4).so, 500, 108.5)
    const title = addText(
      card,
      "Title",
      "Open your fingers as wide as you can without pain",
      {px: 40, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center", wrapWidthPx: CARD_TEXT_W, lineHeight: 1.2, trackingPx: -0.6},
      3
    )
    inCard(title.getSceneObject(), 500.5, 184)
    this.body = addText(card, "Body", "", {px: 26, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: CARD_TEXT_W}, 3)
    inCard(this.body.getSceneObject(), 500.5, 277)

    // Hand selector 25:298
    const selectorSo = createChild(f, "HandSelector")
    this.selector = selectorSo.createComponent(SegmentedControl.getTypeName()) as SegmentedControl
    this.selector.style = SEGMENTED_STYLES.handSelector
    this.selector.segments = [{label: "Right hand", phrases: ["right hand", "right"]}, {label: "Left hand", phrases: ["left hand", "left"]}]
    this.selector.selectedIndex = HandMetrics.instance.side === "left" ? 1 : 0
    this.selector.initialize()
    this.selector.onChanged.add((i) => {
      HandMetrics.instance.setSide(i === 1 ? "left" : "right")
      this.resetCapture()
    })
    at(selectorSo, 500, 399.5)

    const timerSo = createChild(f, "HoldTimer")
    this.timer = timerSo.createComponent(HoldTimer.getTypeName()) as HoldTimer
    this.timer.holdSeconds = Config.HAND_RANGE_HOLD_S
    this.timer.initialize()
    this.timer.onComplete.add(() => this.capture())
    at(timerSo, 740, 637)

    const saving = addText(f, "Saving", "Saving today’s range", {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary, align: "center"}, 3)
    at(saving.getSceneObject(), 740, 773.5)

    this.trackingBadge = createChild(f, "TrackingBadge")
    const badge = this.trackingBadge.createComponent(Badge.getTypeName()) as Badge
    badge.tone = "Success"
    badge.text = "Tracking good"
    badge.initialize()
    at(this.trackingBadge, 740, 833.5)

    // Posture hint 19:173: control pill, padding 18 / 22, icon 26 + 10 + text.
    const hint = createChild(f, "PostureHint")
    pillAround(
      hint,
      [
        addIconText(
          hint,
          "Hint",
          Textures.handPosture,
          26,
          Colors.textPrimary,
          "Palm facing you · hand at chest height",
          {px: 24, weight: Weight.Medium, color: Colors.textPrimary},
          10
        ),
      ],
      0,
      18,
      22,
      53,
      {fill: Colors.controlFill}
    )
    at(hint, 500.5, 997.5)

    const buttonSo = createChild(f, "SaveBaseline")
    const button = buttonSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = "Save baseline"
    button.style = "Primary"
    button.initialize()
    button.onPressed.add(() => this.confirm())
    at(buttonSo, 500, 1102)

    // Near field: capture frame in the hand zone (world-locked to the Neutral Forward Vector).
    this.zone = createChild(this.root, "HandZone")
    addImage(this.zone, "CaptureFrame", Textures.captureFrame, CAPTURE_FRAME.w, CAPTURE_FRAME.h, white(1), 10)
    for (let i = 0; i < 5; i++) {
      const so = createChild(this.root, `Fingertip${i}`)
      const rect = addRoundedRect(so, "Dot", DOT_PX, DOT_PX, {fill: Colors.cyan, borderPx: DOT_RING_PX, borderColor: white(1)}, DOT_RENDER_ORDER)
      this.dots.push({so, rect})
    }
  }

  protected onShow(): void {
    const pct = Math.round(this.ctx.targetFactor * 100)
    this.body.text = `Hold ${Config.HAND_RANGE_HOLD_S} s. This is today’s comfortable maximum — exercises aim for ${pct}% of it.`
    const t = this.zone.getTransform()
    t.setWorldPosition(this.head.pointFromNeutral(0, Config.HAND_ZONE_PITCH_DEG, Config.HAND_ZONE_REACH_CM))
    t.setWorldRotation(this.head.rotationFacingNeutral(0, Config.HAND_ZONE_PITCH_DEG))
    this.resetCapture()
  }

  protected tick(dt: number): void {
    const hand = HandMetrics.instance
    this.trackingBadge.enabled = hand.trackingGood
    this.updateDots(hand)
    this.followPalm(hand, dt)
    if (this.captured) return

    const ok = hand.trackingGood && hand.facingCamera
    const spread = hand.fingerSpreadCm
    if (ok && Math.abs(spread - this.anchor) <= Config.SPREAD_STABLE_CM) {
      this.best = Math.max(this.best, spread)
      this.timer.tick(dt, true)
    } else {
      this.anchor = spread
      this.best = spread
      this.timer.tick(dt, false)
    }
    AudioCues.instance.approach(this.timer.progress)
  }

  private capture(): void {
    this.captured = true
    this.capturedSpread = this.best
    AudioCues.instance.play("saved")
  }

  /** "Save baseline": stores Max finger spread once the auto-capture happened. */
  private confirm(): void {
    if (!this.captured) {
      AudioCues.instance.play("driftReset")
      return
    }
    this.store.setRom({fingerSpreadCm: Math.round(this.capturedSpread * 10) / 10})
    this.sm.next()
  }

  private resetCapture(): void {
    this.captured = false
    this.capturedSpread = 0
    this.anchor = HandMetrics.instance.fingerSpreadCm
    this.best = 0
    this.timer.reset()
  }

  /**
   * "Hand-anchored" ROM box: centred on the palm while the hand is tracked (sized to fit a spread
   * hand), resting in the chest-height hand zone otherwise.
   */
  private followPalm(hand: HandMetrics, dt: number): void {
    const palm = hand.tracked ? hand.palmCenter : null
    if (!palm) return
    const t = this.zone.getTransform()
    const k = 1 - Math.exp(-dt / FRAME_FOLLOW_S)
    const pos = t.getWorldPosition()
    t.setWorldPosition(pos.add(palm.sub(pos).uniformScale(k)))
    const toHead = this.head.headPosition.sub(palm).normalize()
    t.setWorldRotation(quat.lookAt(toHead, vec3.up()))
  }

  private updateDots(hand: HandMetrics): void {
    const visible = hand.tracked
    const state: DotState = this.captured ? "captured" : this.timer.progress > 0 ? "holding" : "neutral"
    const tips = visible ? [hand.thumbTip(), ...FINGERS.map((f) => hand.fingerTip(f))] : []
    const head = this.head.headPosition
    const facing = this.head.cameraTransform.getWorldRotation()
    this.dots.forEach((dot, i) => {
      dot.so.enabled = visible
      if (!visible) return
      const t = dot.so.getTransform()
      t.setWorldPosition(tips[i])
      t.setWorldRotation(facing)
      // Same angular size as 22 px on the 110 cm canvas.
      const scale = tips[i].distance(head) / Config.WINDOW_Z_CM
      t.setLocalScale(new vec3(scale, scale, 1))
      dot.rect.backgroundColor = DOT_COLORS[state]
    })
  }
}

