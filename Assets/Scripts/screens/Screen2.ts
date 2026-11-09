import {BatteryGuard} from "../BatteryGuard"
import {Module, Pace} from "../CalibrationStore"
import {Config} from "../Config"
import {HandMetrics} from "../HandMetrics"
import {Colors, Textures, Weight, white} from "../Theme"
import {ModuleCard} from "../ui/ModuleCard"
import {PhysioButton} from "../ui/PhysioButton"
import {addRoundedRect, addText, createChild, place} from "../ui/Primitives"
import {SEGMENTED_STYLES, SegmentedControl} from "../ui/SegmentedControl"
import {Window} from "../ui/Window"
import {addIconText, glassStyle, layoutRow, RowItem, textItem} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 5:258, px. The follow group is centred on the canvas (500, 700).
const BANNER = {cx: 500, cy: 111.5, w: 900, h: 103, row1: 92.5, row2: 130.5}
const BANNER_ITEM_GAP = 28
const BANNER_TEXT = {px: 24, weight: Weight.SemiBold}
const TODAY_DOT = 14
const TODAY_DOT_GAP = 8

/**
 * 2 · Therapy Hub — module and pace. Banner (session length, frequency, today's sessions,
 * battery from the Battery Level API, hand-tracking state), the two module cards (selected card
 * advanced and opaque, the other receded to 70 %), the Gentle / Standard pace selector (% of
 * today's calibrated range, Gentle by default for the first sessions) and the start button.
 * World-locked at spawn with lazy-follow.
 */
@component
export class Screen2 extends ScreenBase {
  readonly screenId: ScreenId = "2"

  private window: Window
  private cards: Record<Module, ModuleCard>
  private pace: SegmentedControl
  private start: PhysioButton
  private batteryItem: RowItem & {text: Text; icon: RenderMeshVisual}
  private trackingItem: RowItem & {text: Text; icon: RenderMeshVisual}
  private todayDots: ReturnType<typeof addRoundedRect>[] = []
  private row1: SceneObject
  private row1Items: RowItem[] = []
  private module: Module = "hand"
  private paceValue: Pace = "gentle"
  private trackingShown: boolean | null = null

  protected build(): void {
    const so = createChild(this.root, "Hub")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = 900
    this.window.heightPx = 1100
    this.window.plate = false
    this.window.initialize()
    const c = this.window.content

    this.buildBanner(c)

    this.cards = {
      hand: this.card(c, "hand", 269, 500.5, "Hand & Finger Mobility", ["Finger opposition", "Finger spread", "Tendon gliding", "Forearm rotation"], "4 exercises · 7 min"),
      head: this.card(c, "head", 731, 501, "Head & Cervical Relief", ["Look up & down", "Ear to shoulder", "Turn left & right"], "3 movements · 6 min"),
    }

    const paceSo = createChild(c, "PaceSelector")
    this.pace = paceSo.createComponent(SegmentedControl.getTypeName()) as SegmentedControl
    this.pace.style = SEGMENTED_STYLES.paceSelector
    this.pace.segments = [
      {label: "Gentle · First-timer", sublabel: this.paceSublabel("gentle"), phrases: ["gentle", "gentle first timer"]},
      {label: "Standard", sublabel: this.paceSublabel("standard"), phrases: ["standard"]},
    ]
    this.pace.initialize()
    this.pace.onChanged.add((i) => (this.paceValue = i === 0 ? "gentle" : "standard"))
    this.placeCanvas(paceSo, 500.5, 892.5)

    const startSo = createChild(c, "Start")
    this.start = startSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    this.start.label = "Start hand session"
    this.start.style = "Primary"
    this.start.initialize()
    this.start.onPressed.add(() => this.sm.chooseModule(this.module, this.paceValue))
    this.placeCanvas(startSo, 500, 1025)

    const structure = addText(
      c,
      "SessionStructure",
      "Calibrate 0:30  ›  Warm-up 1:30  ›  Exercises 4:00  ›  Summary 1:00",
      {px: 24, weight: Weight.Medium, color: Colors.vibrantSecondary, align: "center"},
      3
    )
    this.placeCanvas(structure.getSceneObject(), 500, 1111.5)
  }

  protected onShow(): void {
    const pose = this.spawnPose()
    this.window.spawn(pose.position, pose.rotation)
    this.selectModule(this.ctx.module ?? "hand")
    this.paceValue = this.ctx.pace
    this.pace.select(this.paceValue === "gentle" ? 0 : 1)
    this.pace.setSublabel(0, this.paceSublabel("gentle"))
    this.pace.setSublabel(1, this.paceSublabel("standard"))
    this.refreshBanner()
  }

  protected tick(): void {
    const good = HandMetrics.instance.trackingGood
    if (good === this.trackingShown) return
    this.trackingShown = good
    // Only "Tracking good" exists in Figma; when the hand is not tracked it is shown dimmed.
    const color = good ? Colors.emerald : Colors.vibrantTertiary
    this.trackingItem.text.textFill.color = color
    this.trackingItem.icon.mainPass.baseColor = color
  }

  private selectModule(module: Module): void {
    this.module = module
    this.cards.hand.setSelected(module === "hand")
    this.cards.head.setSelected(module === "head")
    // "Start hand session" (5:389); the head variant mirrors it.
    this.start.setLabel(`Start ${module} session`)
  }

  private paceSublabel(pace: Pace): string {
    const pct = Math.round(this.store.targetFactor(pace) * 100)
    return pace === "gentle" ? `Slow · ${pct}% of today’s range` : `Steady · ${pct}% of today’s range`
  }

  private card(parent: SceneObject, module: Module, cx: number, cy: number, title: string, items: string[], footer: string): ModuleCard {
    const so = createChild(parent, `Card_${module}`)
    const card = so.createComponent(ModuleCard.getTypeName()) as ModuleCard
    card.title = title
    card.items = items
    card.footer = footer
    card.illustration = module
    card.phrases = [module]
    card.initialize()
    card.onPressed.add(() => this.selectModule(module))
    this.placeCanvas(so, cx, cy)
    return card
  }

  /** Banner 5:259: glass, radius 36, two centred rows. */
  private buildBanner(parent: SceneObject): void {
    const banner = createChild(parent, "Banner")
    addRoundedRect(banner, "Glass", BANNER.w, BANNER.h, glassStyle(36), 0)
    this.placeCanvas(banner, BANNER.cx, BANNER.cy)
    const text = (color: vec4) => ({...BANNER_TEXT, color})

    this.row1 = createChild(banner, "Row1")
    place(this.row1, 0, -(BANNER.row1 - BANNER.cy))
    const clock = addIconText(this.row1, "Length", Textures.clock, 28, Colors.cyan, `${Config.SESSION_TARGET_MIN} min per session`, text(Colors.textPrimary), 10)
    const repeat = addIconText(this.row1, "Frequency", Textures.repeat, 28, Colors.cyan, "2–3× a day", text(Colors.textPrimary), 10)
    const today = createChild(this.row1, "Today")
    const todayItems: RowItem[] = [textItem(addText(today, "Label", "Today", text(Colors.vibrantSecondary), 3))]
    for (let i = 0; i < Config.DAILY_GOAL_SESSIONS; i++) {
      const dot = addRoundedRect(today, `Dot${i}`, TODAY_DOT, TODAY_DOT, {fill: white(0), borderPx: 2, borderColor: Colors.emerald}, 3)
      this.todayDots.push(dot)
      todayItems.push({so: dot.sceneObject, widthPx: TODAY_DOT, anchor: "center"})
    }
    const todayW = layoutRow(todayItems, TODAY_DOT_GAP, 1)
    this.batteryItem = addIconText(this.row1, "Battery", Textures.battery, 28, Colors.cyan, "", text(Colors.textPrimary), 10)
    this.row1Items = [clock, repeat, {so: today, widthPx: todayW, anchor: "center"}, this.batteryItem]

    const row2 = createChild(banner, "Row2")
    place(row2, 0, -(BANNER.row2 - BANNER.cy))
    this.trackingItem = addIconText(row2, "Tracking", Textures.signal, 28, Colors.emerald, "Tracking good", text(Colors.emerald), 10)
  }

  private refreshBanner(): void {
    const today = this.store.sessionsOn(Date.now()).length
    this.todayDots.forEach((dot, i) => (dot.backgroundColor = i < today ? Colors.emerald : white(0)))
    const level = BatteryGuard.instance.effectiveLevel
    this.batteryItem.so.enabled = level >= 0
    if (level >= 0) {
      this.batteryItem.text.text = `${Math.round(level)}%`
      this.batteryItem.widthPx = layoutRow(
        [{so: this.batteryItem.icon.getSceneObject(), widthPx: 28, anchor: "center"}, textItem(this.batteryItem.text)],
        10,
        1
      )
    }
    layoutRow(this.row1Items.filter((item) => item.so.enabled), BANNER_ITEM_GAP, 1)
    this.trackingShown = null
  }
}
