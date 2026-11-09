import {Config} from "../Config"
import {HoldState, HoldTimer} from "../HoldTimer"
import {Badge, BadgeTone} from "../ui/Badge"
import {HudBar} from "../ui/HudBar"
import {JointNode, JointStatus} from "../ui/JointNode"
import {PhaseStrip} from "../ui/PhaseStrip"
import {ButtonStyle, PhysioButton} from "../ui/PhysioButton"
import {createChild, place} from "../ui/Primitives"
import {RangeGauge} from "../ui/RangeGauge"
import {Window} from "../ui/Window"

/**
 * ComponentGallery (Phase 1) — renders the Figma Component Library (3:32) with the real
 * ui/ wrappers at their Figma positions, for side-by-side comparison. Figma coordinates are
 * relative to the 3:32 frame; its centre maps to (0, LAYOUT_Y0_CM, −WINDOW_Z_CM).
 * Items below the library row (HUD bar, gauge, window plate) are extra checks of the other
 * Phase 1 wrappers against their own Figma nodes.
 */

/** Centre of Figma frame 3:32 (2130 × 1253 px). */
const FRAME_CX = 1065
const FRAME_CY = 626.5

@component
export class ComponentGallery extends BaseScriptComponent {
  private root: SceneObject

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.build())
  }

  private build(): void {
    this.root = createChild(this.sceneObject, "Gallery")
    this.root.getTransform().setWorldPosition(new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM))

    // Button / Pill — 3:36, 3:46, 3:56, 3:66 (centres)
    this.button("Primary", 0, 323.75, 275)
    this.button("Primary", 0.66, 819.75, 275)
    this.button("Secondary", 0, 1315.75, 275)
    this.button("Secondary", 0.66, 1811.75, 275)

    // Badge — 3:79, 3:84, 3:89
    this.badge("Safety", 323, 495.5)
    this.badge("Info", 831, 495.5)
    this.badge("Success", 1339, 495.5)

    // Joint Node — 3:96, 3:99, 3:102
    this.joint("Neutral", 105, 682)
    this.joint("Approaching", 193, 682)
    this.joint("Reached", 281, 682)

    // Radial Hold Timer — 3:108 (2.0 s of 3 s), 3:115
    this.holdTimer("Holding", 2 / 3, 181, 942)
    this.holdTimer("Complete", 1, 429, 942)

    // Phase strip — 20:459 (4f values), placed where the Spatial Tag sits in 3:32
    const strip = this.create<PhaseStrip>(PhaseStrip, "PhaseStrip", 0, 0)
    strip.activeIndex = 2
    strip.elapsedS = 170
    strip.initialize()
    this.placeLeft(strip.sceneObject, strip.widthPx, 57, 1180)

    // Extras: HUD bar (20:439), yaw gauge (5:785), window plate (5:6 size)
    const hud = this.create<HudBar>(HudBar, "HudBar", 0, 0)
    hud.title = "Tendon gliding"
    hud.set = 1
    hud.rep = 3
    hud.repsDone = 2
    hud.initialize()
    this.placeAt(hud.sceneObject, 1290, 760)

    const gauge = this.create<RangeGauge>(RangeGauge, "YawGauge", 1290, 900)
    gauge.initialize()
    gauge.setBand(-35, -25)
    gauge.setValue(-28)

    const window = this.create<Window>(Window, "WindowPlate", 1290, 1090)
    window.widthPx = 880
    window.heightPx = 200
    window.lazyFollow = false
    window.initialize()
  }

  private create<T extends BaseScriptComponent>(
    type: {getTypeName(): TypeName<BaseScriptComponent>},
    name: string,
    fx: number,
    fy: number
  ): T {
    const so = createChild(this.root, name)
    this.placeAt(so, fx, fy)
    return so.createComponent(type.getTypeName()) as T
  }

  /** Places an object centred on Figma point (fx, fy) of frame 3:32. */
  private placeAt(so: SceneObject, fx: number, fy: number): void {
    place(so, fx - FRAME_CX, -(fy - FRAME_CY))
  }

  /** Places a hug-content object so its left edge sits at Figma x = `left`. */
  private placeLeft(so: SceneObject, widthPx: number, left: number, fy: number): void {
    this.placeAt(so, left + widthPx / 2, fy)
  }

  private button(style: ButtonStyle, dwell: number, fx: number, fy: number): void {
    const button = this.create<PhysioButton>(PhysioButton, `Button_${style}_${dwell > 0 ? "Dwell" : "Default"}`, fx, fy)
    button.label = "Continue"
    button.style = style
    button.initialize()
    button.setDwellProgress(dwell)
  }

  private badge(tone: BadgeTone, fx: number, fy: number): void {
    const badge = this.create<Badge>(Badge, `Badge_${tone}`, fx, fy)
    badge.tone = tone
    badge.initialize()
  }

  private joint(status: JointStatus, fx: number, fy: number): void {
    const node = this.create<JointNode>(JointNode, `Joint_${status}`, fx, fy)
    node.status = status
    node.initialize()
  }

  private holdTimer(state: HoldState, progress: number, fx: number, fy: number): void {
    const timer = this.create<HoldTimer>(HoldTimer, `HoldTimer_${state}`, fx, fy)
    timer.initialize()
    timer.show(state, progress)
  }
}
