import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "../Config"
import {Colors, hex, px, Textures, Weight, white, withAlpha} from "../Theme"
import {
  addImage,
  addRoundedRect,
  addText,
  Arc,
  createChild,
  place,
  resizeRoundedRect,
  setRadialGradient,
  textWidthPx,
} from "./Primitives"
import {PressSource, Target, Targets} from "./Targets"

export type ButtonStyle = "Primary" | "Secondary"

// Figma 3:76 "Button / Pill", px.
const HEIGHT = 100
const PAD_LEFT = 16
const PAD_RIGHT = 40
const GAP = 18
const RING = 56
const RING_STROKE = 3.92
const ICON = 28
const DIVIDER_W = 1.5
const DIVIDER_H = 36
const LABEL_PX = 32
const SUBLABEL_PX = 24
/** Primary · Dwell glow: shadow 0 0 36 px cyan 45 %, drawn as stacked pills. */
const GLOW_PX = 36
const GLOW_STEPS = 4
const GLOW_STEP_ALPHA = 0.06

export type FillStates = {fill: vec4; hover: vec4; pressed: vec4}

type Palette = FillStates & {
  label: vec4
  divider: vec4
  sublabel: vec4
  ringTrack: vec4
  ringProgress: vec4
  icon: vec4
  highlight: vec4
  highlightFadeAt: number
}

const PALETTES: Record<ButtonStyle, Palette> = {
  Primary: {
    fill: Colors.cyan,
    hover: Colors.cyan,
    pressed: Colors.cyan,
    label: Colors.textOnAccent,
    divider: Colors.onAccentDivider,
    sublabel: Colors.onAccentSublabel,
    ringTrack: hex("#00211C", 0.18),
    ringProgress: Colors.textOnAccent,
    icon: Colors.textOnAccent,
    highlight: white(0.35),
    highlightFadeAt: 0.6,
  },
  Secondary: {
    fill: Colors.controlFill,
    hover: Colors.controlHover,
    pressed: white(0.2), // visionOS/Control · Pinch
    label: Colors.textPrimary,
    divider: Colors.separator,
    sublabel: Colors.vibrantSecondaryOnControl,
    ringTrack: white(0.22),
    ringProgress: withAlpha(Colors.textPrimary, 0.96),
    icon: Colors.textPrimary,
    highlight: white(0.12),
    highlightFadeAt: 0.56,
  },
}

/**
 * Adds a UI Kit Button to `so` for pinch / poke (SIK Interactable, collider, hover and trigger
 * events) with UI Kit's own visual hidden; `background` is repainted with the Figma state
 * colours instead, so the tokens always win over the UI Kit theme.
 */
export function attachUIKitButton(
  so: SceneObject,
  shape: "Capsule" | "Round" | "Rectangle",
  wPx: number,
  hPx: number,
  background: RoundedRectangle,
  colors: FillStates | (() => FillStates),
  onPinch: () => void,
  colliderPx?: number
): Button {
  const button = so.createComponent(Button.getTypeName()) as Button
  button.setVariant({theme: "SnapOS2", shape, style: "Ghost"})
  button.size = new vec3(px(wPx), px(hPx), 1)
  if (colliderPx !== undefined) {
    button.colliderFitElement = false
    button.colliderSize = new vec3(px(colliderPx), px(colliderPx), 1)
  }
  button.initialize()
  button.opacity = 0
  let hovered = false
  const paint = (pressed: boolean) => {
    const c = typeof colors === "function" ? colors() : colors
    background.backgroundColor = pressed ? c.pressed : hovered ? c.hover : c.fill
  }
  button.onHoverEnter.add(() => {
    hovered = true
    paint(false)
  })
  button.onHoverExit.add(() => {
    hovered = false
    paint(false)
  })
  button.onTriggerDown.add(() => paint(true))
  button.onTriggerUp.add(() => {
    paint(false)
    onPinch()
  })
  return button
}

/**
 * PhysioButton — Figma "Button / Pill" (3:76) over a UI Kit Button (Capsule).
 * Accepts pinch (UI Kit / SIK), voice (label or aliases) and head-aim dwell: the dwell ring
 * fills over DWELL_S and the sublabel counts down "Hold · n s left".
 *
 * Lifecycle: createComponent → set label / style / hint → initialize().
 */
@component
export class PhysioButton extends BaseScriptComponent implements Target {
  label = "Continue"
  style: ButtonStyle = "Primary"
  /** Sublabel in the Default state. */
  hint = "Pinch or say it"
  /** Extra phrases that also trigger the button by voice; the label always does. */
  voiceAliases: string[] = []
  readonly ownsDwellFeedback = true

  private readonly pressedEvent = new Event<PressSource>()
  readonly onPressed: PublicApi<PressSource> = this.pressedEvent.publicApi()

  private uiButton: Button
  private background: RoundedRectangle
  private ringTrack: Arc
  private ringProgress: Arc
  private icon: RenderMeshVisual
  private labelText: Text
  private divider: RoundedRectangle
  private sublabelText: Text
  private highlight: RoundedRectangle
  private readonly glow: RoundedRectangle[] = []
  private built = false
  private dwellProgress = 0
  private width = 0

  get widthPx(): number {
    return this.width
  }

  get heightPx(): number {
    return HEIGHT
  }

  get collider(): ColliderComponent {
    return this.uiButton.collider
  }

  get voicePhrases(): string[] {
    return [this.label, ...this.voiceAliases].map((phrase) => phrase.toLowerCase())
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const palette = PALETTES[this.style]
    const root = this.sceneObject

    if (this.style === "Primary") {
      for (let i = 0; i < GLOW_STEPS; i++) {
        const glow = addRoundedRect(root, `Glow${i}`, 10, HEIGHT, {fill: withAlpha(Colors.cyan, GLOW_STEP_ALPHA)}, 0)
        place(glow.sceneObject, 0, 0, -1)
        this.glow.push(glow)
      }
    }
    this.background = addRoundedRect(root, "Fill", 10, HEIGHT, {fill: palette.fill}, 1)
    this.highlight = addRoundedRect(root, "DwellHighlight", 10, HEIGHT, {fill: withAlpha(palette.highlight, 0)}, 2)
    setRadialGradient(this.highlight, palette.highlight, withAlpha(palette.highlight, 0), palette.highlightFadeAt)
    place(this.highlight.sceneObject, 0, 0, 1)

    const content = createChild(root, "Content")
    place(content, 0, 0, 2)
    this.ringTrack = new Arc(content, "RingTrack", RING / 2, RING / 2 - RING_STROKE, palette.ringTrack, 3)
    this.ringProgress = new Arc(content, "RingProgress", RING / 2, RING / 2 - RING_STROKE, palette.ringProgress, 4)
    this.ringProgress.setFraction(0)
    this.icon = addImage(content, "Aim", Textures.aim, ICON, ICON, palette.icon, 4)
    this.labelText = addText(content, "Label", this.label, {px: LABEL_PX, weight: Weight.SemiBold, color: palette.label, trackingPx: -0.256}, 4)
    this.divider = addRoundedRect(content, "Divider", DIVIDER_W, DIVIDER_H, {fill: palette.divider, radiusPx: 0}, 3)
    this.sublabelText = addText(
      content,
      "Sublabel",
      this.hint,
      {px: SUBLABEL_PX, weight: Weight.Medium, color: palette.sublabel},
      4
    )

    this.uiButton = attachUIKitButton(root, "Capsule", this.measureWidth(), HEIGHT, this.background, palette, () =>
      this.press("pinch")
    )
    this.applyDwellState()
    Targets.add(this)
    this.createEvent("OnDestroyEvent").bind(() => Targets.remove(this))
  }

  /** 0 = idle; (0, 1) = Dwell state; reaching 1 presses the button and returns to Default. */
  setDwellProgress(progress: number): void {
    if (progress >= 1) {
      this.dwellProgress = 0
      this.applyDwellState()
      this.press("dwell")
      return
    }
    this.dwellProgress = Math.max(0, progress)
    this.applyDwellState()
  }

  press(source: PressSource): void {
    this.pressedEvent.invoke(source)
  }

  /** Changes the label (and its voice phrase), re-laying the pill out around it. */
  setLabel(label: string): void {
    this.label = label
    if (!this.built) return
    this.labelText.text = label
    this.layout()
  }

  private applyDwellState(): void {
    const dwelling = this.dwellProgress > 0
    this.ringProgress.setFraction(this.dwellProgress)
    const sublabel = dwelling ? `Hold · ${Math.ceil((1 - this.dwellProgress) * Config.DWELL_S)} s left` : this.hint
    if (this.sublabelText.text !== sublabel) {
      this.sublabelText.text = sublabel
    }
    this.layout()
    this.highlight.sceneObject.enabled = dwelling
    this.glow.forEach((glow) => (glow.sceneObject.enabled = dwelling))
  }

  private measureWidth(): number {
    return (
      PAD_LEFT +
      RING +
      GAP +
      textWidthPx(this.labelText) +
      GAP +
      DIVIDER_W +
      GAP +
      textWidthPx(this.sublabelText) +
      PAD_RIGHT
    )
  }

  /** Hug-content layout centred on the object (Figma auto-layout, left → right). */
  private layout(): void {
    const width = this.measureWidth()
    if (width === this.width) return
    this.width = width
    let x = -width / 2 + PAD_LEFT
    place(this.ringTrack.sceneObject, x + RING / 2, 0)
    place(this.ringProgress.sceneObject, x + RING / 2, 0, 1)
    place(this.icon.getSceneObject(), x + RING / 2, 0, 1)
    x += RING + GAP
    place(this.labelText.getSceneObject(), x, 0, 1)
    x += textWidthPx(this.labelText) + GAP
    place(this.divider.sceneObject, x + DIVIDER_W / 2, 0)
    x += DIVIDER_W + GAP
    place(this.sublabelText.getSceneObject(), x, 0, 1)

    resizeRoundedRect(this.background, width, HEIGHT)
    resizeRoundedRect(this.highlight, width, HEIGHT)
    this.glow.forEach((glow, i) => {
      const grow = (GLOW_PX * (i + 1)) / GLOW_STEPS
      resizeRoundedRect(glow, width + 2 * grow, HEIGHT + 2 * grow)
    })
    this.uiButton.size = new vec3(px(width), px(HEIGHT), 1)
  }
}
