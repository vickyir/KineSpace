import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {CalibrationStore, HandSide} from "./CalibrationStore"
import {Config} from "./Config"
import {HeadMetrics} from "./HeadMetrics"

const RAD_TO_DEG = 180 / Math.PI

export type Finger = "index" | "middle" | "ring" | "pinky"
export const FINGERS: Finger[] = ["index", "middle", "ring", "pinky"]

/** Flexion in degrees: 0 = straight; tabletop MCP ≈ 90 (4f). */
export type FingerFlexion = {mcpDeg: number; pipDeg: number}

export type LowConfidenceReason = "" | "not tracked" | "hands overlap" | "keypoint jump"

/** Keypoints the metrics are computed from (SIK, or the dev mock hand). */
type Keypoints = {
  wrist: vec3
  thumb: vec3
  palm: vec3
  knuckles: Record<Finger, vec3>
  mids: Record<Finger, vec3>
  tips: Record<Finger, vec3>
}

// Dev mock hand (hand-local cm: +x toward the pinky of a right hand, +y toward the fingertips).
const MOCK_WRIST = new vec2(0, -9)
const MOCK_PALM = new vec2(0, -3)
const MOCK_THUMB_REST = new vec2(-5.5, -1.5)
const MOCK_FINGERS: Record<Finger, {x: number; mid: number; tip: number}> = {
  index: {x: -2.4, mid: 4, tip: 7.4},
  middle: {x: -0.7, mid: 4.4, tip: 8.2},
  ring: {x: 1, mid: 4, tip: 7.6},
  pinky: {x: 2.6, mid: 3, tip: 6},
}
/** Mock thumb: moves to one fingertip, rests there (contact), returns — then the next finger. */
const MOCK_MOVE_S = 0.6
const MOCK_CONTACT_S = 1.4

function zeroPerFinger(): Record<Finger, number> {
  return {index: 0, middle: 0, ring: 0, pinky: 0}
}

/** Angle in degrees between two segments (0 when they continue in a straight line). */
function flexionDeg(a: vec3, b: vec3, c: vec3): number {
  const v1 = b.sub(a)
  const v2 = c.sub(b)
  if (v1.length < 1e-4 || v2.length < 1e-4) return 0
  return v1.angleTo(v2) * RAD_TO_DEG
}

/**
 * HandMetrics — metrics of the chosen hand (1d) from SIK HandInputData → TrackedHand keypoints:
 * thumb-tip → finger-tip distances (opposition, 3 / 4a), finger spread (sum of neighbouring
 * fingertip distances, 1d), MCP / PIP flexion and tip-to-palm distances (tendon gliding, 4f),
 * palm facing (isFacingCamera / getFacingCameraAngle) and a debounced tracking state (4g).
 *
 * SIK exposes no confidence value, so "low confidence" = not tracked, both palms overlapping,
 * or a keypoint jumping implausibly far in one frame (DEVIATIONS.md P10).
 */
@component
export class HandMetrics extends BaseScriptComponent {
  static instance: HandMetrics

  tracked = false
  /** Debounced: false after TRACK_LOST_S of low confidence, true after RESUME_STABLE_S of stable tracking. */
  trackingGood = false
  lowConfidence: LowConfidenceReason = "not tracked"
  thumbToTipCm: Record<Finger, number> = zeroPerFinger()
  tipToPalmCm: Record<Finger, number> = zeroPerFinger()
  fingerSpreadCm = 0
  flexion: Record<Finger, FingerFlexion> = {
    index: {mcpDeg: 0, pipDeg: 0},
    middle: {mcpDeg: 0, pipDeg: 0},
    ring: {mcpDeg: 0, pipDeg: 0},
    pinky: {mcpDeg: 0, pipDeg: 0},
  }
  facingCamera = false
  facingAngleDeg: number | null = null
  palmCenter: vec3 | null = null

  @input
  @hint("Dev only: simulate the chosen hand in the hand zone (the Preview has no hand tracking). The thumb touches each fingertip in turn.")
  devMockHand: boolean = false

  private readonly lostEvent = new Event<void>()
  readonly onTrackingLost: PublicApi<void> = this.lostEvent.publicApi()
  private readonly resumedEvent = new Event<void>()
  readonly onTrackingResumed: PublicApi<void> = this.resumedEvent.publicApi()

  private sideValue: HandSide = "right"
  private lowFor = 0
  private stableFor = 0
  private previousPoints: vec3[] | null = null
  private points: Keypoints | null = null

  onAwake() {
    HandMetrics.instance = this
    this.createEvent("OnStartEvent").bind(() => {
      this.sideValue = CalibrationStore.instance?.hand ?? "right"
    })
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  get side(): HandSide {
    return this.sideValue
  }

  /** Seconds of continuous low confidence (0 while tracking is stable). */
  get lowConfidenceS(): number {
    return this.lowFor
  }

  /** Chooses the training hand (1d selector) and persists it. */
  setSide(side: HandSide): void {
    this.sideValue = side
    this.previousPoints = null
    CalibrationStore.instance?.setHand(side)
  }

  get hand(): TrackedHand {
    return HandInputData.getInstance().getHand(this.sideValue)
  }

  get otherHand(): TrackedHand {
    return HandInputData.getInstance().getHand(this.sideValue === "right" ? "left" : "right")
  }

  /** Thumb tip of the training hand (valid while `tracked`). */
  thumbTip(): vec3 {
    return this.points ? this.points.thumb : this.hand.thumbTip.position
  }

  fingerTip(finger: Finger): vec3 {
    return this.points ? this.points.tips[finger] : readKeypoints(this.hand).tips[finger]
  }

  private update(): void {
    const dt = getDeltaTime()
    const hand = this.hand
    this.tracked = this.devMockHand || hand.isTracked()
    this.lowConfidence = this.tracked ? "" : "not tracked"

    if (this.tracked) {
      this.points = this.devMockHand ? this.mockKeypoints() : readKeypoints(hand)
      this.measure(this.points)
      this.facingCamera = this.devMockHand || hand.isFacingCamera()
      this.facingAngleDeg = this.devMockHand ? 0 : hand.getFacingCameraAngle()
      const other = this.otherHand
      const otherPalm = !this.devMockHand && other.isTracked() ? other.getPalmCenter() : null
      if (this.palmCenter && otherPalm && this.palmCenter.distance(otherPalm) < Config.HANDS_OVERLAP_CM) {
        this.lowConfidence = "hands overlap"
      } else if (this.jumped(this.points)) {
        this.lowConfidence = "keypoint jump"
      }
    } else {
      this.points = null
      this.previousPoints = null
    }

    if (this.lowConfidence !== "") {
      this.lowFor += dt
      this.stableFor = 0
      if (this.trackingGood && this.lowFor >= Config.TRACK_LOST_S) {
        this.trackingGood = false
        this.lostEvent.invoke()
      }
    } else {
      this.stableFor += dt
      this.lowFor = 0
      if (!this.trackingGood && this.stableFor >= Config.RESUME_STABLE_S) {
        this.trackingGood = true
        this.resumedEvent.invoke()
      }
    }
  }

  private measure(points: Keypoints): void {
    const thumb = points.thumb
    const tips = points.tips
    this.palmCenter = points.palm
    for (const f of FINGERS) {
      this.thumbToTipCm[f] = thumb.distance(tips[f])
      this.tipToPalmCm[f] = this.palmCenter ? this.palmCenter.distance(tips[f]) : 0
    }
    // 20:939: sum of distances between neighbouring fingertips (thumb → index → … → pinky).
    this.fingerSpreadCm =
      thumb.distance(tips.index) + tips.index.distance(tips.middle) + tips.middle.distance(tips.ring) + tips.ring.distance(tips.pinky)

    // 20:939 / 4f: angles from wrist → MCP, MCP → PIP, PIP → TIP.
    for (const f of FINGERS) {
      const mcp = points.knuckles[f]
      const pip = points.mids[f]
      this.flexion[f] = {mcpDeg: flexionDeg(points.wrist, mcp, pip), pipDeg: flexionDeg(mcp, pip, tips[f])}
    }
  }

  /** True when the wrist or a fingertip moved more than KEYPOINT_JUMP_CM since last frame. */
  private jumped(keypoints: Keypoints): boolean {
    const points = [keypoints.wrist, keypoints.thumb, ...FINGERS.map((f) => keypoints.tips[f])]
    const previous = this.previousPoints
    this.previousPoints = points
    if (!previous) return false
    return points.some((p, i) => p.distance(previous[i]) > Config.KEYPOINT_JUMP_CM)
  }

  /**
   * Dev mock: an open hand, palm toward the camera, in the hand zone (HAND_ZONE_PITCH_DEG,
   * HAND_ZONE_REACH_CM below the look direction); the thumb visits index → pinky in turn.
   */
  private mockKeypoints(): Keypoints {
    const head = HeadMetrics.instance
    const cam = head.cameraTransform
    const pitch = (Config.HAND_ZONE_PITCH_DEG * Math.PI) / 180
    const look = head.lookDirection
    const up = cam.up
    const right = cam.right
    const centre = head.headPosition.add(look.uniformScale(Math.cos(pitch) * Config.HAND_ZONE_REACH_CM)).add(up.uniformScale(Math.sin(pitch) * Config.HAND_ZONE_REACH_CM))
    const mirror = this.sideValue === "right" ? 1 : -1
    const at = (x: number, y: number) => centre.add(right.uniformScale(x * mirror)).add(up.uniformScale(y))
    const perFinger = (pick: (f: {x: number; mid: number; tip: number}) => vec3): Record<Finger, vec3> => ({
      index: pick(MOCK_FINGERS.index),
      middle: pick(MOCK_FINGERS.middle),
      ring: pick(MOCK_FINGERS.ring),
      pinky: pick(MOCK_FINGERS.pinky),
    })
    const tips2 = (f: {x: number; tip: number}) => new vec2(f.x, f.tip)
    const cycle = MOCK_MOVE_S * 2 + MOCK_CONTACT_S
    const t = getTime() % (cycle * FINGERS.length)
    const target = tips2(MOCK_FINGERS[FINGERS[Math.floor(t / cycle)]])
    const phase = t % cycle
    const k = phase < MOCK_MOVE_S ? phase / MOCK_MOVE_S : phase < MOCK_MOVE_S + MOCK_CONTACT_S ? 1 : 1 - (phase - MOCK_MOVE_S - MOCK_CONTACT_S) / MOCK_MOVE_S
    const thumb = MOCK_THUMB_REST.add(target.sub(MOCK_THUMB_REST).uniformScale(k))
    return {
      wrist: at(MOCK_WRIST.x, MOCK_WRIST.y),
      palm: at(MOCK_PALM.x, MOCK_PALM.y),
      thumb: at(thumb.x, thumb.y),
      knuckles: perFinger((f) => at(f.x, 0)),
      mids: perFinger((f) => at(f.x, f.mid)),
      tips: perFinger((f) => at(f.x, f.tip)),
    }
  }
}

function readKeypoints(hand: TrackedHand): Keypoints {
  return {
    wrist: hand.wrist.position,
    thumb: hand.thumbTip.position,
    palm: hand.getPalmCenter() ?? hand.wrist.position,
    knuckles: {index: hand.indexKnuckle.position, middle: hand.middleKnuckle.position, ring: hand.ringKnuckle.position, pinky: hand.pinkyKnuckle.position},
    mids: {index: hand.indexMidJoint.position, middle: hand.middleMidJoint.position, ring: hand.ringMidJoint.position, pinky: hand.pinkyMidJoint.position},
    tips: {index: hand.indexTip.position, middle: hand.middleTip.position, ring: hand.ringTip.position, pinky: hand.pinkyTip.position},
  }
}
