import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CalibrationStore} from "./CalibrationStore"
import {Config} from "./Config"

const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180
/** Low-pass time constant for angular speed, so single-frame tracking jitter never reads as "too fast". */
const SPEED_FILTER_S = 0.1

/** Wraps an angle to (−180, 180]. */
function wrapDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/**
 * HeadMetrics — head pose relative to the Neutral Forward Vector (1b), from the camera
 * transform (Device Tracking, world mode, gravity-aligned):
 *   yaw   + = turned right  (4b)
 *   pitch + = looking up    (4d)
 *   roll  + = right ear toward right shoulder (4e)
 * plus angular speed (deg/s, for TOO_FAST) and head-height drop (shoulder compensation, 4e).
 */
@component
export class HeadMetrics extends BaseScriptComponent {
  static instance: HeadMetrics

  yawDeg = 0
  pitchDeg = 0
  rollDeg = 0
  speedDegS = 0
  heightDropCm = 0

  private camera: Transform
  private neutralSet = false
  private neutralHeading = 0
  private neutralPitch = 0
  private neutralRoll = 0
  private neutralHeight = 0
  private neutralPosition = vec3.zero()
  private previousRotation: quat | null = null

  onAwake() {
    HeadMetrics.instance = this
    this.camera = WorldCameraFinderProvider.getInstance().getTransform()
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  get hasNeutral(): boolean {
    return this.neutralSet
  }

  get cameraTransform(): Transform {
    return this.camera
  }

  get headPosition(): vec3 {
    return this.camera.getWorldPosition()
  }

  /** Direction the head points (camera forward; the camera looks down its −Z). */
  get lookDirection(): vec3 {
    return this.camera.back
  }

  /**
   * Head-aim ray: from the eye through the display centre (0, LAYOUT_Y0_CM, −WINDOW_Z_CM in camera
   * space), where the Aim dot sits. The display boresight is tilted down from camera forward.
   */
  get aimDirection(): vec3 {
    const local = new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM).normalize()
    return this.camera.getWorldRotation().multiplyVec3(local)
  }

  /** Captures the current head pose as the Neutral Forward Vector and persists it. */
  captureNeutral(): void {
    const look = this.lookDirection
    this.neutralHeading = this.heading(look)
    this.neutralPitch = this.pitch(look)
    this.neutralRoll = this.roll()
    this.neutralPosition = this.headPosition
    this.neutralHeight = this.neutralPosition.y
    this.neutralSet = true
    CalibrationStore.instance?.setNeutral(look, this.neutralHeight)
    this.update()
  }

  clearNeutral(): void {
    this.neutralSet = false
  }

  /** World direction at (yaw, pitch) degrees from the Neutral Forward Vector. */
  directionFromNeutral(yawDeg: number, pitchDeg: number): vec3 {
    const h = (this.neutralHeading + yawDeg) * DEG_TO_RAD
    const p = (this.neutralPitch + pitchDeg) * DEG_TO_RAD
    return new vec3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p))
  }

  /** World point at (yaw, pitch) from the neutral head position, `distanceCm` away. */
  pointFromNeutral(yawDeg: number, pitchDeg: number, distanceCm: number): vec3 {
    return this.neutralPosition.add(this.directionFromNeutral(yawDeg, pitchDeg).uniformScale(distanceCm))
  }

  /** Rotation that faces the user from a point placed with pointFromNeutral(). */
  rotationFacingNeutral(yawDeg: number, pitchDeg: number): quat {
    const dir = this.directionFromNeutral(yawDeg, pitchDeg)
    return quat.lookAt(dir.uniformScale(-1), vec3.up())
  }

  /** Angle in degrees between the head-aim ray and the direction to `worldPoint`. */
  aimErrorDeg(worldPoint: vec3): number {
    const to = worldPoint.sub(this.headPosition).normalize()
    return this.aimDirection.angleTo(to) * RAD_TO_DEG
  }

  private heading(dir: vec3): number {
    return Math.atan2(dir.x, -dir.z) * RAD_TO_DEG
  }

  private pitch(dir: vec3): number {
    return Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z)) * RAD_TO_DEG
  }

  private roll(): number {
    const right = this.camera.right
    return Math.atan2(-right.y, Math.sqrt(right.x * right.x + right.z * right.z)) * RAD_TO_DEG
  }

  private update(): void {
    const dt = getDeltaTime()
    const look = this.lookDirection
    const heading = this.heading(look)
    const pitch = this.pitch(look)
    const roll = this.roll()
    this.yawDeg = wrapDeg(heading - (this.neutralSet ? this.neutralHeading : 0))
    this.pitchDeg = pitch - (this.neutralSet ? this.neutralPitch : 0)
    this.rollDeg = wrapDeg(roll - (this.neutralSet ? this.neutralRoll : 0))
    this.heightDropCm = this.neutralSet ? this.neutralHeight - this.headPosition.y : 0

    const rotation = this.camera.getWorldRotation()
    if (this.previousRotation && dt > 0) {
      const instant = (quat.angleBetween(this.previousRotation, rotation) * RAD_TO_DEG) / dt
      const k = 1 - Math.exp(-dt / SPEED_FILTER_S)
      this.speedDegS += (instant - this.speedDegS) * k
    }
    this.previousRotation = rotation
  }
}
