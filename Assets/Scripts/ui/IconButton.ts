import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Colors, Textures, white, withAlpha} from "../Theme"
import {attachUIKitButton} from "./PhysioButton"
import {addImage, addRoundedRect, Arc, createChild, place} from "./Primitives"
import {PressSource, Target, Targets} from "./Targets"

// Figma 20:452 / 20:456 (HUD Pause / Stop), px.
const SIZE = 56
const ICON = 28
const RING_STROKE = 3.92
/** Collider grown to the 2° minimum target (4:4); the visual keeps Figma's 56 px. */
export const ICON_BUTTON_COLLIDER_PX = 80

/**
 * IconButton — round HUD control (Pause, Stop) over a UI Kit Button (Round). Pinch, voice
 * (`phrases`) and head-aim dwell; dwell feedback reuses the Button / Pill dwell ring.
 *
 * Lifecycle: createComponent → set icon / iconColor / phrases → initialize().
 */
@component
export class IconButton extends BaseScriptComponent implements Target {
  icon: Texture = Textures.pause
  iconColor: vec4 = Colors.textPrimary
  phrases: string[] = []
  readonly ownsDwellFeedback = true

  private readonly pressedEvent = new Event<PressSource>()
  readonly onPressed: PublicApi<PressSource> = this.pressedEvent.publicApi()

  private uiButton: Button
  private ring: Arc
  private built = false

  get collider(): ColliderComponent {
    return this.uiButton.collider
  }

  get voicePhrases(): string[] {
    return this.phrases.map((phrase) => phrase.toLowerCase())
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const root = this.sceneObject
    const background = addRoundedRect(root, "Fill", SIZE, SIZE, {fill: Colors.controlFill}, 1)
    const content = createChild(root, "Content")
    place(content, 0, 0, 2)
    addImage(content, "Icon", this.icon, ICON, ICON, this.iconColor, 4)
    this.ring = new Arc(content, "DwellRing", SIZE / 2, SIZE / 2 - RING_STROKE, withAlpha(this.iconColor, 0.96), 4)
    this.ring.setFraction(0)

    this.uiButton = attachUIKitButton(
      root,
      "Round",
      SIZE,
      SIZE,
      background,
      {fill: Colors.controlFill, hover: Colors.controlHover, pressed: white(0.2)},
      () => this.press("pinch"),
      ICON_BUTTON_COLLIDER_PX
    )
    Targets.add(this)
    this.createEvent("OnDestroyEvent").bind(() => Targets.remove(this))
  }

  setDwellProgress(progress: number): void {
    if (progress >= 1) {
      this.ring.setFraction(0)
      this.press("dwell")
      return
    }
    this.ring.setFraction(Math.max(0, progress))
  }

  press(source: PressSource): void {
    this.pressedEvent.invoke(source)
  }
}
