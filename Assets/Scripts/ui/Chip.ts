import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Colors, font, Weight} from "../Theme"
import {addImage, addRoundedRect, addText, createChild, resizeRoundedRect, TextStyle} from "./Primitives"
import {layoutRow, RowItem, textItem} from "./Widgets"

// Figma label chips (4d 20:332 / 20:340, 4e 20:405 / 20:411): control-fill pill, px.
const PAD_LEFT = 20
const PAD_RIGHT = 24
const PAD_Y = 12
const ICON_GAP = 10
/** Inter "normal" line height. */
const LINE = 1.211

export type ChipIcon = {texture: Texture; px: number; color: vec4}

/**
 * Chip — the small control-fill label pills next to head targets and under the 4e horizon
 * ("Up · 24°", "Centre", "You", "Target", "↑ Follow the dot — slowly"). Not interactive.
 * Origin = pill centre; `left()` places it by its left edge as Figma does.
 */
export class Chip {
  readonly sceneObject: SceneObject
  private readonly pill: RoundedRectangle
  private readonly label: Text
  private readonly icon: RenderMeshVisual | null = null
  private readonly iconPx: number = 0
  private readonly style: TextStyle
  private width = 0

  constructor(parent: SceneObject, name: string, text: string, style: TextStyle, icon?: ChipIcon, renderOrder = 0) {
    this.sceneObject = createChild(parent, name)
    this.style = style
    this.pill = addRoundedRect(this.sceneObject, "Pill", 10, this.heightPx, {fill: Colors.controlFill}, renderOrder)
    if (icon) {
      this.icon = addImage(this.sceneObject, "Icon", icon.texture, icon.px, icon.px, icon.color, renderOrder + 3)
      this.iconPx = icon.px
    }
    this.label = addText(this.sceneObject, "Text", text, style, renderOrder + 3)
    this.layout()
  }

  get widthPx(): number {
    return this.width
  }

  get heightPx(): number {
    return PAD_Y * 2 + this.style.px * LINE
  }

  get iconVisual(): RenderMeshVisual | null {
    return this.icon
  }

  setText(text: string, color?: vec4): void {
    if (color) this.label.textFill.color = color
    if (this.label.text === text) return
    this.label.text = text
    this.layout()
  }

  /** Active / next label styles (4d "Up · 24°" SemiBold primary vs "Down · 28°" Medium secondary). */
  setStyle(color: vec4, weight: Weight): void {
    this.label.textFill.color = color
    if (this.label.font === font(weight)) return
    this.label.font = font(weight)
    this.layout()
  }

  setIconVisible(visible: boolean): void {
    if (!this.icon || this.icon.getSceneObject().enabled === visible) return
    this.icon.getSceneObject().enabled = visible
    this.layout()
  }

  private layout(): void {
    const items: RowItem[] = []
    if (this.icon && this.icon.getSceneObject().enabled) {
      items.push({so: this.icon.getSceneObject(), widthPx: this.iconPx, anchor: "center"})
    }
    items.push(textItem(this.label))
    const contentW = items.reduce((sum, item) => sum + item.widthPx, 0) + ICON_GAP * (items.length - 1)
    this.width = PAD_LEFT + contentW + PAD_RIGHT
    resizeRoundedRect(this.pill, this.width, this.heightPx)
    layoutRow(items, ICON_GAP, 1, -this.width / 2 + PAD_LEFT)
  }
}
