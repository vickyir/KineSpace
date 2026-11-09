import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {smoothDamp} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"
import {Config} from "../Config"

/** Fraction of the remaining rotation closed per smoothTime (≈ 95 %). */
const ROTATION_SETTLE = 3

/**
 * LazyFollow — soft head-lock (4:4: "lazy-follow 0.4 s — never rigidly glued"). Keeps this
 * object on the camera pose with a damped lag. Children are laid out in camera space (cm),
 * typically with canvasPosition(). Used for the HUD bar, phase strip and edge arrow.
 */
@component
export class LazyFollow extends BaseScriptComponent {
  smoothTime = Config.LAZY_FOLLOW_S

  private camera: Transform
  private transform: Transform
  private velocity = vec3.zero()

  onAwake() {
    this.camera = WorldCameraFinderProvider.getInstance().getTransform()
    this.transform = this.getTransform()
    this.createEvent("OnStartEvent").bind(() => this.snap())
    this.createEvent("OnEnableEvent").bind(() => this.snap())
    this.createEvent("UpdateEvent").bind(() => this.follow())
  }

  /** Jumps to the camera pose without lag (on show). */
  snap(): void {
    this.transform.setWorldPosition(this.camera.getWorldPosition())
    this.transform.setWorldRotation(this.camera.getWorldRotation())
    this.velocity = vec3.zero()
  }

  private follow(): void {
    const dt = getDeltaTime()
    const pos = this.transform.getWorldPosition()
    const target = this.camera.getWorldPosition()
    const [x, vx] = smoothDamp(pos.x, target.x, this.velocity.x, this.smoothTime, dt)
    const [y, vy] = smoothDamp(pos.y, target.y, this.velocity.y, this.smoothTime, dt)
    const [z, vz] = smoothDamp(pos.z, target.z, this.velocity.z, this.smoothTime, dt)
    this.velocity = new vec3(vx, vy, vz)
    this.transform.setWorldPosition(new vec3(x, y, z))
    const t = 1 - Math.exp((-ROTATION_SETTLE * dt) / this.smoothTime)
    this.transform.setWorldRotation(quat.slerp(this.transform.getWorldRotation(), this.camera.getWorldRotation(), t))
  }
}
