import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Comfort} from "../CalibrationStore"
import {Colors, Weight, white, withAlpha} from "../Theme"
import {attachUIKitButton, FillStates} from "./PhysioButton"
import {addRoundedRect, addText, createChild, place, textWidthPx} from "./Primitives"
import {PressSource, Target, Targets} from "./Targets"

// Figma 20:683 "Comfort options", px.
const PAD_X = 40
const HEIGHT = 76
/** Pain (20:688): 2 px coral border outside the 76 px pill → 80 px. */
const PAIN_BORDER = 2
const LABEL_PX = 30
/**
 * Figma gap is 20 px; widened so neighbouring options stay ≥ 1° (37 px) apart, as on the HUD
 * (DEVIATIONS.md P28).
 */
const GAP = 37

type Option = {comfort: Comfort; label: string}

const OPTIONS: Option[] = [
  {comfort: "good", label: "Good"},
  {comfort: "sore", label: "A bit sore"},
  {comfort: "pain", label: "Pain"},
]

class OptionTarget implements Target {
  readonly ownsDwellFeedback = false
  button: Button
  background: RoundedRectangle

  constructor(
    readonly sceneObject: SceneObject,
    readonly voicePhrases: string[],
    private readonly onPress: (source: PressSource) => void
  ) {}

  get collider(): ColliderComponent {
    return this.button.collider
  }

  setDwellProgress(progress: number): void {
    if (progress >= 1) this.press("dwell")
  }

  press(source: PressSource): void {
    this.onPress(source)
  }
}

/**
 * ComfortOptions — the 6a comfort check (20:683): "Good", "A bit sore", "Pain". Three large
 * options, each taking pinch, voice (its label) or head-aim dwell (ring on the Aim dot); no
 * typing in AR. Good and A bit sore stay selected (white 18 %, as the Hub pace selector); Pain
 * is coral and leads straight to the safety stop.
 *
 * Lifecycle: createComponent → initialize(); listen to onChosen, call setSelected().
 */
@component
export class ComfortOptions extends BaseScriptComponent {
  private readonly chosenEvent = new Event<Comfort>()
  readonly onChosen: PublicApi<Comfort> = this.chosenEvent.publicApi()

  private readonly items: OptionTarget[] = []
  private selected: Comfort | null = null
  private width = 0
  private built = false

  get widthPx(): number {
    return this.width
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const widths: number[] = []
    OPTIONS.forEach((option) => {
      const pain = option.comfort === "pain"
      const so = createChild(this.sceneObject, `Comfort_${option.comfort}`)
      const item = new OptionTarget(so, [option.label.toLowerCase()], () => this.choose(option.comfort))
      const label = addText(so, "Label", option.label, {px: LABEL_PX, weight: Weight.SemiBold, color: pain ? Colors.coral : Colors.textPrimary, align: "center", trackingPx: -0.24}, 3)
      place(label.getSceneObject(), 0, 0, 1)
      const border = pain ? PAIN_BORDER : 0
      const w = textWidthPx(label) + PAD_X * 2 + border * 2
      const h = HEIGHT + border * 2
      widths.push(w)
      item.background = addRoundedRect(
        so,
        "Fill",
        w,
        h,
        pain ? {fill: withAlpha(Colors.coral, 0.2), borderPx: PAIN_BORDER, borderColor: Colors.coral} : {fill: Colors.controlFill},
        2
      )
      item.button = attachUIKitButton(so, "Capsule", w, h, item.background, () => this.colorsFor(option.comfort), () => item.press("pinch"))
      Targets.add(item)
      this.items.push(item)
    })
    this.width = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1)
    let x = -this.width / 2
    this.items.forEach((item, i) => {
      place(item.sceneObject, x + widths[i] / 2, 0, 1)
      x += widths[i] + GAP
    })
    this.createEvent("OnDestroyEvent").bind(() => this.items.forEach((item) => Targets.remove(item)))
    this.render()
  }

  /** Shows `comfort` as chosen (Good / A bit sore; Pain is never shown selected). */
  setSelected(comfort: Comfort | null): void {
    this.selected = comfort === "pain" ? null : comfort
    this.render()
  }

  private choose(comfort: Comfort): void {
    this.setSelected(comfort)
    this.chosenEvent.invoke(comfort)
  }

  private colorsFor(comfort: Comfort): FillStates {
    if (comfort === "pain") {
      const coral = withAlpha(Colors.coral, 0.2)
      return {fill: coral, hover: withAlpha(Colors.coral, 0.3), pressed: withAlpha(Colors.coral, 0.35)}
    }
    const fill = comfort === this.selected ? Colors.segmentSelected : Colors.controlFill
    return {fill, hover: comfort === this.selected ? fill : Colors.controlHover, pressed: white(0.2)}
  }

  private render(): void {
    OPTIONS.forEach((option, i) => {
      this.items[i].background.backgroundColor = this.colorsFor(option.comfort).fill
    })
  }
}
