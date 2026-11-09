import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {Colors, Textures, Weight, withAlpha} from "../Theme"
import {Badge} from "../ui/Badge"
import {PhysioButton} from "../ui/PhysioButton"
import {addRoundedRect, addText, Arc, createChild, place} from "../ui/Primitives"
import {Window} from "../ui/Window"
import {addIconText} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:824 — Rest Card 5:845 at (110, 262), 780 × 815. Child positions are canvas centres, px.
const CARD = {x: 110, y: 262, w: 780, h: 815}
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD.h / 2
const COUNTDOWN_Y = 483.5
const TITLE_Y = 733.5
const TITLE_W = 665
const BREATHE_Y = 819
const BADGE_Y = 883
const BUTTON_Y = 981.5
/** 5:846: breath halo 360 px and ellipse 310 px (cyan 10 %), 260 px ring (10.4 px) track cyan 20 % + countdown cyan. */
const HALO = 360
const ELLIPSE = 310
const RING_R = 130
const RING_STROKE = 10.4
/** Breathing halo: exhaled it shrinks onto the 310 px ellipse, inhaled it is the full 360 px. */
const HALO_EXHALED = ELLIPSE / HALO
/** "12" / "seconds" centres relative to the ring centre (frame 5:851). */
const VALUE_Y = 18.5
const CAPTION_Y = -54

/**
 * 4c · Rest / Anti-fatigue overlay (5:824). One centred card at 1.1 m, world-locked with
 * lazy-follow; the HUD bar stays ("Rest · Set 1 done"). REST_S countdown ring with a breathing
 * halo (BREATH_IN_S in / BREATH_OUT_S out) and the rest pad; auto-advances to the next set.
 * "Skip rest" is secondary. No hand UI and no targets in the chest zone.
 */
@component
export class Screen4c extends ScreenBase {
  readonly screenId: ScreenId = "4c"

  private window: Window
  private halo: SceneObject
  private countdown: Arc
  private value: Text
  private badge: Badge
  private remaining = 0
  private breathT = 0
  private advanced = false

  protected build(): void {
    const so = createChild(this.root, "RestCard")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = CARD.w
    this.window.heightPx = CARD.h
    this.window.initialize()
    const c = this.window.content
    const at = (item: SceneObject, x: number, y: number) => this.placeCanvas(item, x, y, CARD_CX, CARD_CY, 1)

    const ring = createChild(c, "Countdown")
    at(ring, 500, COUNTDOWN_Y)
    this.halo = createChild(ring, "BreathHalo")
    addRoundedRect(this.halo, "Halo", HALO, HALO, {fill: withAlpha(Colors.cyan, 0.1)}, 1)
    const ellipse = addRoundedRect(ring, "Ellipse", ELLIPSE, ELLIPSE, {fill: withAlpha(Colors.cyan, 0.1)}, 2)
    place(ellipse.sceneObject, 0, 0, 1)
    const track = new Arc(ring, "Track", RING_R, RING_R - RING_STROKE, Colors.cyan20, 3)
    place(track.sceneObject, 0, 0, 2)
    this.countdown = new Arc(ring, "Progress", RING_R, RING_R - RING_STROKE, Colors.cyan, 4)
    place(this.countdown.sceneObject, 0, 0, 3)
    this.value = addText(ring, "Seconds", "", {px: 96, weight: Weight.Bold, color: Colors.textPrimary, align: "center", trackingPx: -1.44}, 5)
    place(this.value.getSceneObject(), 0, VALUE_Y, 4)
    const caption = addText(ring, "Caption", "seconds", {px: 24, weight: Weight.SemiBold, color: Colors.vibrantSecondary, align: "center"}, 5)
    place(caption.getSceneObject(), 0, CAPTION_Y, 4)

    const title = addText(
      c,
      "Title",
      "Lower your hands and relax your shoulders",
      {px: 38, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center", wrapWidthPx: TITLE_W, lineHeight: 1.25, trackingPx: -0.304},
      3
    )
    at(title.getSceneObject(), 500, TITLE_Y)

    const breathe = addIconText(
      c,
      "Breathe",
      Textures.wind,
      28,
      Colors.cyan,
      `Breathe in ${Config.BREATH_IN_S} s · out ${Config.BREATH_OUT_S} s`,
      {px: 26, weight: Weight.Regular, color: Colors.vibrantSecondary},
      12
    )
    at(breathe.so, 500, BREATHE_Y)

    const badgeSo = createChild(c, "SetComplete")
    this.badge = badgeSo.createComponent(Badge.getTypeName()) as Badge
    this.badge.tone = "Success"
    this.badge.text = ""
    this.badge.initialize()
    at(badgeSo, 500, BADGE_Y)

    const buttonSo = createChild(c, "SkipRest")
    const button = buttonSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = "Skip rest"
    button.style = "Secondary"
    button.initialize()
    button.onPressed.add(() => this.sm.skip())
    at(buttonSo, 500, BUTTON_Y)
  }

  protected onShow(): void {
    const pose = this.spawnPose(CARD_CX, CARD_CY)
    this.window.spawn(pose.position, pose.rotation)
    this.remaining = Config.REST_S
    this.breathT = 0
    this.advanced = false
    this.badge.setText(`Set ${this.ctx.completedSet} complete · ${this.ctx.repsDoneInSet}/${Config.REPS_PER_SET} reps`)
    AudioCues.instance.startRestPad()
    this.render()
  }

  protected tick(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt)
    this.breathT = (this.breathT + dt) % (Config.BREATH_IN_S + Config.BREATH_OUT_S)
    this.render()
    if (this.remaining <= 0 && !this.advanced) {
      this.advanced = true
      this.sm.next()
    }
  }

  private render(): void {
    this.countdown.setFraction(this.remaining / Config.REST_S)
    const seconds = `${Math.ceil(this.remaining - 1e-6)}`
    if (this.value.text !== seconds) this.value.text = seconds
    // Breathing halo: grows over BREATH_IN_S, shrinks over BREATH_OUT_S (eased).
    const inhaling = this.breathT < Config.BREATH_IN_S
    const p = inhaling ? this.breathT / Config.BREATH_IN_S : 1 - (this.breathT - Config.BREATH_IN_S) / Config.BREATH_OUT_S
    const e = p * p * (3 - 2 * p)
    const s = HALO_EXHALED + (1 - HALO_EXHALED) * e
    this.halo.getTransform().setLocalScale(new vec3(s, s, 1))
  }
}
