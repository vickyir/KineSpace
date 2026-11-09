import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {Colors, px, Textures, Weight} from "../Theme"
import {Chip} from "../ui/Chip"
import {addRoundedRect, addText, canvasPosition, createChild, DashedLine, drawOnTop, place} from "../ui/Primitives"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 20:359 (drawn at 18° of a 24° right tilt), px.
/** 20:399 target horizon: 900 px, 3 px emerald dashes 13.5 long, 9 apart, starting with half a dash. */
const HORIZON = {w: 900, stroke: 3, dash: 13.5, gap: 9}
/** 20:401 level bar (head-locked): 576 px line + 26.4 px end ticks, 4 px, 14.4 px centre dot. */
const LEVEL = {w: 580, stroke: 4, tickX: 288, tickH: 26.4, dot: 14.4}
/** 20:407 "You": left edge at x 196, centre 51.5 px above the bar. */
const YOU_CHIP = {left: -304, dy: 51.5}
/** 20:405 "Target": left edge on the horizon 330 px right of centre, 56.3 px below it. */
const TARGET_CHIP = {alongPx: 330, below: 56.3}
const READOUT_Y = 889.1
const INSTRUCTION_Y = 949
const SHOULDER_CHIP_Y = 1019.7
const LEVEL_RENDER_ORDER = 900

const INSTRUCTIONS = {
  right: "Tilt your right ear toward your shoulder until the lines meet",
  left: "Tilt your left ear toward your shoulder until the lines meet",
}

type Side = {sign: 1 | -1; targetDeg: number; instruction: string}

/**
 * 4e · Active HUD — Head mode · Ear to shoulder (20:359). Cockpit-style horizon: a rigidly
 * head-locked level bar ("You") and a world-locked target line ("Target") tilted to today's
 * roll range × pace. Tilting the head brings the two together; when they meet (±HEAD_TARGET_TOL_DEG)
 * the line turns solid and the hold runs HOLD_S (rising tone → chime). Each rep: right, then left.
 * A head-height drop > SHOULDER_DROP_CM is shoulder compensation: the chip turns amber
 * "Keep shoulders level" and the hold pauses. Faster than TOO_FAST_DEG_S → "Slower, please",
 * rep not counted.
 */
@component
export class Screen4e extends ScreenBase {
  readonly screenId: ScreenId = "4e"

  private level: SceneObject
  private horizonGroup: SceneObject
  private horizon: DashedLine
  private targetChip: Chip
  private readout: Text
  private instruction: Text
  private shoulders: Chip
  private sides: Side[] = []
  private sideIndex = 0
  private hold = 0
  private matchedShown: boolean | null = null
  private tooFast = false
  private repValid = true

  /** The level bar's centre dot marks the head-aim point; HUD buttons keep their own dwell rings (P26). */
  protected get showsAimDot(): boolean {
    return false
  }

  protected build(): void {
    // World-locked target horizon at the Neutral Forward Vector.
    this.horizonGroup = createChild(this.root, "TargetHorizon")
    this.horizon = new DashedLine(this.horizonGroup, "Line", Colors.emerald, 1)
    this.targetChip = new Chip(this.root, "TargetLabel", "Target", {px: 24, weight: Weight.SemiBold, color: Colors.emerald}, undefined, 2)

    // Head-locked level bar on the head-aim ray (rigid: it shows the head's roll).
    this.level = createChild(this.head.cameraTransform.getSceneObject(), "LevelBar4e")
    this.level.getTransform().setLocalPosition(new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM))
    addRoundedRect(this.level, "Line", LEVEL.w, LEVEL.stroke, {fill: Colors.textPrimary}, LEVEL_RENDER_ORDER)
    for (const x of [-LEVEL.tickX, LEVEL.tickX]) {
      const tick = addRoundedRect(this.level, "EndTick", LEVEL.stroke, LEVEL.tickH, {fill: Colors.textPrimary}, LEVEL_RENDER_ORDER)
      place(tick.sceneObject, x, 0, 0)
    }
    const dot = addRoundedRect(this.level, "CentreDot", LEVEL.dot, LEVEL.dot, {fill: Colors.textPrimary}, LEVEL_RENDER_ORDER + 1)
    place(dot.sceneObject, 0, 0, 1)
    const you = new Chip(this.level, "You", "You", {px: 24, weight: Weight.SemiBold, color: Colors.textPrimary}, undefined, LEVEL_RENDER_ORDER)
    place(you.sceneObject, YOU_CHIP.left + you.widthPx / 2, YOU_CHIP.dy, 0)
    drawOnTop(this.level)
    this.level.enabled = false

    const f = this.followRoot()
    const at = (so: SceneObject, y: number) => so.getTransform().setLocalPosition(canvasPosition(500, y))
    this.readout = addText(f, "Readout", "", {px: 48, weight: Weight.Bold, color: Colors.emerald, align: "center", trackingPx: -0.72}, 3)
    at(this.readout.getSceneObject(), READOUT_Y)
    this.instruction = addText(f, "Instruction", "", {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", trackingPx: -0.224}, 3)
    at(this.instruction.getSceneObject(), INSTRUCTION_Y)
    this.shoulders = new Chip(
      f,
      "Shoulders",
      "Keep both shoulders level",
      {px: 26, weight: Weight.SemiBold, color: Colors.textPrimary},
      {texture: Textures.user, px: 26, color: Colors.textPrimary},
      0
    )
    at(this.shoulders.sceneObject, SHOULDER_CHIP_Y)
  }

  protected onShow(): void {
    const rom = this.store.rom
    const f = this.ctx.targetFactor
    this.sides = [
      {sign: 1, targetDeg: rom.rollRightDeg * f, instruction: INSTRUCTIONS.right},
      {sign: -1, targetDeg: rom.rollLeftDeg * f, instruction: INSTRUCTIONS.left},
    ]
    this.setPose(this.horizonGroup, this.neutralPose(0, 0))
    this.level.enabled = true
    this.startRep()
  }

  protected onHide(): void {
    this.level.enabled = false
    AudioCues.instance.approach(0)
  }

  setCovered(covered: boolean): void {
    super.setCovered(covered)
    this.level.enabled = !covered && this.root.enabled
  }

  private get side(): Side {
    return this.sides[this.sideIndex]
  }

  private startRep(): void {
    this.sideIndex = 0
    this.repValid = true
    this.startSide()
  }

  private startSide(): void {
    this.hold = 0
    this.matchedShown = null
    // The line sits where the level bar will be at the target roll: rotated by −roll in the world.
    const roll = this.side.sign * this.side.targetDeg
    this.horizon.sceneObject.getTransform().setLocalRotation(quat.angleAxis((-roll * Math.PI) / 180, vec3.forward()))
  }

  protected tick(dt: number): void {
    const roll = this.head.rollDeg
    const side = this.side
    this.tooFast = this.head.speedDegS > Config.TOO_FAST_DEG_S
    if (this.tooFast) this.repValid = false
    const compensating = this.head.heightDropCm > Config.SHOULDER_DROP_CM
    const matched = Math.abs(roll - side.sign * side.targetDeg) <= Config.HEAD_TARGET_TOL_DEG
    const holding = matched && !compensating

    this.hold = Math.max(0, Math.min(1, this.hold + (holding ? dt : -dt * Config.HOLD_DRAIN_MULT) / Config.HOLD_S))
    AudioCues.instance.approach(this.hold)
    this.render(roll, matched, compensating)
    if (this.hold >= 1) this.held()
  }

  private held(): void {
    AudioCues.instance.approach(0)
    AudioCues.instance.play("reached")
    if (this.sideIndex + 1 < this.sides.length) {
      this.sideIndex++
      this.startSide()
      return
    }
    const counted = this.repValid
    this.startRep()
    // Last: finishing the set moves the session on (and hides this screen).
    if (counted) this.sm.completeRep(true)
  }

  private render(roll: number, matched: boolean, compensating: boolean): void {
    const side = this.side
    if (matched !== this.matchedShown) {
      this.matchedShown = matched
      const half = HORIZON.w / 2
      this.horizon.setPath([new vec2(-half, 0), new vec2(half, 0)], false, HORIZON.stroke, HORIZON.dash, matched ? 0 : HORIZON.gap, HORIZON.dash / 2)
    }
    this.placeTargetChip()

    this.setText(this.readout, `${Math.round(Math.max(0, roll * side.sign))}° of ${Math.round(side.targetDeg)}°`)
    if (this.tooFast) this.setText(this.instruction, "Slower, please", Colors.amber)
    else this.setText(this.instruction, side.instruction, Colors.vibrantSecondary)
    if (compensating) {
      this.shoulders.setText("Keep shoulders level", Colors.amber)
      this.shoulders.iconVisual.mainPass.baseColor = Colors.amber
    } else {
      this.shoulders.setText("Keep both shoulders level", Colors.textPrimary)
      this.shoulders.iconVisual.mainPass.baseColor = Colors.textPrimary
    }
  }

  /** "Target" stays upright in view, under the right part of the world line. */
  private placeTargetChip(): void {
    const line = this.horizon.sceneObject.getTransform().getWorldTransform()
    const anchor = line.multiplyPoint(new vec3(px(TARGET_CHIP.alongPx), 0, 0))
    const camera = this.head.cameraTransform
    const position = anchor.add(camera.right.uniformScale(px(this.targetChip.widthPx / 2))).add(camera.up.uniformScale(-px(TARGET_CHIP.below)))
    const t = this.targetChip.sceneObject.getTransform()
    t.setWorldPosition(position)
    t.setWorldRotation(camera.getWorldRotation())
  }

  private setText(text: Text, value: string, color?: vec4): void {
    if (text.text !== value) text.text = value
    if (color) text.textFill.color = color
  }
}
