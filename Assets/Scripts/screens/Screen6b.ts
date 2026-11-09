import {Config} from "../Config"
import {Colors, Textures, Weight, withAlpha} from "../Theme"
import {PhysioButton} from "../ui/PhysioButton"
import {addImage, addRoundedRect, addText, createChild} from "../ui/Primitives"
import {Window} from "../ui/Window"
import {ScreenBase} from "./ScreenBase"
import {ScreenId} from "./ScreenTypes"

// Figma 20:715 — Safety Stop Card 20:725 at (60, 316), 880 × 769. Child positions are canvas centres, px.
const CARD = {x: 60, y: 316, w: 880, h: 769}
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD.h / 2
const TEXT_W = 765
/** 20:726: 100 px coral 20 % circle with the 54 px alert icon 2 px above its centre. */
const ICON = {y: 415.5, size: 100, glyph: 54, glyphDy: 2}
const TITLE_Y = 518.5
const BODY_Y = 610.5
/** 20:732 rows: 26 px check, text 38 px right of the row's left edge (x 117.5), wrapping at 727 px. */
const ROW = {left: 117.5, textX: 38, textW: 727, check: 26, rows: [691.5, 759.5]}
const OKAY_Y = 869.5
const VIEW_Y = 985.5

/**
 * 6b · Pain reported — safety stop (20:715). Reached from 6a "Pain", the HUD Stop button or
 * voice "stop". The session has already ended for today: the next target drops to
 * TARGET_AFTER_PAIN and the log is flagged for the physio (stored on this device only).
 * "Okay" records the session and ends; "View progress" opens the summary. Calm and short,
 * no diagnosis; coral only here and on Stop.
 */
@component
export class Screen6b extends ScreenBase {
  readonly screenId: ScreenId = "6b"

  private window: Window

  protected build(): void {
    const so = createChild(this.root, "SafetyStopCard")
    this.window = so.createComponent(Window.getTypeName()) as Window
    this.window.widthPx = CARD.w
    this.window.heightPx = CARD.h
    this.window.initialize()
    const c = this.window.content
    const at = (item: SceneObject, x: number, y: number) => this.placeCanvas(item, x, y, CARD_CX, CARD_CY, 1)

    const circle = addRoundedRect(c, "AlertCircle", ICON.size, ICON.size, {fill: withAlpha(Colors.coral, 0.2)}, 1)
    at(circle.sceneObject, 500, ICON.y)
    const alert = addImage(c, "Alert", Textures.alert, ICON.glyph, ICON.glyph, Colors.coral, 3)
    this.placeCanvas(alert.getSceneObject(), 500, ICON.y - ICON.glyphDy, CARD_CX, CARD_CY, 2)

    const title = addText(c, "Title", "Let’s stop for today", {px: 48, weight: Weight.Bold, color: Colors.textPrimary, align: "center", trackingPx: -0.72}, 3)
    at(title.getSceneObject(), 500, TITLE_Y)
    const body = addText(
      c,
      "Body",
      "You reported pain. Rest, and check with your physiotherapist before your next session.",
      {px: 28, weight: Weight.Regular, color: Colors.vibrantSecondary, align: "center", wrapWidthPx: TEXT_W, lineHeight: 1.4, trackingPx: -0.224},
      3
    )
    at(body.getSceneObject(), 500, BODY_Y)

    const rows = [
      `Next session starts at a lower target (${Math.round(Config.TARGET_AFTER_PAIN * 100)}% of your range)`,
      "Saved on this device for your physio (sharing comes in a later version)",
    ]
    rows.forEach((text, i) => {
      const y = ROW.rows[i]
      const check = addImage(c, `Check${i}`, Textures.check, ROW.check, ROW.check, Colors.emerald, 3)
      at(check.getSceneObject(), ROW.left + ROW.check / 2, y)
      const label = addText(
        c,
        `Row${i}`,
        text,
        {px: 26, weight: Weight.Regular, color: Colors.textPrimary, align: "left", wrapWidthPx: ROW.textW, lineHeight: 1.4},
        3
      )
      at(label.getSceneObject(), ROW.left + ROW.textX + ROW.textW / 2, y)
    })

    const okaySo = createChild(c, "Okay")
    const okay = okaySo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    okay.label = "Okay"
    okay.style = "Primary"
    okay.initialize()
    okay.onPressed.add(() => this.sm.finish())
    at(okaySo, 500, OKAY_Y)

    const viewSo = createChild(c, "ViewProgress")
    const view = viewSo.createComponent(PhysioButton.getTypeName()) as PhysioButton
    view.label = "View progress"
    view.style = "Secondary"
    view.initialize()
    view.onPressed.add(() => this.sm.showSummary())
    at(viewSo, 500, VIEW_Y)
  }

  protected onShow(): void {
    const pose = this.spawnPose(CARD_CX, CARD_CY)
    this.window.spawn(pose.position, pose.rotation)
  }
}
