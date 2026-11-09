import {Colors, Weight, white, withAlpha} from "../Theme"
import {addImage, addRoundedRect, addText, createChild, place, RectStyle, TextStyle, textWidthPx} from "./Primitives"

/**
 * Widgets — small composites shared by several screens (step indicator, glass pills, icon +
 * text rows) and a row layout helper mirroring Figma's horizontal auto-layout.
 */

/** A laid-out item. Text objects are anchored at their left edge, everything else at its centre. */
export type RowItem = {so: SceneObject; widthPx: number; anchor: "left" | "center"}

export const BORDER_PX = 1.5

/** Window / chip glass: tinted plate + 1.5 px edge highlight (DEVIATIONS.md P1). */
export function glassStyle(radiusPx?: number): RectStyle {
  return {fill: Colors.glassFill, radiusPx, borderPx: BORDER_PX, borderColor: Colors.glassEdge}
}

export function textItem(text: Text): RowItem {
  return {so: text.getSceneObject(), widthPx: textWidthPx(text), anchor: "left"}
}

/** Lays `items` out left → right, centred on x = 0 (or starting at `left` when given). */
export function layoutRow(items: RowItem[], gapPx: number, layer = 1, left?: number, y = 0): number {
  const total = items.reduce((sum, item) => sum + item.widthPx, 0) + gapPx * Math.max(0, items.length - 1)
  let x = left ?? -total / 2
  for (const item of items) {
    place(item.so, item.anchor === "left" ? x : x + item.widthPx / 2, y, layer)
    x += item.widthPx + gapPx
  }
  return total
}

// Figma "Step Indicator" (5:7 / 5:68 …): "Step n of 4" + one segment per step.
const STEP_TEXT_PX = 24
const STEP_GAP = 14
const SEGMENT_GAP = 8
const SEGMENT_H = 8
const SEGMENT_W = 28
const SEGMENT_CURRENT_W = 56

/** "Step n of N" with segments: done cyan 70 %, current cyan (wide), upcoming cyan 20 %. */
export function addStepIndicator(parent: SceneObject, step: number, total: number, renderOrder = 3): RowItem {
  const so = createChild(parent, "StepIndicator")
  const label = addText(so, "Label", `Step ${step} of ${total}`, {px: STEP_TEXT_PX, weight: Weight.SemiBold, color: Colors.cyan}, renderOrder)
  const segments: RowItem[] = []
  for (let i = 1; i <= total; i++) {
    const current = i === step
    const w = current ? SEGMENT_CURRENT_W : SEGMENT_W
    const color = current ? Colors.cyan : i < step ? Colors.cyan70 : Colors.cyan20
    const seg = addRoundedRect(so, `Segment${i}`, w, SEGMENT_H, {fill: color, radiusPx: SEGMENT_H / 2}, renderOrder)
    segments.push({so: seg.sceneObject, widthPx: w, anchor: "center"})
  }
  const segmentsW = segments.reduce((s, item) => s + item.widthPx, 0) + SEGMENT_GAP * (total - 1)
  const labelItem = textItem(label)
  const width = labelItem.widthPx + STEP_GAP + segmentsW
  let x = -width / 2
  place(labelItem.so, x, 0, 1)
  x += labelItem.widthPx + STEP_GAP
  for (const seg of segments) {
    place(seg.so, x + seg.widthPx / 2, 0, 1)
    x += seg.widthPx + SEGMENT_GAP
  }
  return {so, widthPx: width, anchor: "center"}
}

/** Icon followed by text, centred on its object (Figma icon/… + label frames). */
export function addIconText(
  parent: SceneObject,
  name: string,
  icon: Texture,
  iconPx: number,
  iconColor: vec4,
  value: string,
  style: TextStyle,
  gapPx: number,
  renderOrder = 3
): RowItem & {text: Text; icon: RenderMeshVisual} {
  const so = createChild(parent, name)
  const image = addImage(so, "Icon", icon, iconPx, iconPx, iconColor, renderOrder)
  const text = addText(so, "Text", value, style, renderOrder)
  const items: RowItem[] = [{so: image.getSceneObject(), widthPx: iconPx, anchor: "center"}, textItem(text)]
  const width = layoutRow(items, gapPx, 1)
  return {so, widthPx: width, anchor: "center", text, icon: image}
}

/**
 * Lays `items` (children of `so`) out as a centred row and puts a pill behind them
 * (Figma auto-layout pill: padding left / right, fixed height). Returns the pill width.
 */
export function pillAround(
  so: SceneObject,
  items: RowItem[],
  gapPx: number,
  padLeft: number,
  padRight: number,
  heightPx: number,
  style: RectStyle,
  renderOrder = 0
): number {
  const contentW = items.reduce((sum, item) => sum + item.widthPx, 0) + gapPx * Math.max(0, items.length - 1)
  const width = contentW + padLeft + padRight
  layoutRow(items, gapPx, 1, -width / 2 + padLeft)
  addRoundedRect(so, "Pill", width, heightPx, style, renderOrder)
  return width
}

// 4d pacer: 20:337 halo 76 px cyan 20 %, 20:338 dot 30 px cyan with a 2 px white ring.
const PACER_HALO = 76
const PACER_DOT = 30

/** The pacer dot the user follows (4d, also W part 2). Origin = dot centre. */
export function addPacerVisual(parent: SceneObject, name = "Pacer", renderOrder = 0): SceneObject {
  const so = createChild(parent, name)
  addRoundedRect(so, "Halo", PACER_HALO, PACER_HALO, {fill: withAlpha(Colors.cyan, 0.2)}, renderOrder)
  const dot = addRoundedRect(so, "Dot", PACER_DOT, PACER_DOT, {fill: Colors.cyan, borderPx: 2, borderColor: white(1)}, renderOrder + 1)
  place(dot.sceneObject, 0, 0, 1)
  return so
}

/** Vertical divider (visionOS/Separator), 1.5 px wide. */
export function addDivider(parent: SceneObject, heightPx: number, renderOrder = 2): RowItem {
  const rect = addRoundedRect(parent, "Divider", BORDER_PX, heightPx, {fill: Colors.separator, radiusPx: 0}, renderOrder)
  return {so: rect.sceneObject, widthPx: BORDER_PX, anchor: "center"}
}

/** Converts a Figma frame's absolute box to a centre offset from a parent box (+y up). */
export function offsetIn(
  parent: {x: number; y: number; w: number; h: number},
  child: {x: number; y: number; w: number; h: number}
): vec2 {
  return new vec2(child.x + child.w / 2 - (parent.x + parent.w / 2), -(child.y + child.h / 2 - (parent.y + parent.h / 2)))
}
