import {Colors, Silhouettes, Textures, Weight, white} from "../Theme"
import {Badge} from "../ui/Badge"
import {PhysioButton} from "../ui/PhysioButton"
import {addImage, addRoundedRect, addText, createChild, DashedLine, place, roundedRectOutline} from "../ui/Primitives"
import {Window} from "../ui/Window"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 20:564 — Tracking Lost Card 20:604 at (60, 252), 880 × 747. Child positions are canvas centres, px.
const CARD = {x: 60, y: 252, w: 880, h: 747}
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD.h / 2
const TEXT_W = 765
/** 20:606 tracking zone: 420 × 240, radius 36, white 5 %, 2.5 px dashed border (10 on / 7.5 off) white 60 %. */
const ZONE = {x: 470, y: 433.5, w: 420, h: 240, radius: 36, border: 2.5, dash: 10, gap: 7.5}
/** 20:607 "Tracking zone" — 22 px in Figma, raised to the 24 px minimum (DEVIATIONS.md F26); left edge 284. */
const ZONE_LABEL = {x: 284, y: 344}
/** 20:608 hand outside the zone, 20:610 move-back arrow. */
const HAND = {x: 694.4, y: 499.6, w: 148.8, h: 192.2}
const ARROW = {x: 590, y: 503.5, w: 80, h: 40}
const TITLE_Y = 624
const BODY_Y = 713.5
const BADGE_Y = 803
const BUTTON_Y = 903.5

/**
 * 4g · State — Tracking lost / hand out of view (20:564). Shown by the SessionStateMachine over
 * a hand-tracked step (3, 4a, 4f) when tracking confidence is low for TRACK_LOST_S or both hands
 * overlap; the step underneath is frozen and hidden, so no rep fails. Resumes on its own after
 * RESUME_STABLE_S of stable tracking ("Hand back in view"). "End exercise" moves on.
 */
@component
export class Screen4g extends ScreenBase {
  readonly screenId: ScreenId = "4g"

  private window: Window

  protected build(): void {
    const so = createChild(this.root, "TrackingLostCard")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = CARD.w
    this.window.heightPx = CARD.h
    this.window.initialize()
    const c = this.window.content
    const at = (item: SceneObject, x: number, y: number) => this.placeCanvas(item, x, y, CARD_CX, CARD_CY, 1)

    // Tracking zone illustration 20:605.
    const zone = createChild(c, "TrackingZone")
    at(zone, ZONE.x, ZONE.y)
    addRoundedRect(zone, "Fill", ZONE.w, ZONE.h, {fill: white(0.05), radiusPx: ZONE.radius}, 1)
    const border = new DashedLine(zone, "Border", white(0.6), 2)
    const inset = ZONE.border
    border.setPath(roundedRectOutline(ZONE.w - inset, ZONE.h - inset, ZONE.radius - inset / 2), true, ZONE.border, ZONE.dash, ZONE.gap)
    place(border.sceneObject, 0, 0, 1)
    const label = addText(c, "ZoneLabel", "Tracking zone", {px: 24, weight: Weight.Medium, color: Colors.vibrantSecondary}, 3)
    at(label.getSceneObject(), ZONE_LABEL.x, ZONE_LABEL.y)
    const arrow = addImage(c, "MoveBack", Textures.moveBackArrow, ARROW.w, ARROW.h, Colors.amber, 3)
    at(arrow.getSceneObject(), ARROW.x, ARROW.y)
    const hand = addImage(c, "HandOutside", Silhouettes.handOutsideZone, HAND.w, HAND.h, white(1), 3)
    at(hand.getSceneObject(), HAND.x, HAND.y)

    const title = addText(
      c,
      "Title",
      "Bring your hand back into view",
      {px: 44, weight: Weight.Bold, color: Colors.textPrimary, align: "center", wrapWidthPx: TEXT_W, trackingPx: -0.66},
      3
    )
    at(title.getSceneObject(), 500, TITLE_Y)
    const body = addText(
      c,
      "Body",
      "Hold it at chest height with your palm facing you. Use one hand at a time.",
      {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: TEXT_W, lineHeight: 1.4, trackingPx: -0.224},
      3
    )
    at(body.getSceneObject(), 500, BODY_Y)

    const badgeSo = createChild(c, "Badge")
    const badge = badgeSo.createComponent(Badge.getTypeName()) as Badge
    badge.tone = "Info"
    badge.text = "Timer paused — resumes when your hand is seen"
    badge.initialize()
    at(badgeSo, 500, BADGE_Y)

    const buttonSo = createChild(c, "EndExercise")
    const button = buttonSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = "End exercise"
    button.style = "Secondary"
    button.initialize()
    button.onPressed.add(() => this.sm.endExercise())
    at(buttonSo, 500, BUTTON_Y)
  }

  protected onShow(): void {
    const pose = this.spawnPose(CARD_CX, CARD_CY)
    this.window.spawn(pose.position, pose.rotation)
  }
}
