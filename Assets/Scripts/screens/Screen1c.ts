import {AudioCues} from "../AudioCues"
import {RangeOfMotion} from "../CalibrationStore"
import {Config} from "../Config"
import {HoldTimer} from "../HoldTimer"
import {Colors, Weight, withAlpha} from "../Theme"
import {Badge} from "../ui/Badge"
import {addText, canvasPosition, createChild} from "../ui/Primitives"
import {GaugeSide, RangeGauge} from "../ui/RangeGauge"
import {addDivider, addStepIndicator, glassStyle, pillAround, textItem} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

type Axis = "yaw" | "pitch" | "roll"

type CalibrationStep = {
  axis: Axis
  /** +1 / −1: which sign of the metric this step measures. */
  sign: 1 | -1
  key: keyof RangeOfMotion
  /** Direction word in the readout and badge ("Left · 31°", "Left saved · 31°"). */
  direction: string
  title: string
  /** Gauge end labels: negative side, positive side. */
  ends: [string, string]
}

const MAX = Config.CAL_GAUGE_MAX_DEG
/**
 * Yaw copy is Figma 20:190 (left mirrors right). Pitch and roll have no Figma frame yet
 * (DEVIATIONS.md F7): their copy is DRAFT, built from existing Figma phrasing, until the
 * designer supplies 1c-pitch / 1c-roll frames.
 */
const STEPS: CalibrationStep[] = [
  {axis: "yaw", sign: -1, key: "yawLeftDeg", direction: "Left", title: "Turn your head left — only as far as is comfortable", ends: [`L ${MAX}°`, `R ${MAX}°`]},
  {axis: "yaw", sign: 1, key: "yawRightDeg", direction: "Right", title: "Turn your head right — only as far as is comfortable", ends: [`L ${MAX}°`, `R ${MAX}°`]},
  // DRAFT copy ↓
  {axis: "pitch", sign: 1, key: "pitchUpDeg", direction: "Up", title: "Look up — only as far as is comfortable", ends: [`Down ${MAX}°`, `Up ${MAX}°`]},
  {axis: "pitch", sign: -1, key: "pitchDownDeg", direction: "Down", title: "Look down — only as far as is comfortable", ends: [`Down ${MAX}°`, `Up ${MAX}°`]},
  {axis: "roll", sign: -1, key: "rollLeftDeg", direction: "Left", title: "Tilt your left ear toward your shoulder — only as far as is comfortable", ends: [`L ${MAX}°`, `R ${MAX}°`]},
  {axis: "roll", sign: 1, key: "rollRightDeg", direction: "Right", title: "Tilt your right ear toward your shoulder — only as far as is comfortable", ends: [`L ${MAX}°`, `R ${MAX}°`]},
]

/** 20:204 fills: saved range emerald 35 %, live range cyan 45 %. */
const SAVED_FILL = withAlpha(Colors.emerald, 0.35)
const LIVE_FILL = withAlpha(Colors.cyan, 0.45)
/** Pause after a save so the chime and badge register before the next direction. */
const SAVED_HOLD_S = 0.8

/**
 * 1c · Calibration — Step 3 · Comfortable head range. All UI soft head-locked (the user turns
 * away). For each direction the user turns slowly to the first sign of tension and holds
 * HEAD_RANGE_HOLD_S within CAL_LIMIT_STABLE_DEG → saved as Max_ROM_User. Faster than
 * TOO_FAST_DEG_S pauses capture with "Slower, please". The gauge fills the saved side emerald
 * and the live side cyan (20:204).
 */
@component
export class Screen1c extends ScreenBase {
  readonly screenId: ScreenId = "1c"

  private title: Text
  private subtitle: Text
  private timer: HoldTimer
  private readout: Text
  private badgeSo: SceneObject
  private badge: Badge
  private gauge: RangeGauge
  private leftLabel: Text
  private rightLabel: Text
  private index = 0
  private anchor = 0
  private best = 0
  private saving = false

  protected build(): void {
    const f = this.followRoot()
    const at = (so: SceneObject, x: number, y: number) => so.getTransform().setLocalPosition(canvasPosition(x, y))

    // Step chip 20:180
    const chip = createChild(f, "StepChip")
    pillAround(
      chip,
      [
        addStepIndicator(chip, 3, 4),
        addDivider(chip, 30),
        textItem(addText(chip, "Label", "Comfortable head range", {px: 24, weight: Weight.Medium, color: Colors.textPrimary}, 3)),
      ],
      20,
      28,
      28,
      65,
      glassStyle()
    )
    at(chip, 500, 92.5)

    this.title = addText(f, "Title", "", {px: 48, weight: Weight.Bold, color: Colors.textPrimary, align: "center", wrapWidthPx: 880, lineHeight: 1.15, trackingPx: -0.72}, 3)
    at(this.title.getSceneObject(), 500, 225)
    this.subtitle = addText(f, "Subtitle", "", {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: 880, trackingPx: -0.224}, 3)
    at(this.subtitle.getSceneObject(), 500, 313)

    const timerSo = createChild(f, "HoldTimer")
    this.timer = timerSo.createComponent(HoldTimer.getTypeName()) as HoldTimer
    this.timer.holdSeconds = Config.HEAD_RANGE_HOLD_S
    this.timer.initialize()
    this.timer.onComplete.add(() => this.save())
    at(timerSo, 500, 500)

    this.readout = addText(f, "Readout", "", {px: 44, weight: Weight.Bold, color: Colors.cyan, align: "center", trackingPx: -0.66}, 3)
    at(this.readout.getSceneObject(), 500, 648.5)

    this.badgeSo = createChild(f, "Saved")
    this.badge = this.badgeSo.createComponent(Badge.getTypeName()) as Badge
    this.badge.tone = "Success"
    this.badge.text = ""
    this.badge.initialize()
    at(this.badgeSo, 500.5, 720.5)

    const gaugeSo = createChild(f, "Gauge")
    this.gauge = gaugeSo.createComponent(RangeGauge.getTypeName()) as RangeGauge
    this.gauge.styleName = "calibration"
    this.gauge.scaleDeg = MAX
    this.gauge.initialize()
    at(gaugeSo, 500, 884.5)

    const labelStyle = {px: 24, weight: Weight.Medium, color: Colors.vibrantSecondary}
    this.leftLabel = addText(f, "LeftEnd", "", {...labelStyle, align: "left"}, 3)
    at(this.leftLabel.getSceneObject(), 70, 952.3)
    const centre = addText(f, "Centre", "0°", {...labelStyle, align: "center"}, 3)
    at(centre.getSceneObject(), 500, 952.3)
    this.rightLabel = addText(f, "RightEnd", "", {...labelStyle, align: "right"}, 3)
    at(this.rightLabel.getSceneObject(), 930, 952.3)
  }

  protected onShow(): void {
    const pct = Math.round(this.ctx.targetFactor * 100)
    this.subtitle.text = `Move slowly. Hold ${Config.HEAD_RANGE_HOLD_S} s at your limit — targets will use ${pct}% of it.`
    this.badgeSo.enabled = false
    this.index = 0
    this.applyStep(true)
  }

  protected tick(dt: number): void {
    const step = STEPS[this.index]
    const value = this.metric(step.axis)
    const along = value * step.sign
    this.gauge.setValue(value)
    this.gauge.setFill(this.side(step), Math.max(0, along), LIVE_FILL)
    if (this.saving) return

    if (this.head.speedDegS > Config.TOO_FAST_DEG_S) {
      this.readout.text = "Slower, please"
      this.readout.textFill.color = Colors.amber
      return
    }
    this.readout.text = `${step.direction} · ${Math.round(Math.max(0, along))}°`
    this.readout.textFill.color = Colors.cyan
    AudioCues.instance.approach(Math.max(0, along) / MAX)

    const atLimit = along > Config.RETURN_CENTRE_DEG
    if (atLimit && Math.abs(value - this.anchor) <= Config.CAL_LIMIT_STABLE_DEG) {
      this.best = Math.max(this.best, along)
      this.timer.tick(dt, true)
    } else {
      this.anchor = value
      this.best = Math.max(0, along)
      this.timer.tick(dt, false)
    }
  }

  private save(): void {
    const step = STEPS[this.index]
    const degrees = Math.round(this.best * 10) / 10
    this.store.setRom({[step.key]: degrees} as Partial<RangeOfMotion>)
    AudioCues.instance.play("saved")
    this.badge.setText(`${step.direction} saved · ${Math.round(degrees)}°`)
    this.badgeSo.enabled = true
    this.saving = true
    this.after(SAVED_HOLD_S, () => {
      this.index++
      if (this.index >= STEPS.length) {
        this.sm.next()
      } else {
        this.applyStep(STEPS[this.index].axis !== step.axis)
      }
    })
  }

  private applyStep(newAxis: boolean): void {
    const step = STEPS[this.index]
    this.saving = false
    this.title.text = step.title
    this.leftLabel.text = step.ends[0]
    this.rightLabel.text = step.ends[1]
    this.timer.reset()
    this.anchor = this.metric(step.axis)
    this.best = 0
    if (newAxis) {
      this.gauge.setFill("left", null, SAVED_FILL)
      this.gauge.setFill("right", null, SAVED_FILL)
    } else {
      // The other side of this axis was just saved: keep it, emerald.
      const previous = STEPS[this.index - 1]
      this.gauge.setFill(this.side(previous), this.store.rom[previous.key], SAVED_FILL)
    }
  }

  private side(step: CalibrationStep): GaugeSide {
    return step.sign < 0 ? "left" : "right"
  }

  private metric(axis: Axis): number {
    return axis === "yaw" ? this.head.yawDeg : axis === "pitch" ? this.head.pitchDeg : this.head.rollDeg
  }
}
