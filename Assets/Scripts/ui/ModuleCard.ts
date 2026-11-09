import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "../Config"
import {Colors, Silhouettes, Textures, Weight, white, withAlpha} from "../Theme"
import {attachUIKitButton} from "./PhysioButton"
import {addImage, addRoundedRect, addText, createChild, place} from "./Primitives"
import {PressSource, Target, Targets} from "./Targets"
import {glassStyle} from "./Widgets"

export type CardIllustration = "hand" | "head"

// Figma 5:288 / 5:354 "Module card", px.
const WIDTH = 438
const PAD_X = 32
const PAD_TOP = 28
const PAD_BOTTOM = 32
const GAP = 16
const RADIUS = 46
const ILLUSTRATION_W = 374
const ILLUSTRATION_H = 280
const TITLE_PX = 34
const ITEM_PX = 26
const ITEM_GAP = 10
const FOOTER_PX = 24
const LINE = 1.211
/** Receded (unselected) card opacity (Figma 5:354: 70 %). */
const RECEDED_OPACITY = 0.7

/**
 * ModuleCard — Hub module card (5:288 / 5:354): glass card with illustration, title, exercise
 * list and footer. The selected card is fully opaque and advanced by HUB_FOCUS_DEPTH_CM; the
 * other recedes to 70 % (2 spec: "depth, not width"). Pinch, voice (title) or dwell selects.
 *
 * Lifecycle: createComponent → set copy / illustration → initialize().
 */
@component
export class ModuleCard extends BaseScriptComponent implements Target {
  title = ""
  items: string[] = []
  footer = ""
  illustration: CardIllustration = "hand"
  /** Extra voice phrases ("hand", "head"). */
  phrases: string[] = []
  readonly ownsDwellFeedback = false

  private readonly pressedEvent = new Event<PressSource>()
  readonly onPressed: PublicApi<PressSource> = this.pressedEvent.publicApi()

  private button: Button
  private content: SceneObject
  private readonly dimmables: {apply: (factor: number) => void}[] = []
  private height = 0
  private selected = false
  private focused = false
  private built = false

  get heightPx(): number {
    return this.height
  }

  get collider(): ColliderComponent {
    return this.button.collider
  }

  get voicePhrases(): string[] {
    return [this.title, this.title.replace("&", "and"), ...this.phrases].map((p) => p.toLowerCase())
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const listH = this.items.length * ITEM_PX * LINE + (this.items.length - 1) * ITEM_GAP
    this.height = PAD_TOP + ILLUSTRATION_H + GAP + TITLE_PX * LINE + GAP + listH + GAP + FOOTER_PX * LINE + PAD_BOTTOM
    this.content = createChild(this.sceneObject, "Card")
    const plate = addRoundedRect(this.content, "Glass", WIDTH, this.height, glassStyle(RADIUS), 0)
    this.dimmables.push({apply: (f) => (plate.opacity = f)})

    const left = -WIDTH / 2 + PAD_X
    let y = this.height / 2 - PAD_TOP
    const art = createChild(this.content, "Illustration")
    place(art, 0, y - ILLUSTRATION_H / 2, 2)
    this.buildIllustration(art)
    y -= ILLUSTRATION_H + GAP

    y = this.addLine(this.title, TITLE_PX, Weight.SemiBold, Colors.textPrimary, left, y, -0.272) - GAP
    this.items.forEach((item, i) => {
      y = this.addLine(item, ITEM_PX, Weight.Regular, Colors.textPrimary, left, y, 0.78) - (i < this.items.length - 1 ? ITEM_GAP : 0)
    })
    y -= GAP
    this.addLine(this.footer, FOOTER_PX, Weight.SemiBold, Colors.vibrantSecondary, left, y)

    this.button = attachUIKitButton(
      this.sceneObject,
      "Rectangle",
      WIDTH,
      this.height,
      plate,
      {fill: Colors.glassFill, hover: Colors.glassFill, pressed: Colors.glassFill},
      () => this.press("pinch")
    )
    this.button.onHoverEnter.add(() => this.setFocused(true))
    this.button.onHoverExit.add(() => this.setFocused(false))
    Targets.add(this)
    this.createEvent("OnDestroyEvent").bind(() => Targets.remove(this))
    this.render()
  }

  setSelected(selected: boolean): void {
    this.selected = selected
    this.render()
  }

  setDwellProgress(progress: number): void {
    this.setFocused(progress > 0 && progress < 1)
    if (progress >= 1) this.press("dwell")
  }

  press(source: PressSource): void {
    this.pressedEvent.invoke(source)
  }

  private setFocused(focused: boolean): void {
    this.focused = focused
    this.render()
  }

  private render(): void {
    const advanced = this.selected || this.focused
    this.content.getTransform().setLocalPosition(new vec3(0, 0, advanced ? Config.HUB_FOCUS_DEPTH_CM : 0))
    const factor = this.selected ? 1 : RECEDED_OPACITY
    this.dimmables.forEach((d) => d.apply(factor))
  }

  private addLine(value: string, sizePx: number, weight: Weight, color: vec4, left: number, top: number, trackingPx?: number): number {
    const text = addText(this.content, value, value, {px: sizePx, weight, color, trackingPx}, 3)
    const h = sizePx * LINE
    place(text.getSceneObject(), left, top - h / 2, 2)
    this.dimmables.push({apply: (f) => (text.textFill.color = withAlpha(color, color.w * f))})
    return top - h
  }

  /** Illustration box 374 × 280 (5:296 / 5:357); positions relative to its centre. */
  private buildIllustration(art: SceneObject): void {
    const image = (texture: Texture, x: number, y: number, w: number, h: number) => {
      const visual = addImage(art, "Art", texture, w, h, white(1), 3)
      place(visual.getSceneObject(), x + w / 2 - ILLUSTRATION_W / 2, -(y + h / 2 - ILLUSTRATION_H / 2), 1)
      this.dimmables.push({apply: (f) => (visual.mainPass.baseColor = white(f))})
    }
    // Figma instances: Hand / Open 211.2 × 272.8 at (81, 6) and Head / Front 206.4 × 225.32 at
    // (84, 58). The textures are the components' silhouettes, so place them at the silhouette's
    // box inside the component (14:436 / 14:413; the hand texture includes its 1 px stroke).
    if (this.illustration === "hand") {
      const s = 211.2 / 240
      image(Silhouettes.handOpen, 81 + 22.21 * s, 6 + 27.6 * s, 167.695 * s, 273.4 * s)
    } else {
      const s = 206.4 / 240
      image(Silhouettes.headFront, 84 + 16 * s, 58 + 26 * s, 208 * s, 236 * s)
      image(Textures.movementArrow, 57, 0, 260, 60)
    }
  }
}

