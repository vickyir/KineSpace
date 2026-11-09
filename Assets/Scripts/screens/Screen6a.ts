import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {RangeOfMotion, SessionRecord} from "../CalibrationStore"
import {Config} from "../Config"
import {Colors, Weight} from "../Theme"
import {ComfortOptions} from "../ui/ComfortOptions"
import {PhysioButton} from "../ui/PhysioButton"
import {addRoundedRect, addText, createChild, place, resizeRoundedRect, textHeightPx} from "../ui/Primitives"
import {Window} from "../ui/Window"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 20:665 — Summary Card at (50, 145), 900 wide. Captions are raised from 22 to 24 px
// (DEVIATIONS.md F30), which makes the metric row 4.8 px taller; everything below moves down by that.
const CARD = {x: 50, y: 145, w: 900}
const CAPTION_GROWTH = 4.8
const CARD_H = 936.5 + CAPTION_GROWTH
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD_H / 2
const TEXT_W = 785
/** Card-relative vertical centres / tops, px. */
const TITLE_Y = 74.5
const SUBTITLE_Y = 145
const METRICS_TOP = 186.5
const DIVIDER_Y = 457.25 + CAPTION_GROWTH
const QUESTION_Y = 502 + CAPTION_GROWTH
const OPTIONS_Y = 586 + CAPTION_GROWTH
const HINT_Y = 666.5 + CAPTION_GROWTH
const BUTTON_Y = 757 + CAPTION_GROWTH
const FOOTER_Y = 862 + CAPTION_GROWTH
/** 20:669 metric tiles: 248.33 wide, 20 apart, radius 28, padding 22 / 24, gap 6. */
const TILE = {w: 248.33, gap: 20, radius: 28, padTop: 22, padBottom: 24, padX: 24, spacing: 6}
const TILE_TEXT_W = TILE.w - TILE.padX * 2
const LABEL_PX = 24
const VALUE_PX = 56
const CAPTION_PX = 24
const CAPTION_LINE = 1.35
const LINE = 1.211

type Metric = {value: string; caption: string | null; highlight: boolean}

type Tile = {bg: RoundedRectangle; label: Text; value: Text; caption: Text}

/**
 * 6a · Session summary & comfort check (20:645). Today against the first session and last week
 * (finger spread, comfortable neck turn, smooth reps), progress toward the daily goal, then
 * "How do your neck and hands feel?" — Good / A bit sore / Pain (pinch, voice or 3 s dwell).
 * "A bit sore" lowers the next target by SORE_DELTA; "Pain" goes to the safety stop (6b).
 * "Done" records the session. Also the end of the 10-min cap and of a low-battery stop.
 */
@component
export class Screen6a extends ScreenBase {
  readonly screenId: ScreenId = "6a"

  private window: Window
  private subtitle: Text
  private readonly tiles: Tile[] = []
  private comfort: ComfortOptions

  protected build(): void {
    const so = createChild(this.root, "SummaryCard")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = CARD.w
    this.window.heightPx = CARD_H
    this.window.initialize()
    const c = this.window.content
    /** Card-relative (x from the card's left, y from its top) → content offset. */
    const at = (item: SceneObject, x: number, y: number) => place(item, x - CARD.w / 2, CARD_H / 2 - y, 1)

    const title = addText(c, "Title", "Nice work — session complete", {px: 48, weight: Weight.Bold, color: Colors.textPrimary, align: "center", trackingPx: -0.72}, 3)
    at(title.getSceneObject(), CARD.w / 2, TITLE_Y)
    this.subtitle = addText(c, "Subtitle", "", {px: 26, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center"}, 3)
    at(this.subtitle.getSceneObject(), CARD.w / 2, SUBTITLE_Y)

    const labels = ["Finger spread", "Comfortable neck turn", "Slow, smooth movement"]
    labels.forEach((text, i) => {
      const tile = createChild(c, `Metric_${i}`)
      at(tile, 57.5 + i * (TILE.w + TILE.gap), METRICS_TOP)
      const bg = addRoundedRect(tile, "Fill", TILE.w, 100, {fill: Colors.recessedTrack, radiusPx: TILE.radius}, 1)
      const left = {px: 0, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "left" as const, wrapWidthPx: TILE_TEXT_W}
      const label = addText(tile, "Label", text, {...left, px: LABEL_PX, weight: Weight.Medium}, 3)
      const value = addText(tile, "Value", "", {px: VALUE_PX, weight: Weight.Bold, color: Colors.textPrimary, trackingPx: -0.84}, 3)
      const caption = addText(tile, "Caption", "", {...left, px: CAPTION_PX, lineHeight: CAPTION_LINE}, 3)
      this.tiles.push({bg, label, value, caption})
    })

    const divider = addRoundedRect(c, "Divider", TEXT_W, 1.5, {fill: Colors.separator, radiusPx: 0}, 2)
    at(divider.sceneObject, CARD.w / 2, DIVIDER_Y)
    const question = addText(c, "Question", "How do your neck and hands feel?", {px: 30, weight: Weight.SemiBold, color: Colors.textPrimary, align: "center", trackingPx: -0.24}, 3)
    at(question.getSceneObject(), CARD.w / 2, QUESTION_Y)

    const optionsSo = createChild(c, "ComfortOptions")
    this.comfort = optionsSo.createComponent(ComfortOptions.getTypeName()) as ComfortOptions
    this.comfort.initialize()
    this.comfort.onChosen.add((comfort) => this.sm.setComfort(comfort))
    at(optionsSo, CARD.w / 2, OPTIONS_Y)

    const hint = addText(c, "Hint", "Pinch, say it, or aim the centre dot for 3 s", {px: 24, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center"}, 3)
    at(hint.getSceneObject(), CARD.w / 2, HINT_Y)

    const buttonSo = createChild(c, "Done")
    const button = buttonSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = "Done"
    button.style = "Primary"
    button.initialize()
    button.onPressed.add(() => this.sm.finish())
    at(buttonSo, CARD.w / 2, BUTTON_Y)

    const footer = addText(
      c,
      "Footer",
      `Next session suggested in about ${Config.NEXT_SESSION_H} hours — take the glasses off and rest`,
      {px: 24, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: TEXT_W},
      3
    )
    at(footer.getSceneObject(), CARD.w / 2, FOOTER_Y)
  }

  protected onShow(): void {
    const pose = this.spawnPose(CARD_CX, CARD_CY)
    this.window.spawn(pose.position, pose.rotation)
    this.comfort.setSelected(this.sm.comfortChoice)

    const now = Date.now()
    const store = this.store
    const ctx = this.sm.context
    const minutes = Math.max(1, Math.round(ctx.elapsedS / 60))
    const exercises = this.sm.exercisesRun
    const today = store.sessionsOn(now).length + 1
    this.subtitle.text =
      `${minutes} min · ${plural(exercises, "exercise")} · ${plural(ctx.totalReps, "rep")} · ` +
      `session ${today} of ${Config.DAILY_GOAL_SESSIONS} today`

    const rom = store.rom
    const first = store.firstSession()
    const metrics = [
      fingerSpread(rom, store.lastWeek(now), first),
      neckTurn(rom, first),
      smoothness(ctx.smoothReps, ctx.totalReps),
    ]
    metrics.forEach((metric, i) => this.layoutTile(this.tiles[i], metric))
  }

  /** Tile hugs its content, top-aligned in the row (Figma auto-layout). */
  private layoutTile(tile: Tile, metric: Metric): void {
    tile.value.text = metric.value
    tile.value.textFill.color = metric.highlight ? Colors.emerald : Colors.textPrimary
    tile.caption.text = metric.caption ?? ""
    tile.caption.getSceneObject().enabled = metric.caption !== null
    const labelH = textHeightPx(tile.label)
    const valueH = VALUE_PX * LINE
    const captionH = metric.caption !== null ? textHeightPx(tile.caption) : 0
    const h = TILE.padTop + labelH + TILE.spacing + valueH + (captionH > 0 ? TILE.spacing + captionH : 0) + TILE.padBottom
    // Tile origin = its top-left corner; children are placed by their top edge.
    resizeRoundedRect(tile.bg, TILE.w, h, TILE.radius)
    place(tile.bg.sceneObject, TILE.w / 2, -h / 2, 0)
    let y = -TILE.padTop
    place(tile.label.getSceneObject(), TILE.w / 2, y - labelH / 2, 1)
    y -= labelH + TILE.spacing
    place(tile.value.getSceneObject(), TILE.padX, y - valueH / 2, 1)
    y -= valueH + TILE.spacing
    place(tile.caption.getSceneObject(), TILE.w / 2, y - captionH / 2, 1)
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/** Change in %, signed ("+12%", "−4%"). */
function change(today: number, before: number): string {
  const pct = Math.round((today / before - 1) * 100)
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`
}

/** Finger spread vs last week's average (Figma), else vs the first session, else today's value. */
function fingerSpread(rom: RangeOfMotion, lastWeek: SessionRecord[], first: SessionRecord | null): Metric {
  const today = rom.fingerSpreadCm
  if (today <= 0) return {value: "—", caption: null, highlight: false}
  const week = lastWeek.map((s) => s.rom.fingerSpreadCm).filter((v) => v > 0)
  if (week.length > 0) {
    const avg = week.reduce((a, b) => a + b, 0) / week.length
    return {value: change(today, avg), caption: "vs last week", highlight: today > avg}
  }
  const firstSpread = first ? first.rom.fingerSpreadCm : 0
  if (firstSpread > 0) return {value: change(today, firstSpread), caption: "vs your first session", highlight: today > firstSpread}
  return {value: `${today.toFixed(1)} cm`, caption: null, highlight: false}
}

/** Mean of today's left and right yaw (whichever are calibrated). */
function turnDeg(rom: RangeOfMotion): number {
  const sides = [rom.yawLeftDeg, rom.yawRightDeg].filter((v) => v > 0)
  return sides.length > 0 ? sides.reduce((a, b) => a + b, 0) / sides.length : 0
}

function neckTurn(rom: RangeOfMotion, first: SessionRecord | null): Metric {
  const today = turnDeg(rom)
  if (today <= 0) return {value: "—", caption: null, highlight: false}
  const before = first ? turnDeg(first.rom) : 0
  const caption = before > 0 ? `was ${Math.round(before)}° in your first session` : null
  return {value: `${Math.round(today)}°`, caption, highlight: false}
}

function smoothness(smooth: number, total: number): Metric {
  if (total <= 0) return {value: "—", caption: "of reps within the speed limit", highlight: false}
  return {value: `${Math.round((smooth / total) * 100)}%`, caption: "of reps within the speed limit", highlight: false}
}
