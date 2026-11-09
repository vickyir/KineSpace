import {RoundedRectangle, RoundedRectBlendMode} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {IMAGE_MATERIAL_ASSET, UNIT_PLANE_MESH_ASSET} from "SpectaclesUIKit.lspkg/Scripts/Utility/Assets"
import {Config} from "../Config"
import {font, px, textSize, UNLIT_MATERIAL, Weight} from "../Theme"

/**
 * Primitives — the small builders the ui/ wrappers are made of.
 *
 * Sizes are Figma px on the WINDOW_Z_CM plane (converted with Theme.px). Positions use +y up,
 * so callers flip Figma's y axis. Stacked layers of one component are separated by LAYER_CM
 * toward the viewer so transparent layers never z-fight.
 */

export const LAYER_CM = 0.02

export function createChild(parent: SceneObject, name: string): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  return so
}

/**
 * Camera-space position (cm) of a point on the 1000 × 1400 Figma canvas, which is the display
 * at WINDOW_Z_CM with its centre (500, 700) at (0, LAYOUT_Y0_CM, −WINDOW_Z_CM).
 */
export function canvasPosition(xPx: number, yPx: number): vec3 {
  return new vec3(px(xPx - 500), Config.LAYOUT_Y0_CM + px(700 - yPx), -Config.WINDOW_Z_CM)
}

/**
 * Head-locked overlays (4d reticle, 4e level bar) sit at the same 110 cm as world-locked targets;
 * they skip the depth test so a target never hides them. Applies to the whole subtree.
 */
export function drawOnTop(so: SceneObject): void {
  for (const visual of so.getComponents("Component.RenderMeshVisual") as RenderMeshVisual[]) {
    if (visual.mainPass) visual.mainPass.depthTest = false
  }
  for (const text of so.getComponents("Component.Text") as Text[]) text.depthTest = false
  for (let i = 0; i < so.getChildrenCount(); i++) drawOnTop(so.getChild(i))
}

/** Places `so` at (x, y) px in its parent's plane, `layer` LAYER_CM steps toward the viewer. */
export function place(so: SceneObject, xPx: number, yPx: number, layer = 0): void {
  so.getTransform().setLocalPosition(new vec3(px(xPx), px(yPx), layer * LAYER_CM))
}

// ─── Text ────────────────────────────────────────────────────────────────────

export type TextStyle = {
  px: number
  weight: Weight
  color: vec4
  /** Where the text sits relative to its object's origin. Default "left". */
  align?: "left" | "center" | "right"
  /** Wrap width in px (centred on the origin); omit for a single line. */
  wrapWidthPx?: number
  /** Figma line-height multiple (e.g. 1.4); omit for "normal". */
  lineHeight?: number
  /** Figma letter-spacing in px (e.g. −0.78 on 52 px titles). */
  trackingPx?: number
}

/** Inter (ascender + descender) / unitsPerEm — the "normal" line height Lens lays out with. */
const INTER_NORMAL_LINE_HEIGHT = 1.211
/** Half-height of every text layout rect: taller than the whole canvas. */
const TEXT_RECT_HALF_HEIGHT_PX = 1400
/**
 * Text.letterSpacing per em of Figma tracking (measured in Lens Studio 5.24: one letterSpacing unit
 * adds 0.0279 cm × Text.size per character gap), so letterSpacing = this × trackingPx / fontPx.
 */
const LETTER_SPACING_PER_TRACKING_EM = 0.8036

export function addText(parent: SceneObject, name: string, value: string, style: TextStyle, renderOrder = 0): Text {
  const so = createChild(parent, name)
  const text = so.createComponent("Component.Text") as Text
  text.font = font(style.weight)
  text.size = textSize(style.px)
  text.textFill.color = style.color
  text.renderOrder = renderOrder
  const align = style.align ?? "left"
  text.horizontalAlignment =
    align === "left" ? HorizontalAlignment.Left : align === "right" ? HorizontalAlignment.Right : HorizontalAlignment.Center
  text.verticalAlignment = VerticalAlignment.Center
  text.verticalOverflow = VerticalOverflow.Overflow
  if (style.lineHeight !== undefined) {
    text.lineSpacing = style.lineHeight / INTER_NORMAL_LINE_HEIGHT
  }
  if (style.trackingPx !== undefined) {
    text.letterSpacing = (LETTER_SPACING_PER_TRACKING_EM * style.trackingPx) / style.px
  }
  // A zero-height rect truncates every line below the origin, so give the block a tall rect
  // centred on the origin (vertical centring is unchanged).
  const halfHeight = px(TEXT_RECT_HALF_HEIGHT_PX)
  if (style.wrapWidthPx !== undefined) {
    const half = px(style.wrapWidthPx) / 2
    text.layoutRect = Rect.create(-half, half, -halfHeight, halfHeight)
    text.horizontalOverflow = HorizontalOverflow.Wrap
  } else {
    text.layoutRect = Rect.create(0, 0, -halfHeight, halfHeight)
    text.horizontalOverflow = HorizontalOverflow.Overflow
  }
  text.text = value
  return text
}

/**
 * Last measured width per Text, keyed by its content and font. Text.getBoundingBox() is rate
 * limited per frame, so layouts re-measure only when the string or font actually changed.
 */
const widthCache = new WeakMap<Text, {key: string; widthPx: number}>()

/** Laid-out width of a single-line text, in Figma px. */
export function textWidthPx(text: Text): number {
  const key = `${text.text}|${text.size}|${text.font ? text.font.name : ""}`
  const cached = widthCache.get(text)
  if (cached && cached.key === key) return cached.widthPx
  const box = text.getBoundingBox()
  const widthPx = (box.right - box.left) / Config.PX_TO_CM
  widthCache.set(text, {key, widthPx})
  return widthPx
}

/** Laid-out height of a (wrapped) text block, in Figma px — measured once per string, like textWidthPx. */
const heightCache = new WeakMap<Text, {key: string; heightPx: number}>()

export function textHeightPx(text: Text): number {
  const key = `${text.text}|${text.size}|${text.font ? text.font.name : ""}`
  const cached = heightCache.get(text)
  if (cached && cached.key === key) return cached.heightPx
  const box = text.getBoundingBox()
  const heightPx = (box.top - box.bottom) / Config.PX_TO_CM
  heightCache.set(text, {key, heightPx})
  return heightPx
}

// ─── Rounded rectangles (UI Kit shape) ────────────────────────────────────────

export type RectStyle = {
  fill: vec4
  /** Corner radius in px; default is a pill (half the shorter side). */
  radiusPx?: number
  borderPx?: number
  borderColor?: vec4
}

export function addRoundedRect(
  parent: SceneObject,
  name: string,
  wPx: number,
  hPx: number,
  style: RectStyle,
  renderOrder = 0
): RoundedRectangle {
  const so = createChild(parent, name)
  const rect = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  rect.size = new vec2(px(wPx), px(hPx))
  rect.cornerRadius = px(style.radiusPx ?? Math.min(wPx, hPx) / 2)
  rect.backgroundColor = style.fill
  if (style.borderPx !== undefined) {
    rect.border = true
    rect.borderType = "Color"
    rect.borderSize = px(style.borderPx)
    rect.borderColor = style.borderColor
  }
  rect.blendMode = RoundedRectBlendMode.Normal
  rect.renderOrder = renderOrder
  rect.initialize()
  return rect
}

/** Resizes a rounded rectangle built by addRoundedRect, keeping it a pill when it was one. */
export function resizeRoundedRect(rect: RoundedRectangle, wPx: number, hPx: number, radiusPx?: number): void {
  rect.size = new vec2(px(wPx), px(hPx))
  rect.cornerRadius = px(radiusPx ?? Math.min(wPx, hPx) / 2)
}

/**
 * Turns a rounded rectangle into a radial glow: `center` at the middle fading to `edge` at
 * `fadeAt` (0 = centre, 1 = rim). The gradient follows the rectangle's aspect, matching
 * Figma's elliptical radial fills.
 */
export function setRadialGradient(rect: RoundedRectangle, center: vec4, edge: vec4, fadeAt: number): void {
  rect.gradient = true
  rect.setBackgroundGradient({
    enabled: true,
    type: "Radial",
    start: new vec2(0, 0),
    end: new vec2(1, 0),
    stop0: {enabled: true, percent: 0, color: center},
    stop1: {enabled: true, percent: fadeAt, color: edge},
    stop2: {enabled: true, percent: 1, color: edge},
  })
}

// ─── Images (tinted textures on a unit plane) ─────────────────────────────────

export function addImage(
  parent: SceneObject,
  name: string,
  texture: Texture,
  wPx: number,
  hPx: number,
  color: vec4,
  renderOrder = 0
): RenderMeshVisual {
  const so = createChild(parent, name)
  const visual = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = UNIT_PLANE_MESH_ASSET
  visual.mainMaterial = IMAGE_MATERIAL_ASSET.clone()
  visual.mainPass.baseTex = texture
  visual.mainPass.baseColor = color
  visual.renderOrder = renderOrder
  so.getTransform().setLocalScale(new vec3(px(wPx), px(hPx), 1))
  return visual
}

export function setImageColor(image: RenderMeshVisual, color: vec4): void {
  image.mainPass.baseColor = color
}

// ─── Procedural meshes (unlit) ────────────────────────────────────────────────

function unlitMaterial(color: vec4): Material {
  const material = UNLIT_MATERIAL.clone()
  material.mainPass.baseColor = color
  material.mainPass.blendMode = BlendMode.Normal
  material.mainPass.twoSided = true
  material.mainPass.depthWrite = false
  return material
}

function newBuilder(): MeshBuilder {
  const builder = new MeshBuilder([{name: "position", components: 3}])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  return builder
}

function clearBuilder(builder: MeshBuilder): void {
  if (builder.getIndicesCount() > 0) builder.eraseIndices(0, builder.getIndicesCount())
  if (builder.getVerticesCount() > 0) builder.eraseVertices(0, builder.getVerticesCount())
}

/**
 * Ring segment that fills clockwise from 12 o'clock — dwell rings, hold timers, tracks.
 * `setFraction(1)` draws the full ring.
 */
export class Arc {
  readonly sceneObject: SceneObject
  private readonly builder = newBuilder()
  private readonly visual: RenderMeshVisual
  private fraction = -1

  constructor(
    parent: SceneObject,
    name: string,
    private readonly outerRadiusPx: number,
    private readonly innerRadiusPx: number,
    color: vec4,
    renderOrder = 0,
    private readonly segments = 72
  ) {
    this.sceneObject = createChild(parent, name)
    this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.visual.mainMaterial = unlitMaterial(color)
    this.visual.renderOrder = renderOrder
    this.setFraction(1)
  }

  setFraction(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction))
    if (f === this.fraction) return
    this.fraction = f
    clearBuilder(this.builder)
    const steps = Math.max(1, Math.ceil(this.segments * f))
    if (f > 0) {
      const outer = px(this.outerRadiusPx)
      const inner = px(this.innerRadiusPx)
      const sweep = 2 * Math.PI * f
      for (let i = 0; i <= steps; i++) {
        const angle = (sweep * i) / steps
        const s = Math.sin(angle)
        const c = Math.cos(angle)
        this.builder.appendVerticesInterleaved([s * outer, c * outer, 0, s * inner, c * inner, 0])
        if (i < steps) {
          const k = i * 2
          this.builder.appendIndices([k, k + 1, k + 2, k + 1, k + 3, k + 2])
        }
      }
    }
    this.builder.updateMesh()
    this.visual.mesh = this.builder.getMesh()
    this.visual.enabled = f > 0
  }

  setColor(color: vec4): void {
    this.visual.mainPass.baseColor = color
  }
}

/**
 * Dashed ring: `dashes` equal arcs, each `duty` of its slot, the first centred on 12 o'clock
 * (4a "dashed amber target ring", 4d centre and next-target rings).
 */
export class DashedRing {
  readonly sceneObject: SceneObject
  private readonly arcs: Arc[] = []

  constructor(
    parent: SceneObject,
    name: string,
    outerRadiusPx: number,
    innerRadiusPx: number,
    dashes: number,
    color: vec4,
    renderOrder = 0,
    duty = 0.5
  ) {
    this.sceneObject = createChild(parent, name)
    const step = 360 / dashes
    for (let i = 0; i < dashes; i++) {
      const arc = new Arc(this.sceneObject, `Dash${i}`, outerRadiusPx, innerRadiusPx, color, renderOrder, 8)
      arc.setFraction(duty / dashes)
      // Arcs grow clockwise from 12 o'clock; rotate each so the dashes are centred on their slots.
      const angle = -(i * step - (step * duty) / 2) * (Math.PI / 180)
      arc.sceneObject.getTransform().setLocalRotation(quat.angleAxis(angle, vec3.forward()))
      this.arcs.push(arc)
    }
  }

  setColor(color: vec4): void {
    this.arcs.forEach((arc) => arc.setColor(color))
  }
}

/**
 * Outline of a centred rounded rectangle (px, +y up), clockwise from the top edge, as a closed
 * polyline for DashedLine (4g tracking zone).
 */
export function roundedRectOutline(wPx: number, hPx: number, radiusPx: number, cornerSegments = 8): vec2[] {
  const hw = wPx / 2
  const hh = hPx / 2
  const r = Math.min(radiusPx, hw, hh)
  const corners = [
    {cx: hw - r, cy: hh - r, from: 90},
    {cx: hw - r, cy: -hh + r, from: 0},
    {cx: -hw + r, cy: -hh + r, from: -90},
    {cx: -hw + r, cy: hh - r, from: 180},
  ]
  const points: vec2[] = []
  for (const c of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = ((c.from - (90 * i) / cornerSegments) * Math.PI) / 180
      points.push(new vec2(c.cx + r * Math.cos(a), c.cy + r * Math.sin(a)))
    }
  }
  return points
}

/**
 * Dashed (or solid) stroke along a polyline in its parent's plane — 4e target horizon,
 * 4g tracking-zone border. One mesh, so a long dashed line is a single draw call.
 */
export class DashedLine {
  readonly sceneObject: SceneObject
  private readonly builder = newBuilder()
  private readonly visual: RenderMeshVisual

  constructor(parent: SceneObject, name: string, color: vec4, renderOrder = 0) {
    this.sceneObject = createChild(parent, name)
    this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.visual.mainMaterial = unlitMaterial(color)
    this.visual.renderOrder = renderOrder
  }

  /**
   * Strokes `points` (px) `widthPx` wide: dashes `dashPx` long with `gapPx` gaps, the pattern
   * starting `phasePx` into the first dash. `gapPx` ≤ 0 draws a solid line.
   */
  setPath(points: vec2[], closed: boolean, widthPx: number, dashPx: number, gapPx: number, phasePx = 0): void {
    const path = closed ? points.concat([points[0]]) : points
    const lengths = [0]
    for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + path[i].distance(path[i - 1]))
    const total = lengths[lengths.length - 1]
    const pointAt = (s: number): vec2 => {
      let i = 1
      while (i < path.length - 1 && lengths[i] < s) i++
      const span = lengths[i] - lengths[i - 1]
      const t = span > 0 ? (s - lengths[i - 1]) / span : 0
      return path[i - 1].add(path[i].sub(path[i - 1]).uniformScale(t))
    }

    clearBuilder(this.builder)
    const half = px(widthPx) / 2
    let k = 0
    const quad = (a: vec2, b: vec2) => {
      const d = b.sub(a)
      if (d.length < 1e-4) return
      const n = new vec2(-d.y, d.x).normalize().uniformScale(half)
      const ax = px(a.x)
      const ay = px(a.y)
      const bx = px(b.x)
      const by = px(b.y)
      this.builder.appendVerticesInterleaved([ax + n.x, ay + n.y, 0, ax - n.x, ay - n.y, 0, bx + n.x, by + n.y, 0, bx - n.x, by - n.y, 0])
      this.builder.appendIndices([k, k + 1, k + 2, k + 1, k + 3, k + 2])
      k += 4
    }
    const stroke = (s0: number, s1: number) => {
      let previous = pointAt(s0)
      for (let i = 1; i < path.length; i++) {
        if (lengths[i] <= s0 || lengths[i] >= s1) continue
        quad(previous, path[i])
        previous = path[i]
      }
      quad(previous, pointAt(s1))
    }
    if (gapPx <= 0) {
      stroke(0, total)
    } else {
      const period = dashPx + gapPx
      for (let s = -phasePx; s < total; s += period) {
        const s0 = Math.max(0, s)
        const s1 = Math.min(total, s + dashPx)
        if (s1 > s0) stroke(s0, s1)
      }
    }
    this.builder.updateMesh()
    this.visual.mesh = this.builder.getMesh()
  }

  setColor(color: vec4): void {
    this.visual.mainPass.baseColor = color
  }
}

/**
 * Round dots at world positions, each facing `eye` — the 4d dotted path, which follows the
 * pitch arc at WINDOW_Z_CM. The object is kept at the world origin so vertices are world points.
 */
export class WorldDots {
  readonly sceneObject: SceneObject
  private readonly builder = newBuilder()
  private readonly visual: RenderMeshVisual

  constructor(parent: SceneObject, name: string, color: vec4, renderOrder = 0) {
    this.sceneObject = createChild(parent, name)
    this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.visual.mainMaterial = unlitMaterial(color)
    this.visual.renderOrder = renderOrder
  }

  setDots(points: vec3[], radiusCm: number, eye: vec3, segments = 8): void {
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(vec3.zero())
    t.setWorldRotation(quat.quatIdentity())
    t.setWorldScale(vec3.one())
    clearBuilder(this.builder)
    let k = 0
    for (const p of points) {
      const n = eye.sub(p).normalize()
      let u = vec3.up().cross(n)
      if (u.length < 1e-4) u = vec3.right()
      u = u.normalize().uniformScale(radiusCm)
      const v = n.cross(u.normalize()).uniformScale(radiusCm)
      this.builder.appendVerticesInterleaved([p.x, p.y, p.z])
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments
        const q = p.add(u.uniformScale(Math.cos(a))).add(v.uniformScale(Math.sin(a)))
        this.builder.appendVerticesInterleaved([q.x, q.y, q.z])
        this.builder.appendIndices([k, k + 1 + i, k + 1 + ((i + 1) % segments)])
      }
      k += segments + 1
    }
    this.builder.updateMesh()
    this.visual.mesh = this.builder.getMesh()
    this.visual.enabled = points.length > 0
  }
}

/** Filled triangle from three px points — gauge markers and arrows. */
export function addTriangle(
  parent: SceneObject,
  name: string,
  points: [vec2, vec2, vec2],
  color: vec4,
  renderOrder = 0
): RenderMeshVisual {
  const so = createChild(parent, name)
  const builder = newBuilder()
  for (const p of points) builder.appendVerticesInterleaved([px(p.x), px(p.y), 0])
  builder.appendIndices([0, 1, 2])
  builder.updateMesh()
  const visual = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = builder.getMesh()
  visual.mainMaterial = unlitMaterial(color)
  visual.renderOrder = renderOrder
  return visual
}
