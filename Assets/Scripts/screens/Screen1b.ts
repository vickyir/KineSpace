import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {Colors, Textures, Weight, withAlpha} from "../Theme"
import {Badge} from "../ui/Badge"
import {addRoundedRect, addText, Arc, createChild} from "../ui/Primitives"
import {addDivider, addIconText, addStepIndicator, glassStyle, pillAround} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:66 — everything is laid out around the World Target 5:82 (centre 500, 670), px.
const RING_CX = 500
const RING_CY = 670
/** On device the ring sits at the canvas centre, i.e. straight ahead on the head-aim ray. */
const CANVAS_RING_X = 500
const CANVAS_RING_Y = 700
/** Reticle 5:87: 52 px ring, stroke 3, white 96 %. */
const RETICLE_R = 26
const RETICLE_STROKE = 3
const RETICLE_RENDER_ORDER = 900
/** Pause after capture before moving on, so the chime and full ring register. */
const CAPTURED_HOLD_S = 0.8

/**
 * 1b · Calibration — Step 2 · Neutral head. A target ring world-locked 1.1 m straight ahead at
 * eye height; a rigidly head-locked reticle on the head-aim ray. The ring fills over
 * NEUTRAL_HOLD_S while the aim error stays below NEUTRAL_MAX_ERR_DEG; drifting past
 * NEUTRAL_DRIFT_RESET_DEG resets it with a down-tone. On completion the Neutral Forward Vector
 * is captured. No hand input.
 */
@component
export class Screen1b extends ScreenBase {
  readonly screenId: ScreenId = "1b"

  private group: SceneObject
  private progressArc: Arc
  private holdText: Text
  private steady: SceneObject
  private reticle: SceneObject
  private progress = 0
  private captured = false

  protected get showsAimDot(): boolean {
    return false
  }

  protected build(): void {
    this.group = createChild(this.root, "WorldTarget")
    const g = this.group
    const at = (so: SceneObject, x: number, y: number, layer = 1) => this.placeCanvas(so, x, y, RING_CX, RING_CY, layer)

    // Step chip 5:67
    const chip = createChild(g, "StepChip")
    pillAround(
      chip,
      [
        addStepIndicator(chip, 2, 4),
        addDivider(chip, 32),
        addIconText(
          chip,
          "Posture",
          Textures.user,
          28,
          Colors.cyan,
          "Sit upright · shoulders relaxed",
          {px: 24, weight: Weight.Regular, color: Colors.textPrimary},
          10
        ),
      ],
      24,
      28,
      28,
      67,
      glassStyle()
    )
    at(chip, 500, 93.5)

    const title = addText(g, "Title", "Look at the ring", {px: 52, weight: Weight.Bold, color: Colors.textPrimary, align: "center", trackingPx: -0.78}, 3)
    at(title.getSceneObject(), 500, 261.5)
    const subtitle = addText(
      g,
      "Subtitle",
      "Setting your neutral forward position",
      {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", trackingPx: -0.224},
      3
    )
    at(subtitle.getSceneObject(), 500.5, 317)

    // World target 5:82: halo r200 cyan 10 %, track / progress r150–139.5, centre r10 emerald.
    const halo = addRoundedRect(g, "Halo", 400, 400, {fill: withAlpha(Colors.cyan, 0.1)}, 1)
    at(halo.sceneObject, RING_CX, RING_CY, 0)
    const track = new Arc(g, "Track", 150, 139.5, Colors.cyan20, 2)
    at(track.sceneObject, RING_CX, RING_CY, 1)
    this.progressArc = new Arc(g, "Progress", 150, 139.5, Colors.cyan, 3)
    at(this.progressArc.sceneObject, RING_CX, RING_CY, 2)
    const centre = addRoundedRect(g, "Centre", 20, 20, {fill: Colors.emerald}, 3)
    at(centre.sceneObject, RING_CX, RING_CY, 2)

    this.holdText = addText(g, "Hold", "", {px: 30, weight: Weight.SemiBold, color: Colors.cyan, align: "center"}, 3)
    at(this.holdText.getSceneObject(), 500.5, 928)

    this.steady = createChild(g, "Steady")
    const badge = this.steady.createComponent(Badge.getTypeName()) as Badge
    badge.tone = "Success"
    badge.text = "Head steady"
    badge.initialize()
    at(this.steady, 500.5, 996.5)

    // Head-locked reticle 5:87 on the head-aim ray (rigid: it is the aim).
    this.reticle = createChild(this.head.cameraTransform.getSceneObject(), "Reticle1b")
    this.reticle.getTransform().setLocalPosition(new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM))
    new Arc(this.reticle, "Ring", RETICLE_R, RETICLE_R - RETICLE_STROKE, withAlpha(Colors.textPrimary, 0.96), RETICLE_RENDER_ORDER)
    this.reticle.enabled = false
  }

  protected onShow(): void {
    // Ring straight ahead at eye height (yaw only), 1.1 m away; content laid out around it.
    const pose = this.spawnPose(CANVAS_RING_X, CANVAS_RING_Y)
    this.group.getTransform().setWorldPosition(pose.position)
    this.group.getTransform().setWorldRotation(pose.rotation)
    this.progress = 0
    this.captured = false
    this.reticle.enabled = true
    this.render()
  }

  protected onHide(): void {
    this.reticle.enabled = false
  }

  protected tick(dt: number): void {
    if (this.captured) return
    const ring = this.group.getTransform().getWorldPosition()
    const error = this.head.aimErrorDeg(ring)
    const onTarget = error < Config.NEUTRAL_MAX_ERR_DEG
    if (onTarget) {
      this.progress = Math.min(1, this.progress + dt / Config.NEUTRAL_HOLD_S)
    } else if (error > Config.NEUTRAL_DRIFT_RESET_DEG && this.progress > 0) {
      this.progress = 0
      AudioCues.instance.play("driftReset", ring)
    }
    this.steady.enabled = onTarget
    AudioCues.instance.approach(this.progress, ring)
    this.render()
    if (this.progress >= 1) {
      this.captured = true
      this.head.captureNeutral()
      AudioCues.instance.play("saved", ring)
      this.after(CAPTURED_HOLD_S, () => this.sm.next())
    }
  }

  private render(): void {
    this.progressArc.setFraction(this.progress)
    const remaining = Math.ceil((1 - this.progress) * Config.NEUTRAL_HOLD_S - 1e-6)
    this.holdText.text = `Hold still · ${Math.max(0, remaining)} s`
  }
}
