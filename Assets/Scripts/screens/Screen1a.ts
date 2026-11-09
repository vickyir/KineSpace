import {AudioCues} from "../AudioCues"
import {Colors, Weight} from "../Theme"
import {Badge} from "../ui/Badge"
import {PhysioButton} from "../ui/PhysioButton"
import {addText, createChild} from "../ui/Primitives"
import {Window} from "../ui/Window"
import {addStepIndicator} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:5 — Welcome Card 5:6 at (60, 368), 880 × 744. Child positions are canvas centres, px.
const CARD = {x: 60, y: 368, w: 880, h: 744}
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD.h / 2
const TEXT_W = 765

/**
 * 1a · Onboarding — Step 1 · Safety. Single centred glass card, world-locked where it spawns
 * with lazy-follow. "I understand" accepts pinch, voice and head-aim dwell (the safe default
 * before hand tracking is calibrated). VO reads the title and safety line; the badge pulses once.
 */
@component
export class Screen1a extends ScreenBase {
  readonly screenId: ScreenId = "1a"

  private window: Window
  private badge: Badge

  protected build(): void {
    const so = createChild(this.root, "WelcomeCard")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = CARD.w
    this.window.heightPx = CARD.h
    this.window.initialize()
    const c = this.window.content
    const at = (item: SceneObject, x: number, y: number) => this.placeCanvas(item, x, y, CARD_CX, CARD_CY, 1)

    at(addStepIndicator(c, 1, 4).so, 500.5, 432.5)
    const title = addText(
      c,
      "Title",
      "Welcome to your therapy space",
      {px: 52, weight: Weight.Bold, color: Colors.textPrimary, align: "center", wrapWidthPx: TEXT_W, lineHeight: 1.15, trackingPx: -0.78},
      3
    )
    at(title.getSceneObject(), 500.5, 534)
    const body = addText(
      c,
      "Body",
      "Daily home exercises for your neck and hands — about 7 minutes, 2–3 times a day.",
      {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: TEXT_W, lineHeight: 1.4, trackingPx: -0.224},
      3
    )
    at(body.getSceneObject(), 500.5, 661)

    const badgeSo = createChild(c, "Badge")
    this.badge = badgeSo.createComponent(Badge.getTypeName()) as Badge
    this.badge.tone = "Safety"
    this.badge.text = "Move only within a pain-free range"
    this.badge.initialize()
    at(badgeSo, 500, 754.5)

    const safety = addText(
      c,
      "Safety",
      "Only do movements you can already do on your own. Stop if you feel sharp pain, numbness or dizziness.",
      {px: 24, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: TEXT_W, lineHeight: 1.4},
      3
    )
    at(safety.getSceneObject(), 500.5, 844)

    const buttonSo = createChild(c, "Button")
    const button = buttonSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = "I understand"
    button.style = "Primary"
    button.initialize()
    button.onPressed.add(() => this.sm.next())
    at(buttonSo, 500, 956)

    const hint = addText(
      c,
      "Hint",
      "Pinch, say the button’s name, or aim the centre dot at it for 3 s",
      {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary, align: "center"},
      3
    )
    at(hint.getSceneObject(), 500, 1048.5)
  }

  protected onShow(): void {
    const pose = this.spawnPose(CARD_CX, CARD_CY)
    this.window.spawn(pose.position, pose.rotation)
    this.badge.pulse()
    AudioCues.instance.speak("welcome", "safety")
  }
}
