import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {PacerAxis} from "../PacerController"
import {Colors, Textures, Weight, withAlpha} from "../Theme"
import {addImage, addRoundedRect, addText, canvasPosition, createChild, place} from "../ui/Primitives"
import {RangeGauge} from "../ui/RangeGauge"
import {glassStyle} from "../ui/Widgets"
import {PacedHeadExercise, PacedSide} from "./PacedHeadExercise"
import {ScreenId} from "./ScreenTypes"

// Figma 5:748 (drawn turned 30° left, holding), px.
/** Hold timer 3:108 at (400, 580): centred 20 px above the head-aim point when on target. */
const TIMER_Y = 680
const READOUT_Y = 828.2
const INSTRUCTION_Y = 879.7
const GAUGE_Y = 1035.2
const GAUGE_LEFT = 95
const GAUGE_RIGHT = 905
const GAUGE_LABEL_Y = 1097.5
/** Gauge scale steps when a target needs a wider gauge than YAW_GAUGE_DEG (the 15° tick pitch). */
const GAUGE_STEP_DEG = 15
/** 5:779 edge glow: 220 px wide, cyan 0 → 28 % toward the edge; drawn 1 cm behind the HUD plane so it never hides the bar or gauge. */
const GLOW = {w: 220, h: 1400, alpha: 0.28, behindLayers: -50}
/** 5:780 off-screen indicator: 119 × 187 glass pill centred at (916.5, 700). */
const INDICATOR = {x: 916.5, w: 119, h: 187, chevron: 72, chevronY: 36, labelY: -20.5, valueY: -55.5}
/** Return arrow pulse (4b spec "pulses until yaw < 5°"). */
const PULSE_HZ = 1
const PULSE_MIN_ALPHA = 0.35

/**
 * 4b · Active HUD — Head mode · Turn left & right (5:748). Each rep: left, then right. The hold
 * timer (3:122) is world-locked at the yaw target (today's yaw range × pace) relative to the
 * Neutral Forward Vector, so it is centred when the user holds the turn. The yaw gauge with the
 * pacer dot, the readout and the instruction lazy-follow; the gauge marker turns emerald in the
 * target band. Once the centre is EDGE_ARROW_SHOW_DEG away, the edge indicator ("› Centre 30°")
 * and glow appear on the side of the centre and pulse on the way back until yaw <
 * RETURN_CENTRE_DEG. Faster than TOO_FAST_DEG_S → amber "Slower, please", rep not counted.
 */
@component
export class Screen4b extends PacedHeadExercise {
  readonly screenId: ScreenId = "4b"
  protected readonly axis: PacerAxis = "yaw"

  private targetGroup: SceneObject
  private readout: Text
  private instruction: Text
  private gauge: RangeGauge
  private leftLabel: Text
  private rightLabel: Text
  private edge: SceneObject
  private glow: RoundedRectangle
  private indicator: SceneObject
  private chevron: RenderMeshVisual
  private distance: Text
  private edgeShown = false
  private edgeSide = 0
  private pulseT = 0

  /** The head-aim point is the hold readout; the HUD buttons keep their own dwell rings (P26). */
  protected get showsAimDot(): boolean {
    return false
  }

  protected buildScreen(): void {
    // World-locked target: the hold timer, moved to each side's yaw target.
    this.targetGroup = createChild(this.root, "Target")
    const timer = this.createTimer(this.targetGroup, true)
    place(timer.sceneObject, 0, 700 - TIMER_Y, 0)

    const f = this.followRoot()
    const at = (so: SceneObject, x: number, y: number) => so.getTransform().setLocalPosition(canvasPosition(x, y))
    this.readout = addText(f, "Readout", "", {px: 30, weight: Weight.SemiBold, color: Colors.emerald, align: "center"}, 3)
    at(this.readout.getSceneObject(), 500, READOUT_Y)
    this.instruction = addText(f, "Instruction", "", {px: 26, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center"}, 3)
    at(this.instruction.getSceneObject(), 500, INSTRUCTION_Y)

    const gaugeSo = createChild(f, "YawGauge")
    this.gauge = gaugeSo.createComponent(RangeGauge.getTypeName()) as RangeGauge
    this.gauge.styleName = "yaw"
    this.gauge.initialize()
    at(gaugeSo, 500, GAUGE_Y)
    const labelStyle = {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary, trackingPx: 0.72}
    this.leftLabel = addText(f, "LeftEnd", "", {...labelStyle, align: "left"}, 3)
    at(this.leftLabel.getSceneObject(), GAUGE_LEFT, GAUGE_LABEL_Y)
    const centre = addText(f, "Centre", "0°", {...labelStyle, align: "center"}, 3)
    at(centre.getSceneObject(), 500, GAUGE_LABEL_Y)
    this.rightLabel = addText(f, "RightEnd", "", {...labelStyle, align: "right"}, 3)
    at(this.rightLabel.getSceneObject(), GAUGE_RIGHT, GAUGE_LABEL_Y)

    // Off-screen direction indicator + edge glow (head-locked, soft), built for the right edge.
    this.edge = createChild(f, "EdgeIndicator")
    at(this.edge, 500, 700)
    this.glow = addRoundedRect(this.edge, "Glow", GLOW.w, GLOW.h, {fill: withAlpha(Colors.cyan, 0), radiusPx: 0}, -1)
    this.indicator = createChild(this.edge, "Indicator")
    addRoundedRect(this.indicator, "Glass", INDICATOR.w, INDICATOR.h, glassStyle(), 1)
    this.chevron = addImage(this.indicator, "Chevron", Textures.chevRight, INDICATOR.chevron, INDICATOR.chevron, Colors.cyan, 4)
    place(this.chevron.getSceneObject(), 0, INDICATOR.chevronY, 2)
    const label = addText(this.indicator, "Label", "Centre", {px: 24, weight: Weight.SemiBold, color: Colors.cyan, align: "center"}, 4)
    place(label.getSceneObject(), 0, INDICATOR.labelY, 2)
    this.distance = addText(this.indicator, "Distance", "", {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary, align: "center"}, 4)
    place(this.distance.getSceneObject(), 0, INDICATOR.valueY, 2)
    this.edge.enabled = false
  }

  protected computeSides(): PacedSide[] {
    const rom = this.store.rom
    const f = this.ctx.targetFactor
    const sides: PacedSide[] = [
      {sign: -1, targetDeg: rom.yawLeftDeg * f},
      {sign: 1, targetDeg: rom.yawRightDeg * f},
    ]
    let scale = Config.YAW_GAUGE_DEG
    const widest = Math.max(...sides.map((s) => s.targetDeg)) + Config.HEAD_TARGET_TOL_DEG
    while (scale < widest) scale += GAUGE_STEP_DEG
    this.gauge.scaleDeg = scale
    this.leftLabel.text = `L ${scale}°`
    this.rightLabel.text = `R ${scale}°`
    this.edgeShown = false
    this.edgeSide = 0
    return sides
  }

  protected metric(): number {
    return this.head.yawDeg
  }

  protected onSideStart(): void {
    this.setPose(this.targetGroup, this.neutralPose(this.signedTarget, 0))
    const tol = Config.HEAD_TARGET_TOL_DEG
    this.gauge.setBand(this.signedTarget - tol, this.signedTarget + tol)
  }

  protected onHeld(): void {
    AudioCues.instance.speak("returnToCentre")
  }

  protected render(): void {
    const yaw = this.metric()
    const inBand = this.onTarget
    this.gauge.setValue(yaw)
    this.gauge.setMarkerColor(inBand ? Colors.emerald : Colors.cyan)
    this.gauge.setPacer(this.pacer.valueDeg, this.pacer.direction)

    this.setText(this.readout, `${Math.round(Math.max(0, yaw * this.side.sign))}° of ${Math.round(this.side.targetDeg)}°`)
    if (this.tooFast) {
      this.setText(this.instruction, "Slower, please", Colors.amber)
    } else if (this.phase === "hold" && (inBand || this.timer.progress > 0)) {
      this.setText(this.instruction, "Then follow the dot back to centre — slowly", Colors.vibrantSecondary)
    } else {
      this.setText(this.instruction, "Follow the dot — slowly", Colors.vibrantSecondary)
    }
    this.renderEdge(yaw)
  }

  /** Shown once the centre is EDGE_ARROW_SHOW_DEG away; hidden again once yaw < RETURN_CENTRE_DEG. */
  private renderEdge(yaw: number): void {
    const away = Math.abs(yaw)
    if (away > Config.EDGE_ARROW_SHOW_DEG) this.edgeShown = true
    else if (away < Config.RETURN_CENTRE_DEG) this.edgeShown = false
    this.edge.enabled = this.edgeShown
    if (!this.edgeShown) return

    // The centre is on the opposite side of the turn.
    const side = yaw < 0 ? 1 : -1
    if (side !== this.edgeSide) {
      this.edgeSide = side
      place(this.indicator, side * (INDICATOR.x - 500), 0, 1)
      place(this.glow.sceneObject, side * (500 - GLOW.w / 2), 0, GLOW.behindLayers)
      this.chevron.getSceneObject().getTransform().setLocalRotation(quat.angleAxis(side > 0 ? 0 : Math.PI, vec3.forward()))
      const clear = withAlpha(Colors.cyan, 0)
      const lit = withAlpha(Colors.cyan, GLOW.alpha)
      this.glow.gradient = true
      this.glow.setBackgroundGradient({
        enabled: true,
        type: "Linear",
        start: new vec2(-1, 0),
        end: new vec2(1, 0),
        stop0: {enabled: true, percent: 0, color: side > 0 ? clear : lit},
        stop1: {enabled: true, percent: 1, color: side > 0 ? lit : clear},
      })
    }
    this.setText(this.distance, `${Math.round(away)}°`)

    // Pulses on the way back (after the hold).
    const returning = this.phase === "back" || this.phase === "settle"
    this.pulseT = returning ? this.pulseT + getDeltaTime() : 0
    const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * PULSE_HZ * this.pulseT)
    this.chevron.mainPass.baseColor = withAlpha(Colors.cyan, PULSE_MIN_ALPHA + (1 - PULSE_MIN_ALPHA) * wave)
  }

  private setText(text: Text, value: string, color?: vec4): void {
    if (text.text !== value) text.text = value
    if (color) text.textFill.color = color
  }
}
