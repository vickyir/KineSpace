import {Config} from "../Config"
import {PacerAxis} from "../PacerController"
import {Colors, Textures, Weight, white, withAlpha} from "../Theme"
import {Chip} from "../ui/Chip"
import {addRoundedRect, Arc, createChild, DashedRing, drawOnTop, place, WorldDots} from "../ui/Primitives"
import {addPacerVisual} from "../ui/Widgets"
import {PacedHeadExercise, PacedSide} from "./PacedHeadExercise"
import {ScreenId} from "./ScreenTypes"

// Figma 20:288, px. The frame squeezes the angles to fit one view; positions here are relative
// to each world-locked anchor (DEVIATIONS.md F25).
/** 20:331 active target: 130 px, emerald 10 % fill, 3 px emerald stroke. */
const TARGET_R = 65
const TARGET_STROKE = 3
/** 20:334 next target: 110 px dashed ring, 2 px, white 35 % (24 dashes, 43 % on). */
const NEXT_R = 55
const NEXT_DASHES = 24
const NEXT_DUTY = 0.43
/** 20:328 centre (Neutral Forward Vector): 40 px dashed ring, 2 px, white 50 % (16 dashes). */
const CENTRE_R = 20
const CENTRE_DASHES = 16
const RING_STROKE = 2
/** 20:329 path: 4 px dots, white 50 %, every 16.67 px; from 30 px past the centre to 16 px inside the target. */
const PATH_DOT = 4
const PATH_PITCH = 16.67
const PATH_BEFORE_CENTRE = 30
const PATH_INTO_TARGET = 16
/** Label chips: left edge and vertical offset from their anchor (20:332 / 20:335 / 20:344 / 20:340). */
const TARGET_CHIP = {left: 90, dy: -3.5}
/** Figma keeps the target label 25 px clear of the 65 px target; with the hold ring (100 px) shown it moves out to stay clear. */
const TARGET_CHIP_GAP = TARGET_CHIP.left - TARGET_R
const HOLD_RING_R = 100
/** The pacer sits on the target plane: draw it 0.5 cm in front, the hold ring 0.5 cm behind. */
const PACER_LAYER = 25
const TIMER_LAYER = -25
const CENTRE_CHIP = {left: 80, dy: -10.5}
const FOLLOW_CHIP = {left: 80, dy: -7.7}
/** 20:339 reticle (head-locked): 58 px ring, 3 px, white 95 %. */
const RETICLE_R = 29
const RETICLE_STROKE = 3
const RETICLE_RENDER_ORDER = 900
const LABEL_PX = 24

type TargetView = {group: SceneObject; active: SceneObject; next: SceneObject; chip: Chip; word: string}

/**
 * 4d · Active HUD — Head mode · Look up & down (20:288). Each rep: up, then down. Targets sit
 * at today's pitch range × pace, world-locked relative to the Neutral Forward Vector, with the
 * centre marker at 0°. The active target is solid emerald, the other one dashed ("next"). The
 * pacer dot leads centre → target at ≤ PACER_DEG_S along the dotted path and the head-locked
 * reticle follows it; on target a hold ring fills over HOLD_S (chime), then the dot leads back.
 * Faster than TOO_FAST_DEG_S → the dot stops, amber "Slower, please", rep not counted.
 */
@component
export class Screen4d extends PacedHeadExercise {
  readonly screenId: ScreenId = "4d"
  protected readonly axis: PacerAxis = "pitch"

  private centre: SceneObject
  private up: TargetView
  private down: TargetView
  private path: WorldDots
  private pacerSo: SceneObject
  private follow: Chip
  private reticle: SceneObject

  /** The head-locked reticle is the aim mark here (as on 1b). */
  protected get showsAimDot(): boolean {
    return false
  }

  protected buildScreen(): void {
    this.path = new WorldDots(this.root, "Path", white(0.5), 0)

    this.centre = createChild(this.root, "Centre")
    new DashedRing(this.centre, "Ring", CENTRE_R, CENTRE_R - RING_STROKE, CENTRE_DASHES, white(0.5), 1)
    const centreChip = new Chip(this.centre, "Label", "Centre", {px: LABEL_PX, weight: Weight.Medium, color: Colors.vibrantSecondaryOnControl}, undefined, 1)
    place(centreChip.sceneObject, CENTRE_CHIP.left + centreChip.widthPx / 2, CENTRE_CHIP.dy, 0)

    this.up = this.buildTarget("Up")
    this.down = this.buildTarget("Down")
    this.createTimer(this.root, false)

    this.pacerSo = createChild(this.root, "Pacer")
    place(addPacerVisual(this.pacerSo, "Dot", 5), 0, 0, PACER_LAYER)
    this.pacer.dot = this.pacerSo
    this.follow = new Chip(
      this.pacerSo,
      "Follow",
      "Follow the dot — slowly",
      {px: 26, weight: Weight.SemiBold, color: Colors.textPrimary},
      {texture: Textures.up, px: 26, color: Colors.cyan},
      3
    )

    // Head-locked reticle on the head-aim ray (rigid: it is the aim).
    this.reticle = createChild(this.head.cameraTransform.getSceneObject(), "Reticle4d")
    this.reticle.getTransform().setLocalPosition(new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM))
    new Arc(this.reticle, "Ring", RETICLE_R, RETICLE_R - RETICLE_STROKE, withAlpha(Colors.textPrimary, 0.95), RETICLE_RENDER_ORDER)
    drawOnTop(this.reticle)
    this.reticle.enabled = false
  }

  private buildTarget(word: string): TargetView {
    const group = createChild(this.root, word)
    const active = createChild(group, "Active")
    addRoundedRect(active, "Fill", TARGET_R * 2, TARGET_R * 2, {fill: Colors.emerald10}, 1)
    const ring = new Arc(active, "Ring", TARGET_R, TARGET_R - TARGET_STROKE, Colors.emerald, 2)
    place(ring.sceneObject, 0, 0, 1)
    const next = createChild(group, "Next")
    new DashedRing(next, "Ring", NEXT_R, NEXT_R - RING_STROKE, NEXT_DASHES, white(0.35), 1, NEXT_DUTY)
    const chip = new Chip(group, "Label", word, {px: LABEL_PX, weight: Weight.SemiBold, color: Colors.textPrimary}, undefined, 1)
    return {group, active, next, chip, word}
  }

  protected computeSides(): PacedSide[] {
    const rom = this.store.rom
    const f = this.ctx.targetFactor
    return [
      {sign: 1, targetDeg: rom.pitchUpDeg * f},
      {sign: -1, targetDeg: rom.pitchDownDeg * f},
    ]
  }

  protected metric(): number {
    return this.head.pitchDeg
  }

  protected onShow(): void {
    this.reticle.enabled = true
    super.onShow()
  }

  protected onHide(): void {
    this.reticle.enabled = false
    super.onHide()
  }

  setCovered(covered: boolean): void {
    super.setCovered(covered)
    this.reticle.enabled = !covered && this.root.enabled
  }

  protected onSideStart(): void {
    const [upSide, downSide] = this.sides
    this.setPose(this.centre, this.neutralPose(0, 0))
    this.placeTarget(this.up, upSide, this.side === upSide)
    this.placeTarget(this.down, downSide, this.side === downSide)
    const activeView = this.side.sign > 0 ? this.up : this.down
    this.timer.sceneObject.setParent(activeView.group)
    place(this.timer.sceneObject, 0, 0, TIMER_LAYER)
    this.timer.sceneObject.enabled = false
    this.layoutPath()
  }

  private placeTarget(view: TargetView, side: PacedSide, active: boolean): void {
    this.setPose(view.group, this.neutralPose(0, side.sign * side.targetDeg))
    view.active.enabled = active
    view.next.enabled = !active
    view.chip.setText(`${view.word} · ${Math.round(side.targetDeg)}°`)
    if (active) view.chip.setStyle(Colors.textPrimary, Weight.SemiBold)
    else view.chip.setStyle(Colors.vibrantSecondaryOnControl, Weight.Medium)
    this.placeTargetChip(view, false)
  }

  private placeTargetChip(view: TargetView, ringShown: boolean): void {
    const left = (ringShown ? HOLD_RING_R : TARGET_R) + TARGET_CHIP_GAP
    place(view.chip.sceneObject, left + view.chip.widthPx / 2, TARGET_CHIP.dy, 0)
  }

  /** Dotted path along the pitch arc from just past the centre into the active target. */
  private layoutPath(): void {
    const degPerPx = (Math.atan(Config.PX_TO_CM / Config.WINDOW_Z_CM) * 180) / Math.PI
    const sign = this.side.sign
    const from = -sign * PATH_BEFORE_CENTRE * degPerPx
    const to = this.signedTarget - sign * (TARGET_R - PATH_INTO_TARGET) * degPerPx
    const step = PATH_PITCH * degPerPx
    const points: vec3[] = []
    for (let p = from; sign * (to - p) >= -1e-6; p += sign * step) {
      points.push(this.head.pointFromNeutral(0, p, Config.WINDOW_Z_CM))
    }
    this.path.setDots(points, (PATH_DOT / 2) * Config.PX_TO_CM, this.head.pointFromNeutral(0, 0, 0))
  }

  protected render(): void {
    const ringShown = this.phase === "hold" || this.timer.progress > 0
    if (ringShown !== this.timer.sceneObject.enabled) {
      this.timer.sceneObject.enabled = ringShown
      this.placeTargetChip(this.side.sign > 0 ? this.up : this.down, ringShown)
    }
    const moving = this.phase === "out" || this.phase === "back"
    this.follow.sceneObject.enabled = moving
    if (moving) {
      if (this.tooFast) {
        this.follow.setIconVisible(false)
        this.follow.setText("Slower, please", Colors.amber)
      } else {
        this.follow.setIconVisible(true)
        this.follow.setText("Follow the dot — slowly", Colors.textPrimary)
        const goingUp = this.phase === "out" ? this.side.sign > 0 : this.side.sign < 0
        this.follow.iconVisual.getSceneObject().getTransform().setLocalRotation(quat.angleAxis(goingUp ? 0 : Math.PI, vec3.forward()))
      }
      place(this.follow.sceneObject, FOLLOW_CHIP.left + this.follow.widthPx / 2, FOLLOW_CHIP.dy, 0)
    }
  }
}
