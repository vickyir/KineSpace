import {AudioCues} from "../AudioCues"
import {BatteryGuard} from "../BatteryGuard"
import {CalibrationStore} from "../CalibrationStore"
import {Config} from "../Config"
import {FINGERS, HandMetrics} from "../HandMetrics"
import {HeadAimDwell} from "../HeadAimDwell"
import {HeadMetrics} from "../HeadMetrics"
import {SessionStateMachine} from "../SessionStateMachine"
import {Colors, Weight, white} from "../Theme"
import {LazyFollow} from "../ui/LazyFollow"
import {formatClock} from "../ui/PhaseStrip"
import {attachUIKitButton} from "../ui/PhysioButton"
import {addRoundedRect, addText, canvasPosition, createChild, place, textWidthPx} from "../ui/Primitives"
import {VoiceCommands} from "../VoiceCommands"

/** Refresh rate of the readout (Hz) — text layout is not free. */
const REFRESH_HZ = 5
const TEXT_PX = 19
const LINE_HEIGHT = 1.25
const PANEL_W = 960
const PANEL_Y = 1262
const BUTTON_H = 44
const BUTTON_GAP = 8
const BUTTON_ROW_Y = [1060, 1110]

/**
 * Camera-space position of a canvas point with the canvas centred on camera forward — the
 * overlay stays on the rendered display whatever LAYOUT_Y0_CM is set to.
 */
function forwardPosition(xPx: number, yPx: number): vec3 {
  return canvasPosition(xPx, yPx).add(new vec3(0, -Config.LAYOUT_Y0_CM, 0))
}

function sign(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no"
}

/**
 * DebugOverlay (dev only) — live metrics of every Phase 2 service in the lower band of the
 * view, plus small pinch-only buttons that drive the flow in the Lens Studio preview.
 * Toggle with the Inspector checkbox or by saying "debug". Disable the object for release.
 */
@component
export class DebugOverlay extends BaseScriptComponent {
  @input
  @hint("Show the overlay when the Lens starts. Say \"debug\" to toggle at runtime.")
  showOverlay: boolean = true

  private root: SceneObject
  private left: Text
  private right: Text
  private sinceRefresh = 0

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  toggle(): void {
    this.root.enabled = !this.root.enabled
  }

  private build(): void {
    this.root = createChild(this.sceneObject, "DebugOverlay")
    this.root.createComponent(LazyFollow.getTypeName())
    const panel = createChild(this.root, "Panel")
    panel.getTransform().setLocalPosition(forwardPosition(500, PANEL_Y))
    const style = {px: TEXT_PX, weight: Weight.Regular, color: Colors.textPrimary, lineHeight: LINE_HEIGHT}
    this.left = addText(panel, "Left", "", style, 51)
    place(this.left.getSceneObject(), -PANEL_W / 2 + 16, 0, 1)
    this.right = addText(panel, "Right", "", style, 51)
    place(this.right.getSceneObject(), 16, 0, 1)

    const sm = () => SessionStateMachine.instance
    this.buttonRow(BUTTON_ROW_Y[0], [
      ["Next", () => sm().next()],
      ["Rep ✓", () => sm().completeRep(true)],
      ["Rep (fast)", () => sm().completeRep(false)],
      ["Neutral", () => HeadMetrics.instance.captureNeutral()],
      ["Pause", () => sm().togglePause()],
      ["Pain", () => sm().reportPain()],
    ])
    this.buttonRow(BUTTON_ROW_Y[1], [
      ["Battery 10%", () => BatteryGuard.instance.simulate(10)],
      ["Hand L/R", () => HandMetrics.instance.setSide(HandMetrics.instance.side === "right" ? "left" : "right")],
      ['Say "skip"', () => VoiceCommands.instance.simulate("skip")],
      ['Say "continue"', () => VoiceCommands.instance.simulate("continue")],
      ["Restart", () => sm().start()],
      ["Reset data", () => {
        CalibrationStore.instance.reset()
        sm().start()
      }],
    ])

    this.root.enabled = this.showOverlay
    VoiceCommands.instance.onTranscript.add((transcript) => {
      if (` ${transcript} `.indexOf(" debug ") >= 0) this.toggle()
    })
  }

  /** A row of small pinch-only dev buttons, centred on the canvas. */
  private buttonRow(y: number, buttons: [string, () => void][]): void {
    const row = createChild(this.root, `Buttons${y}`)
    row.getTransform().setLocalPosition(forwardPosition(500, y))
    const items = buttons.map(([label, action]) => {
      const so = createChild(row, label)
      const text = addText(so, "Label", label, {px: TEXT_PX, weight: Weight.Medium, color: Colors.textPrimary, align: "center"}, 53)
      const width = textWidthPx(text) + 32
      const fill = addRoundedRect(so, "Fill", width, BUTTON_H, {fill: white(0.12)}, 52)
      place(text.getSceneObject(), 0, 0, 1)
      attachUIKitButton(so, "Capsule", width, BUTTON_H, fill, {fill: white(0.12), hover: white(0.2), pressed: white(0.3)}, action)
      return {so, width}
    })
    const total = items.reduce((sum, item) => sum + item.width, 0) + BUTTON_GAP * (items.length - 1)
    let x = -total / 2
    for (const item of items) {
      place(item.so, x + item.width / 2, 0)
      x += item.width + BUTTON_GAP
    }
  }

  private update(): void {
    if (!this.root || !this.root.enabled) return
    this.sinceRefresh += getDeltaTime()
    if (this.sinceRefresh < 1 / REFRESH_HZ) return
    this.sinceRefresh = 0
    this.left.text = this.flowAndHead()
    this.right.text = this.handAndDevice()
  }

  private flowAndHead(): string {
    const sm = SessionStateMachine.instance
    const c = sm.context
    const head = HeadMetrics.instance
    const aim = HeadAimDwell.instance
    const built = sm.registeredScreens
    const flags = [sm.isPaused ? "PAUSED" : "", sm.isTrackingLost ? "4g TRACKING LOST" : ""].filter((f) => f).join(" ")
    return [
      `FLOW  ${sm.state}  ${flags}`,
      `      ex ${c.exercise ?? "—"} · set ${c.set}/${Config.SETS} · rep ${c.rep}/${Config.REPS_PER_SET} · total ${c.totalReps} (${c.smoothReps} smooth)`,
      `      ${formatClock(sm.elapsedS)} · module ${c.module ?? "—"} · pace ${c.pace} · target ×${c.targetFactor.toFixed(2)}`,
      `      screens built: ${built.length > 0 ? built.join(" ") : "none yet"}`,
      `HEAD  yaw ${sign(head.yawDeg)}° · pitch ${sign(head.pitchDeg)}° · roll ${sign(head.rollDeg)}°`,
      `      speed ${head.speedDegS.toFixed(0)}°/s${head.speedDegS > Config.TOO_FAST_DEG_S ? "  TOO FAST" : ""} · drop ${sign(head.heightDropCm)} cm · neutral ${yesNo(head.hasNeutral)}`,
      `AIM   ${aim.target ? `"${aim.target.voicePhrases[0] ?? "?"}" ${(aim.progress * 100).toFixed(0)}%` : "—"}`,
      `AUDIO ${AudioCues.instance.lastLine ? `"${AudioCues.instance.lastLine}"` : "—"}`,
    ].join("\n")
  }

  private handAndDevice(): string {
    const hand = HandMetrics.instance
    const store = CalibrationStore.instance
    const voice = VoiceCommands.instance
    const battery = BatteryGuard.instance
    const rom = store.rom
    const perFinger = (values: Record<string, number>, digits: number) =>
      FINGERS.map((f) => `${f[0]} ${values[f].toFixed(digits)}`).join(" ")
    const mcp: Record<string, number> = {}
    const pip: Record<string, number> = {}
    FINGERS.forEach((f) => {
      mcp[f] = hand.flexion[f].mcpDeg
      pip[f] = hand.flexion[f].pipDeg
    })
    const level = battery.effectiveLevel
    return [
      `HAND  ${hand.side} · tracked ${yesNo(hand.tracked)} · good ${yesNo(hand.trackingGood)}${hand.lowConfidence ? ` · ${hand.lowConfidence}` : ""}`,
      `      facing ${yesNo(hand.facingCamera)} ${hand.facingAngleDeg === null ? "" : `${hand.facingAngleDeg.toFixed(0)}°`} · spread ${hand.fingerSpreadCm.toFixed(1)} cm`,
      `      thumb→ ${perFinger(hand.thumbToTipCm, 1)} cm`,
      `      MCP ${perFinger(mcp, 0)}° · PIP ${perFinger(pip, 0)}°`,
      `VOICE ${voice.status} · "${voice.lastTranscript}"`,
      `BATT  ${level < 0 ? "n/a" : `${level.toFixed(0)}%`}${battery.charging ? " charging" : ""}${battery.simulatedLevel >= 0 ? " (simulated)" : ""}`,
      `STORE hand ${store.hand} · sessions ${store.sessionCount} · next ${store.nextTargetAdjustment} · first run done ${yesNo(store.firstRunDone)}`,
      `      ROM yaw L${rom.yawLeftDeg.toFixed(0)} R${rom.yawRightDeg.toFixed(0)} · pitch U${rom.pitchUpDeg.toFixed(0)} D${rom.pitchDownDeg.toFixed(0)} · roll L${rom.rollLeftDeg.toFixed(0)} R${rom.rollRightDeg.toFixed(0)} · spread ${rom.fingerSpreadCm.toFixed(1)}`,
    ].join("\n")
  }
}
