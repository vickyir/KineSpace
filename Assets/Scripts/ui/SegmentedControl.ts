import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Colors, Weight, white} from "../Theme"
import {attachUIKitButton} from "./PhysioButton"
import {addRoundedRect, addText, createChild, place, textWidthPx} from "./Primitives"
import {PressSource, Target, Targets} from "./Targets"

export type Segment = {label: string; sublabel?: string; phrases?: string[]}

export type SegmentedStyle = {
  labelPx: number
  labelTrackingPx?: number
  sublabelPx: number
  padX: number
  padY: number
  trackPad: number
  gap: number
}

/** 25:298 hand selector (1d) and 5:382 pace selector (2), px. */
export const SEGMENTED_STYLES = {
  handSelector: {labelPx: 26, sublabelPx: 24, padX: 36, padY: 16, trackPad: 6, gap: 6} as SegmentedStyle,
  paceSelector: {labelPx: 28, labelTrackingPx: -0.224, sublabelPx: 24, padX: 28, padY: 14, trackPad: 8, gap: 8} as SegmentedStyle,
}

const LINE = 1.211
const SUBLABEL_GAP = 2

class SegmentTarget implements Target {
  readonly ownsDwellFeedback = false
  button: Button
  background: RoundedRectangle
  label: Text
  sublabel: Text | null = null

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
 * SegmentedControl — recessed single-choice control (1d Right / Left hand, 2 Gentle / Standard).
 * Every segment takes pinch, voice (its label or phrases) and head-aim dwell (ring on the Aim dot).
 *
 * Lifecycle: createComponent → set segments / style / selectedIndex → initialize().
 */
@component
export class SegmentedControl extends BaseScriptComponent {
  segments: Segment[] = []
  style: SegmentedStyle = SEGMENTED_STYLES.handSelector
  selectedIndex = 0

  private readonly changedEvent = new Event<number>()
  readonly onChanged: PublicApi<number> = this.changedEvent.publicApi()

  private readonly items: SegmentTarget[] = []
  private width = 0
  private height = 0
  private built = false

  get widthPx(): number {
    return this.width
  }

  get heightPx(): number {
    return this.height
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const s = this.style
    const hasSublabel = this.segments.some((seg) => seg.sublabel)
    const segH = s.padY * 2 + s.labelPx * LINE + (hasSublabel ? SUBLABEL_GAP + s.sublabelPx * LINE : 0)
    const widths: number[] = []

    this.segments.forEach((segment, i) => {
      const so = createChild(this.sceneObject, `Segment_${segment.label}`)
      const phrases = (segment.phrases ?? [segment.label]).map((p) => p.toLowerCase())
      const item = new SegmentTarget(so, phrases, () => this.select(i))
      item.label = addText(so, "Label", segment.label, {px: s.labelPx, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center", trackingPx: s.labelTrackingPx}, 3)
      if (segment.sublabel) {
        item.sublabel = addText(so, "Sublabel", segment.sublabel, {px: s.sublabelPx, weight: Weight.SemiBold, color: Colors.cyan, align: "center"}, 3)
      }
      const contentW = Math.max(textWidthPx(item.label), item.sublabel ? textWidthPx(item.sublabel) : 0)
      const w = contentW + s.padX * 2
      widths.push(w)
      item.background = addRoundedRect(so, "Fill", w, segH, {fill: white(0)}, 2)
      if (item.sublabel) {
        const labelH = s.labelPx * LINE
        const subH = s.sublabelPx * LINE
        const top = (labelH + SUBLABEL_GAP + subH) / 2
        place(item.label.getSceneObject(), 0, top - labelH / 2, 1)
        place(item.sublabel.getSceneObject(), 0, top - labelH - SUBLABEL_GAP - subH / 2, 1)
      } else {
        place(item.label.getSceneObject(), 0, 0, 1)
      }
      item.button = attachUIKitButton(so, "Capsule", w, segH, item.background, () => this.colorsFor(i), () => item.press("pinch"))
      Targets.add(item)
      this.items.push(item)
    })

    this.width = widths.reduce((a, b) => a + b, 0) + s.gap * (widths.length - 1) + s.trackPad * 2
    this.height = segH + s.trackPad * 2
    addRoundedRect(this.sceneObject, "Track", this.width, this.height, {fill: Colors.recessedTrack}, 1)
    let x = -this.width / 2 + s.trackPad
    this.items.forEach((item, i) => {
      place(item.sceneObject, x + widths[i] / 2, 0, 1)
      x += widths[i] + s.gap
    })
    this.createEvent("OnDestroyEvent").bind(() => this.items.forEach((item) => Targets.remove(item)))
    this.render()
  }

  select(index: number): void {
    if (index === this.selectedIndex) return
    this.selectedIndex = index
    this.render()
    this.changedEvent.invoke(index)
  }

  /** Updates a segment's sublabel (e.g. today's pace percentage). */
  setSublabel(index: number, value: string): void {
    const sub = this.items[index]?.sublabel
    if (sub) sub.text = value
  }

  private colorsFor(index: number): {fill: vec4; hover: vec4; pressed: vec4} {
    const selected = index === this.selectedIndex
    const fill = selected ? Colors.segmentSelected : white(0)
    return {fill, hover: selected ? fill : Colors.controlFill, pressed: Colors.segmentSelected}
  }

  /** Selected: primary label, cyan sublabel. Others: vibrant secondary label, tertiary sublabel (Figma). */
  private render(): void {
    this.items.forEach((item, i) => {
      const selected = i === this.selectedIndex
      item.background.backgroundColor = this.colorsFor(i).fill
      item.label.textFill.color = selected ? Colors.textPrimary : Colors.vibrantSecondary
      if (item.sublabel) item.sublabel.textFill.color = selected ? Colors.cyan : Colors.vibrantTertiary
    })
  }
}
