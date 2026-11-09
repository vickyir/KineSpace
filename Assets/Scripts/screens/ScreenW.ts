import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AudioCues} from "../AudioCues"
import {Config} from "../Config"
import {PacerController} from "../PacerController"
import {Colors, Silhouettes, Textures, Weight, white, withAlpha} from "../Theme"
import {addImage, addRoundedRect, addText, canvasPosition, createChild, place, resizeRoundedRect, textWidthPx} from "../ui/Primitives"
import {addPacerVisual, glassStyle, layoutRow, RowItem, textItem} from "../ui/Widgets"
import {ScreenBase} from "./ScreenBase"
import {EXERCISE_TITLES, MODULE_EXERCISES, ScreenId} from "./ScreenTypes"

// Figma 20:227, px.
const HALO = {x: 500, y: 580, size: 560, border: 2}
/** Hand / Open silhouette box inside the 348 × 449.5 ghost (20:259 = component 14:437 × 1.45), relative to the halo centre. */
const GHOST = {x: -20.22, y: -13.5, w: 243.16, h: 396.43}
/** No closed-hand frame exists: on "close" the halo contracts and the ghost dims (DEVIATIONS.md F17). */
const HALO_CLOSED_SCALE = 0.85
const GHOST_CLOSED_ALPHA = 0.45
const TEMPO = {top: 890, padX: 24, padTop: 16, padBottom: 18, gap: 10, barW: 200, barH: 8, radius: 24}
const UP_NEXT = {y: 1079.95, h: 69.9, padLeft: 28, padRight: 32, gap: 16, icon: 28}
const HINT_Y = 1150.5
const LINE = 1.211

type Part = "palm" | "turns"

/**
 * W · Warm-up (20:227): 1:30 of loosening, no scoring and no targets. Part 1 — open & close the
 * palm WARMUP_REPS times with the ghost guide; the tempo halo expands on open and contracts on
 * close, WARMUP_TEMPO_S each way, with a soft tone on every beat. Part 2 — slow head turns ×
 * WARMUP_REPS behind the 4d pacer dot (centre → left → centre → right → centre), never past
 * today's calibrated yaw × pace. The HUD shows the count; the warm-up pauses with the HUD and
 * can be skipped by voice once the first week is over (SessionStateMachine.canSkipWarmup).
 */
@component
export class ScreenW extends ScreenBase {
  readonly screenId: ScreenId = "W"

  private ghost: SceneObject
  private halo: SceneObject
  private ghostImage: RenderMeshVisual
  private tempoCard: RoundedRectangle
  private tempoTitle: Text
  private tempoTrack: RoundedRectangle
  private tempoFill: RoundedRectangle
  private tempoSub: Text
  private upNext: SceneObject
  private upNextPill: RoundedRectangle
  private upNextItems: RowItem[] = []
  private upNextTitle: Text
  private hint: Text
  private pacerSo: SceneObject
  private pacer: PacerController

  private part: Part = "palm"
  private cycle = 0
  private opening = true
  private beatT = 0
  private legs: [number, number][] = []
  private leg = 0
  private tooFast = false

  protected build(): void {
    const f = this.followRoot()
    const at = (so: SceneObject, x: number, y: number) => so.getTransform().setLocalPosition(canvasPosition(x, y))

    // Ghost guide + tempo halo (20:258 / 20:259), 1:1 hand scale at GHOST_DIST_CM.
    this.ghost = this.ghostRoot(f, HALO.x, HALO.y)
    this.halo = createChild(this.ghost, "TempoHalo")
    addRoundedRect(this.halo, "Halo", HALO.size, HALO.size, {fill: withAlpha(Colors.cyan, 0.1), borderPx: HALO.border, borderColor: Colors.cyan40}, 0)
    this.ghostImage = addImage(this.ghost, "GhostGuide", Silhouettes.handOpen, GHOST.w, GHOST.h, Colors.cyan, 1)
    place(this.ghostImage.getSceneObject(), GHOST.x, GHOST.y, 1)

    // Tempo card 20:261 (control fill, radius 24).
    const tempo = createChild(f, "Tempo")
    at(tempo, 500, 700)
    this.tempoCard = addRoundedRect(tempo, "Card", 10, 10, {fill: Colors.controlFill, radiusPx: TEMPO.radius}, 0)
    this.tempoTitle = addText(tempo, "Title", "", {px: 28, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.224}, 3)
    this.tempoTrack = addRoundedRect(tempo, "Track", TEMPO.barW, TEMPO.barH, {fill: white(0.2), radiusPx: TEMPO.barH / 2}, 1)
    this.tempoFill = addRoundedRect(tempo, "Fill", TEMPO.barW, TEMPO.barH, {fill: Colors.cyan, radiusPx: TEMPO.barH / 2}, 2)
    this.tempoSub = addText(tempo, "Seconds", `${Config.WARMUP_TEMPO_S} s`, {px: 24, weight: Weight.Medium, color: Colors.vibrantSecondaryOnControl}, 3)

    // Up next 20:266 (glass pill).
    this.upNext = createChild(f, "UpNext")
    at(this.upNext, 500, UP_NEXT.y)
    this.upNextPill = addRoundedRect(this.upNext, "Pill", 10, UP_NEXT.h, glassStyle(), 0)
    const icon = addImage(this.upNext, "Icon", Textures.repeat, UP_NEXT.icon, UP_NEXT.icon, Colors.cyan, 3)
    const label = addText(this.upNext, "Label", "Next", {px: 24, weight: Weight.Medium, color: Colors.vibrantSecondary}, 3)
    this.upNextTitle = addText(this.upNext, "Title", "", {px: 28, weight: Weight.SemiBold, color: Colors.textPrimary, trackingPx: -0.224}, 3)
    this.upNextItems = [{so: icon.getSceneObject(), widthPx: UP_NEXT.icon, anchor: "center"}, textItem(label), textItem(this.upNextTitle)]

    this.hint = addText(f, "Hint", "", {px: 24, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center"}, 3)
    at(this.hint.getSceneObject(), 500, HINT_Y)

    // Part 2: pacer dot, world-locked to the Neutral Forward Vector by PacerController.
    this.pacerSo = addPacerVisual(this.root)
    const pacerLogic = createChild(this.root, "PacerController")
    this.pacer = pacerLogic.createComponent(PacerController.getTypeName()) as PacerController
    this.pacer.axis = "yaw"
    this.pacer.dot = this.pacerSo
    this.pacer.onArrived.add(() => this.onLegDone())
    this.pacer.onTooFast.add((fast) => {
      this.tooFast = fast
      if (this.part === "turns") this.renderTurnText()
    })
  }

  protected onShow(): void {
    this.pacer.resume()
    this.startPalm()
  }

  protected onHide(): void {
    this.pacer.pause()
  }

  setFrozen(frozen: boolean): void {
    super.setFrozen(frozen)
    if (frozen) this.pacer.pause()
    else this.pacer.resume()
  }

  protected tick(dt: number): void {
    if (this.part === "palm") this.tickPalm(dt)
    else this.renderTurnBar()
  }

  // ─── Part 1 · open & close ─────────────────────────────────────────────

  private startPalm(): void {
    this.part = "palm"
    this.cycle = 0
    this.ghost.enabled = true
    this.pacerSo.enabled = false
    this.setUpNext(`Slow head turns × ${Config.WARMUP_REPS} — follow the dot`)
    this.hint.text = "Elbows relaxed at your sides"
    this.startBeat(true)
  }

  private startBeat(opening: boolean): void {
    this.opening = opening
    this.beatT = 0
    this.layoutTempo(opening ? "Open slowly…" : "Close slowly…", true)
    this.sm.setWarmupStatus(`Open & close · ${this.cycle + 1} of ${Config.WARMUP_REPS}`)
    AudioCues.instance.play("tempo")
  }

  private tickPalm(dt: number): void {
    this.beatT += dt
    const p = Math.min(1, this.beatT / Config.WARMUP_TEMPO_S)
    const e = p * p * (3 - 2 * p)
    const open = this.opening ? e : 1 - e
    const s = HALO_CLOSED_SCALE + (1 - HALO_CLOSED_SCALE) * open
    this.halo.getTransform().setLocalScale(new vec3(s, s, 1))
    this.ghostImage.mainPass.baseColor = withAlpha(Colors.cyan, GHOST_CLOSED_ALPHA + (1 - GHOST_CLOSED_ALPHA) * open)
    this.setBar(p)
    if (p < 1) return
    if (this.opening) {
      this.startBeat(false)
      return
    }
    this.cycle++
    if (this.cycle >= Config.WARMUP_REPS) this.startTurns()
    else this.startBeat(true)
  }

  // ─── Part 2 · slow head turns ──────────────────────────────────────────

  private startTurns(): void {
    this.part = "turns"
    this.cycle = 0
    this.ghost.enabled = false
    this.pacerSo.enabled = true
    const rom = this.store.rom
    const left = -rom.yawLeftDeg * this.ctx.targetFactor
    const right = rom.yawRightDeg * this.ctx.targetFactor
    print(`ScreenW: head turns to L ${-left}° / R ${right}° (today's yaw × ${this.ctx.targetFactor})`)
    this.legs = [
      [0, left],
      [left, 0],
      [0, right],
      [right, 0],
    ]
    const module = this.ctx.module
    if (module) this.setUpNext(EXERCISE_TITLES[MODULE_EXERCISES[module][0]])
    this.upNext.enabled = module !== null
    this.hint.text = "Sit upright · shoulders relaxed"
    this.startTurn()
  }

  private startTurn(): void {
    this.leg = 0
    this.sm.setWarmupStatus(`Head turns · ${this.cycle + 1} of ${Config.WARMUP_REPS}`)
    this.renderTurnText()
    this.pacer.startLeg(this.legs[0][0], this.legs[0][1], true)
  }

  private onLegDone(): void {
    if (!this.root.enabled || this.part !== "turns") return
    this.leg++
    if (this.leg < this.legs.length) {
      AudioCues.instance.play("tempo")
      this.pacer.startLeg(this.legs[this.leg][0], this.legs[this.leg][1])
      return
    }
    this.cycle++
    if (this.cycle >= Config.WARMUP_REPS) {
      this.sm.next()
      return
    }
    AudioCues.instance.play("tempo")
    this.startTurn()
  }

  private renderTurnText(): void {
    this.layoutTempo(this.tooFast ? "Slower, please" : "Follow the dot — slowly", false)
    this.tempoTitle.textFill.color = this.tooFast ? Colors.amber : Colors.textPrimary
  }

  /** Bar = progress through the current turn (four legs). */
  private renderTurnBar(): void {
    if (this.leg >= this.legs.length) return
    const [from, to] = this.legs[this.leg]
    const span = Math.abs(to - from)
    const legFraction = span > 0 ? Math.min(1, Math.abs(this.pacer.valueDeg - from) / span) : 1
    this.setBar((this.leg + legFraction) / this.legs.length)
  }

  // ─── Layout ────────────────────────────────────────────────────────────

  /** Tempo card 20:261: top-anchored at y 890, centred, hugging its title (min. the 200 px bar). */
  private layoutTempo(title: string, showSeconds: boolean): void {
    this.tempoTitle.text = title
    this.tempoTitle.textFill.color = Colors.textPrimary
    this.tempoSub.getSceneObject().enabled = showSeconds
    const titleH = 28 * LINE
    const subH = 24 * LINE
    const contentW = Math.max(textWidthPx(this.tempoTitle), TEMPO.barW)
    const w = contentW + TEMPO.padX * 2
    const h = TEMPO.padTop + titleH + TEMPO.gap + TEMPO.barH + (showSeconds ? TEMPO.gap + subH : 0) + TEMPO.padBottom
    // Children are placed relative to the canvas centre (500, 700).
    const top = 700 - TEMPO.top
    const left = -w / 2 + TEMPO.padX
    resizeRoundedRect(this.tempoCard, w, h, TEMPO.radius)
    place(this.tempoCard.sceneObject, 0, top - h / 2, 0)
    let y = top - TEMPO.padTop
    place(this.tempoTitle.getSceneObject(), left, y - titleH / 2, 3)
    y -= titleH + TEMPO.gap
    place(this.tempoTrack.sceneObject, left + TEMPO.barW / 2, y - TEMPO.barH / 2, 1)
    place(this.tempoFill.sceneObject, left + TEMPO.barW / 2, y - TEMPO.barH / 2, 2)
    y -= TEMPO.barH + TEMPO.gap
    place(this.tempoSub.getSceneObject(), left, y - subH / 2, 3)
  }

  private setBar(fraction: number): void {
    const w = Math.max(TEMPO.barH, TEMPO.barW * fraction)
    resizeRoundedRect(this.tempoFill, w, TEMPO.barH, TEMPO.barH / 2)
    const track = this.tempoTrack.sceneObject.getTransform().getLocalPosition()
    this.tempoFill.sceneObject.getTransform().setLocalPosition(new vec3(track.x - (Config.PX_TO_CM * (TEMPO.barW - w)) / 2, track.y, track.z + 0.02))
    this.tempoFill.sceneObject.enabled = fraction > 0
  }

  private setUpNext(title: string): void {
    this.upNextTitle.text = title
    this.upNextItems[2] = textItem(this.upNextTitle)
    const contentW = this.upNextItems.reduce((sum, item) => sum + item.widthPx, 0) + UP_NEXT.gap * (this.upNextItems.length - 1)
    const w = UP_NEXT.padLeft + contentW + UP_NEXT.padRight
    resizeRoundedRect(this.upNextPill, w, UP_NEXT.h)
    layoutRow(this.upNextItems, UP_NEXT.gap, 1, -w / 2 + UP_NEXT.padLeft)
  }
}
