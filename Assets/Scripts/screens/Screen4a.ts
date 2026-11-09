import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {Finger, FINGERS, HandMetrics} from "../HandMetrics"
import {HoldTimer} from "../HoldTimer"
import {Colors, Weight, withAlpha} from "../Theme"
import {Badge} from "../ui/Badge"
import {FingertipBubble} from "../ui/Bubble"
import {addRoundedRect, addText, Arc, canvasPosition, createChild, place} from "../ui/Primitives"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:627, px.
const NEXT_Y = 233.7
const BADGE_Y = 287.5
/** Contact 15:308: r 24, 4 px emerald stroke, emerald 25 % fill. */
const CONTACT_R = 24
const CONTACT_STROKE = 4
/** Bubble pop 19:202: eight 14 px rays, 4 px wide, between r 38 and r 52. */
const BURST = {rays: 8, length: 14, width: 4, radius: 45}
const BURST_S = 0.5
/** Hold timer 3:108 at (140, 774), 240 px to the thumb side of the contact (380, 774). */
const TIMER_OFFSET = 240
/** Leader 15:310: 106 × 2 px, emerald 80 %, between the timer and the contact. */
const LEADER = {x: -83, w: 106, h: 2}
const NEAR_FIELD_ORDER = 800

/** "Next: pop the middle-finger bubble" / "Index bubble popped" (Figma); other fingers follow the pattern. */
const NEXT_NAMES: Record<Finger, string> = {index: "index-finger", middle: "middle-finger", ring: "ring-finger", pinky: "pinky"}
const POPPED_NAMES: Record<Finger, string> = {index: "Index", middle: "Middle", ring: "Ring", pinky: "Pinky"}

/**
 * 4a · Active HUD — Hand mode · Finger opposition (5:627). A bubble sits on each fingertip;
 * the next one is cyan, turns to a dashed amber target ring while the thumb approaches
 * (< OPPOSITION_APPROACH_CM, rising tone) and pops (emerald contact + burst, chime) after
 * thumb–tip contact (< OPPOSITION_CONTACT_CM) held OPPOSITION_HOLD_S. Each pop is one rep;
 * the order is index → pinky, then repeat. Near-field content is hand-anchored and has no text:
 * the hold timer beside the contact shows its ring only (DEVIATIONS.md P8). Instruction and
 * badge stay on the head-locked 110 cm plane; the SIK hand visual draws the tracked-hand outline.
 */
@component
export class Screen4a extends ScreenBase {
  readonly screenId: ScreenId = "4a"

  private nextText: Text
  private badgeSo: SceneObject
  private badge: Badge
  private readonly bubbles: FingertipBubble[] = []
  private contactGroup: SceneObject
  private contactMarker: SceneObject
  private burst: SceneObject
  private timerSo: SceneObject
  private timer: HoldTimer
  private leader: SceneObject
  private fingerIndex = 0
  private broken = false
  private burstT = BURST_S
  private burstFinger: Finger = "index"

  protected build(): void {
    const f = this.followRoot()
    this.nextText = addText(f, "Next", "", {px: 26, weight: Weight.Medium, color: Colors.vibrantSecondary, align: "center"}, 3)
    this.nextText.getSceneObject().getTransform().setLocalPosition(canvasPosition(500, NEXT_Y))

    this.badgeSo = createChild(f, "PoppedBadge")
    this.badge = this.badgeSo.createComponent(Badge.getTypeName()) as Badge
    this.badge.tone = "Success"
    this.badge.text = "Index bubble popped"
    this.badge.initialize()
    this.badgeSo.getTransform().setLocalPosition(canvasPosition(500, BADGE_Y))

    // Near field (hand-anchored, no text).
    FINGERS.forEach((finger) => this.bubbles.push(new FingertipBubble(this.root, `Bubble_${finger}`, NEAR_FIELD_ORDER)))

    this.contactGroup = createChild(this.root, "Contact")
    this.contactMarker = createChild(this.contactGroup, "Marker")
    addRoundedRect(this.contactMarker, "Fill", CONTACT_R * 2, CONTACT_R * 2, {fill: withAlpha(Colors.emerald, 0.25)}, NEAR_FIELD_ORDER + 3)
    const ring = new Arc(this.contactMarker, "Ring", CONTACT_R + CONTACT_STROKE / 2, CONTACT_R - CONTACT_STROKE / 2, Colors.emerald, NEAR_FIELD_ORDER + 4)
    place(ring.sceneObject, 0, 0, 1)

    this.burst = createChild(this.contactGroup, "Burst")
    for (let i = 0; i < BURST.rays; i++) {
      const pivot = createChild(this.burst, `Ray${i}`)
      pivot.getTransform().setLocalRotation(quat.angleAxis((-i * 2 * Math.PI) / BURST.rays, vec3.forward()))
      const ray = addRoundedRect(pivot, "Ray", BURST.width, BURST.length, {fill: Colors.emerald}, NEAR_FIELD_ORDER + 4)
      place(ray.sceneObject, 0, BURST.radius, 1)
    }

    this.timerSo = createChild(this.contactGroup, "HoldTimer")
    this.timer = this.timerSo.createComponent(HoldTimer.getTypeName()) as HoldTimer
    this.timer.holdSeconds = Config.OPPOSITION_HOLD_S
    this.timer.showReadout = false
    this.timer.initialize()
    this.timer.onComplete.add(() => this.pop())
    this.leader = addRoundedRect(this.contactGroup, "Leader", LEADER.w, LEADER.h, {fill: withAlpha(Colors.emerald, 0.8), radiusPx: 0}, NEAR_FIELD_ORDER + 2).sceneObject
  }

  protected onShow(): void {
    this.fingerIndex = 0
    this.broken = false
    this.burstT = BURST_S
    this.timer.reset()
    this.badgeSo.enabled = false
    // The timer sits on the thumb side: left of a right hand (Figma), right of a left hand.
    const side = HandMetrics.instance.side === "right" ? 1 : -1
    place(this.timerSo, -TIMER_OFFSET * side, 0, 0)
    place(this.leader, LEADER.x * side, 0, 0)
    this.renderNext()
    this.setNearFieldVisible(false)
  }

  setFrozen(frozen: boolean): void {
    super.setFrozen(frozen)
    if (frozen) this.setNearFieldVisible(false)
  }

  protected tick(dt: number): void {
    const hand = HandMetrics.instance
    const finger = FINGERS[this.fingerIndex]
    const gap = hand.thumbToTipCm[finger]
    const contact = hand.trackingGood && gap < Config.OPPOSITION_CONTACT_CM
    if (!contact && this.timer.progress > 0) this.broken = true
    this.timer.tick(dt, contact) // may pop() and advance to the next finger
    this.burstT += dt

    if (!hand.tracked) {
      this.setNearFieldVisible(false)
      AudioCues.instance.approach(0)
      return
    }
    const current = FINGERS[this.fingerIndex]
    const currentGap = hand.thumbToTipCm[current]
    const inContact = hand.trackingGood && currentGap < Config.OPPOSITION_CONTACT_CM
    const approaching = !inContact && currentGap < Config.OPPOSITION_APPROACH_CM
    const span = Config.OPPOSITION_APPROACH_CM - Config.OPPOSITION_CONTACT_CM
    AudioCues.instance.approach(inContact ? 1 : approaching ? (Config.OPPOSITION_APPROACH_CM - currentGap) / span : 0)

    FINGERS.forEach((f, i) => {
      const bubble = this.bubbles[i]
      const shown = i > this.fingerIndex || (i === this.fingerIndex && !inContact)
      bubble.sceneObject.enabled = shown
      if (!shown) return
      bubble.setState(i > this.fingerIndex ? "idle" : approaching ? "approaching" : "next")
      this.pinToPoint(bubble.sceneObject, hand.fingerTip(f))
    })

    const bursting = this.burstT < BURST_S
    const anchor = bursting ? this.burstFinger : current
    const holding = this.timer.progress > 0
    this.contactGroup.enabled = inContact || holding || bursting
    if (this.contactGroup.enabled) {
      const point = hand.thumbTip().add(hand.fingerTip(anchor)).uniformScale(0.5)
      this.pinToPoint(this.contactGroup, point)
      this.contactMarker.enabled = inContact || bursting
      this.burst.enabled = bursting
      this.timerSo.enabled = holding
      this.leader.enabled = holding
    }
  }

  private pop(): void {
    const finger = FINGERS[this.fingerIndex]
    const smooth = !this.broken
    AudioCues.instance.play("reached")
    this.burstFinger = finger
    this.burstT = 0
    this.badge.setText(`${POPPED_NAMES[finger]} bubble popped`)
    this.badgeSo.enabled = true
    this.badge.pulse()
    this.fingerIndex = (this.fingerIndex + 1) % FINGERS.length
    this.broken = false
    this.timer.reset()
    this.renderNext()
    // Last: completing the set moves the session on (and may hide this screen).
    this.sm.completeRep(smooth)
  }

  private renderNext(): void {
    this.nextText.text = `Next: pop the ${NEXT_NAMES[FINGERS[this.fingerIndex]]} bubble`
  }

  private setNearFieldVisible(visible: boolean): void {
    this.bubbles.forEach((b) => (b.sceneObject.enabled = visible))
    this.contactGroup.enabled = visible
  }
}
