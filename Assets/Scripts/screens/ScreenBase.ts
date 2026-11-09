import {CalibrationStore} from "../CalibrationStore"
import {Config} from "../Config"
import {HeadAimDwell} from "../HeadAimDwell"
import {HeadMetrics} from "../HeadMetrics"
import {SessionStateMachine} from "../SessionStateMachine"
import {LazyFollow} from "../ui/LazyFollow"
import {canvasPosition, createChild, place} from "../ui/Primitives"
import {ScreenController, ScreenId, SessionContext} from "./ScreenTypes"

/** Figma canvas centre, px. */
export const CANVAS_CX = 500
export const CANVAS_CY = 700

/**
 * ScreenBase — shared plumbing for screens/Screen*.ts: registers with the SessionStateMachine
 * (which owns visibility), builds the screen once on first show, ticks it every frame while it
 * is visible and not frozen, and provides the three anchoring modes of 4:4:
 *   spawnPose()    world-locked where the user looks (windows, 1b target)
 *   neutralPose()  world-locked relative to the Neutral Forward Vector (4b / 4d / 4e targets)
 *   followRoot()   soft head-lock (LazyFollow, 1c / 1d)
 *   canvas(x, y)   Figma canvas px → local offset from the canvas centre
 * plus ghost guides (ghostRoot) and hand-anchored near-field content (pinToPoint).
 */
export abstract class ScreenBase extends BaseScriptComponent implements ScreenController {
  abstract readonly screenId: ScreenId

  protected root: SceneObject
  protected ctx: SessionContext
  protected frozen = false
  private built = false
  private shown = false
  private covered = false

  onAwake() {
    this.root = createChild(this.sceneObject, "Root")
    this.root.enabled = false
    SessionStateMachine.instance.registerScreen(this)
    this.createEvent("UpdateEvent").bind(() => {
      if (this.root.enabled && !this.frozen) this.tick(getDeltaTime())
    })
  }

  show(context: SessionContext): void {
    this.ctx = context
    this.frozen = false
    this.covered = false
    if (!this.built) {
      this.built = true
      this.build()
    }
    this.shown = true
    this.root.enabled = true
    HeadAimDwell.instance?.setAimDotVisible(this.showsAimDot)
    this.onShow()
  }

  hide(): void {
    if (!this.shown) return
    this.shown = false
    this.covered = false
    this.root.enabled = false
    HeadAimDwell.instance?.setAimDotVisible(true)
    this.onHide()
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen
  }

  /** 4g covers the screen: its content is hidden (and not ticked) but its state is kept. */
  setCovered(covered: boolean): void {
    if (!this.shown || this.covered === covered) return
    this.covered = covered
    this.root.enabled = !covered
    if (!covered) HeadAimDwell.instance?.setAimDotVisible(this.showsAimDot)
  }

  /** The Aim dot is the dwell cursor; screens with their own reticle (1b) hide it. */
  protected get showsAimDot(): boolean {
    return true
  }

  protected get sm(): SessionStateMachine {
    return SessionStateMachine.instance
  }

  protected get store(): CalibrationStore {
    return CalibrationStore.instance
  }

  protected get head(): HeadMetrics {
    return HeadMetrics.instance
  }

  /** Builds the screen's objects under `root` (called once). */
  protected abstract build(): void

  /** Resets state and re-anchors every time the screen opens. */
  protected onShow(): void {}

  protected onHide(): void {}

  /** Per-frame logic while visible and not frozen. */
  protected tick(_dt: number): void {}

  /**
   * World pose for content spawned straight ahead: the canvas point (xPx, yPx) placed in front
   * of the head, yaw-only so windows stay upright when the user looks down.
   */
  protected spawnPose(xPx = CANVAS_CX, yPx = CANVAS_CY): {position: vec3; rotation: quat} {
    const look = this.head.lookDirection
    const heading = Math.atan2(look.x, -look.z)
    const rotation = quat.angleAxis(-heading, vec3.up())
    const position = this.head.headPosition.add(rotation.multiplyVec3(canvasPosition(xPx, yPx)))
    return {position, rotation}
  }

  /**
   * World pose of canvas point (xPx, yPx) on a 110 cm canvas aimed (yawDeg, pitchDeg) from the
   * Neutral Forward Vector: when the head points exactly there, the content looks as drawn.
   */
  protected neutralPose(yawDeg: number, pitchDeg: number, xPx = CANVAS_CX, yPx = CANVAS_CY): {position: vec3; rotation: quat} {
    const rotation = this.head.rotationFacingNeutral(yawDeg, pitchDeg)
    const position = this.head.pointFromNeutral(0, 0, 0).add(rotation.multiplyVec3(canvasPosition(xPx, yPx)))
    return {position, rotation}
  }

  /** Applies a world pose to `so`. */
  protected setPose(so: SceneObject, pose: {position: vec3; rotation: quat}): void {
    const t = so.getTransform()
    t.setWorldPosition(pose.position)
    t.setWorldRotation(pose.rotation)
  }

  /** Child of `root` that soft-head-locks; place children with canvasPosition(). */
  protected followRoot(name = "Follow"): SceneObject {
    const so = createChild(this.root, name)
    so.createComponent(LazyFollow.getTypeName())
    return so
  }

  /**
   * Group for a ghost guide (4:4: 0.8–1.0 m, 1:1 hand scale): it sits on the ray through canvas
   * point (xPx, yPx) at GHOST_DIST_CM and is scaled so it covers exactly its Figma size.
   * Children use place() in px relative to that point.
   */
  protected ghostRoot(parent: SceneObject, xPx: number, yPx: number, name = "Ghost"): SceneObject {
    const so = createChild(parent, name)
    const k = Config.GHOST_DIST_CM / Config.WINDOW_Z_CM
    const t = so.getTransform()
    t.setLocalPosition(canvasPosition(xPx, yPx).uniformScale(k))
    t.setLocalScale(new vec3(k, k, k))
    return so
  }

  /**
   * Pins near-field content to a world point on the hand: faces the camera and keeps the angular
   * size it has on the 110 cm canvas, so its px sizes still read as Figma px. No text (4:4).
   */
  protected pinToPoint(so: SceneObject, point: vec3): void {
    const t = so.getTransform()
    t.setWorldPosition(point)
    t.setWorldRotation(this.head.cameraTransform.getWorldRotation())
    const scale = point.distance(this.head.headPosition) / Config.WINDOW_Z_CM
    t.setLocalScale(new vec3(scale, scale, scale))
  }

  /** Places `so` at Figma canvas point (x, y) relative to a parent centred at (cx, cy). */
  protected placeCanvas(so: SceneObject, xPx: number, yPx: number, cx = CANVAS_CX, cy = CANVAS_CY, layer = 0): void {
    place(so, xPx - cx, -(yPx - cy), layer)
  }

  /** Waits `seconds`, then runs `action` (unless the screen was hidden meanwhile). */
  protected after(seconds: number, action: () => void): void {
    const event = this.createEvent("DelayedCallbackEvent")
    event.bind(() => {
      if (this.root.enabled) action()
    })
    event.reset(seconds)
  }
}
