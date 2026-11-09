import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Colors, white, withAlpha} from "../Theme"
import {addRoundedRect, addTriangle, createChild, place, resizeRoundedRect} from "./Primitives"

type GaugeStyle = {
  widthPx: number
  lineW: number
  lineColor: vec4
  tickColor: vec4
  /** Tick positions as fractions of the width (centre drawn separately). */
  ticks: number[]
  endTickH: number
  tickH: number
  centreW: number
  centreH: number
  centreColor: vec4
  bandH: number
  bandRadius: number
  markerW: number
  markerH: number
  /** Marker apex distance below the track line. */
  markerTop: number
  markerColor: vec4
}

/** Figma px. Origin = centre of the track line, +y up. */
export const GAUGE_STYLES = {
  /** 5:785 "Yaw gauge" (4b): target band + marker. */
  yaw: {
    widthPx: 810,
    lineW: 1.8,
    lineColor: withAlpha(Colors.cyan, 0.4),
    tickColor: withAlpha(Colors.cyan, 0.5),
    ticks: [0, 1 / 6, 2 / 6, 4 / 6, 5 / 6, 1],
    endTickH: 18,
    tickH: 14.4,
    centreW: 2.7,
    centreH: 32.4,
    centreColor: Colors.cyan,
    bandH: 25.2,
    bandRadius: 5.4,
    markerW: 21.6,
    markerH: 16.2,
    markerTop: 19.8,
    markerColor: Colors.emerald,
  } as GaugeStyle,
  /** 20:204 "Range gauge (head-locked lower band)" (1c): saved + live fills from the centre. */
  calibration: {
    widthPx: 860,
    lineW: 1.72,
    lineColor: white(0.35),
    tickColor: white(0.6),
    ticks: [0, 0.25, 0.75, 1],
    endTickH: 20.64,
    tickH: 17.2,
    centreW: 2.58,
    centreH: 34.4,
    centreColor: white(1),
    bandH: 20.64,
    bandRadius: 5.16,
    markerW: 20.64,
    markerH: 15.48,
    markerTop: 17.2,
    markerColor: Colors.cyan,
  } as GaugeStyle,
}

export type GaugeStyleName = keyof typeof GAUGE_STYLES

/** 19:214 pacer dot (22 px cyan, 2 px white ring) and 19:215 trail (6 px dots behind it). */
const PACER_DOT = 22
const TRAIL_DOT = 6
const TRAIL = [
  {behind: 55, alpha: 0.25},
  {behind: 39, alpha: 0.45},
  {behind: 23, alpha: 0.7},
]
export type GaugeSide = "left" | "right"

/**
 * RangeGauge — horizontal degree gauge: track, ticks, centre tick, a target band (4b), fills
 * from the centre to a saved / live value (1c), a marker for the live value and the pacer dot
 * with its trail (4b). Degrees map linearly onto the width over ±scaleDeg.
 *
 * Lifecycle: createComponent → set styleName / scaleDeg → initialize(); then setValue(),
 * setBand(), setFill(), setPacer(), setMarkerColor() at runtime.
 */
@component
export class RangeGauge extends BaseScriptComponent {
  styleName: GaugeStyleName = "yaw"
  /** Half-range shown by the gauge, in degrees (ends = ±scaleDeg). */
  scaleDeg = 45

  private style: GaugeStyle
  private band: RoundedRectangle
  private readonly fills: Record<GaugeSide, RoundedRectangle | null> = {left: null, right: null}
  private marker: SceneObject
  private markerVisual: RenderMeshVisual
  private pacer: SceneObject | null = null
  private trail: SceneObject
  private built = false

  get widthPx(): number {
    return GAUGE_STYLES[this.styleName].widthPx
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    const s = (this.style = GAUGE_STYLES[this.styleName])
    const root = this.sceneObject
    addRoundedRect(root, "Track", s.widthPx, s.lineW, {fill: s.lineColor, radiusPx: 0}, 0)
    for (const f of s.ticks) {
      const h = f === 0 || f === 1 ? s.endTickH : s.tickH
      const tick = addRoundedRect(root, "Tick", s.lineW, h, {fill: s.tickColor, radiusPx: 0}, 1)
      place(tick.sceneObject, (f - 0.5) * s.widthPx, 0, 1)
    }
    const centre = addRoundedRect(root, "Centre", s.centreW, s.centreH, {fill: s.centreColor, radiusPx: 0}, 3)
    place(centre.sceneObject, 0, 0, 3)

    this.band = addRoundedRect(
      root,
      "Band",
      10,
      s.bandH,
      {
        fill: withAlpha(Colors.emerald, 0.25),
        radiusPx: s.bandRadius,
        borderPx: 0.9,
        borderColor: withAlpha(Colors.emerald, 0.7),
      },
      1
    )
    this.band.sceneObject.enabled = false

    this.marker = createChild(root, "Marker")
    const top = -s.markerTop
    this.markerVisual = addTriangle(
      this.marker,
      "Triangle",
      [new vec2(0, top), new vec2(-s.markerW / 2, top - s.markerH), new vec2(s.markerW / 2, top - s.markerH)],
      s.markerColor,
      4
    )
  }

  /** x offset in px for a degree value, clamped to the gauge ends. */
  xForDeg(deg: number): number {
    const t = Math.max(-1, Math.min(1, deg / this.scaleDeg))
    return (t * this.style.widthPx) / 2
  }

  setValue(deg: number): void {
    place(this.marker, this.xForDeg(deg), 0, 4)
  }

  setMarkerVisible(visible: boolean): void {
    this.marker.enabled = visible
  }

  /** Shows the target band from `fromDeg` to `toDeg` (4b). */
  setBand(fromDeg: number, toDeg: number): void {
    const x0 = this.xForDeg(Math.min(fromDeg, toDeg))
    const x1 = this.xForDeg(Math.max(fromDeg, toDeg))
    resizeRoundedRect(this.band, Math.max(1, x1 - x0), this.style.bandH, this.style.bandRadius)
    place(this.band.sceneObject, (x0 + x1) / 2, 0, 1)
    this.band.sceneObject.enabled = true
  }

  clearBand(): void {
    this.band.sceneObject.enabled = false
  }

  /**
   * Fill from the centre to `deg` on one side (1c: saved range emerald 35 %, live range cyan 45 %).
   * `deg` is the magnitude; null hides the fill.
   */
  setFill(side: GaugeSide, deg: number | null, color: vec4): void {
    let fill = this.fills[side]
    if (deg === null || deg <= 0) {
      if (fill) fill.sceneObject.enabled = false
      return
    }
    if (!fill) {
      fill = addRoundedRect(this.sceneObject, `Fill_${side}`, 10, this.style.bandH, {fill: color, radiusPx: this.style.bandRadius}, 2)
      this.fills[side] = fill
    }
    const x = Math.abs(this.xForDeg(deg))
    resizeRoundedRect(fill, Math.max(1, x), this.style.bandH, this.style.bandRadius)
    fill.backgroundColor = color
    place(fill.sceneObject, side === "left" ? -x / 2 : x / 2, 0, 2)
    fill.sceneObject.enabled = true
  }

  setMarkerColor(color: vec4): void {
    this.markerVisual.mainPass.baseColor = color
  }

  /**
   * Pacer dot at `deg` (null hides it). `direction` is the sign of its motion; the trail fades
   * out behind a moving dot and is hidden while it waits.
   */
  setPacer(deg: number | null, direction: number): void {
    if (deg === null) {
      if (this.pacer) this.pacer.enabled = false
      return
    }
    const pacer = this.pacer ?? this.buildPacer()
    pacer.enabled = true
    place(pacer, this.xForDeg(deg), 0, 5)
    this.trail.enabled = direction !== 0
    // Trail dots are drawn for rightward motion; mirror for leftward.
    this.trail.getTransform().setLocalScale(new vec3(direction < 0 ? -1 : 1, 1, 1))
  }

  private buildPacer(): SceneObject {
    const pacer = createChild(this.sceneObject, "Pacer")
    this.pacer = pacer
    this.trail = createChild(pacer, "Trail")
    for (const dot of TRAIL) {
      const rect = addRoundedRect(this.trail, "TrailDot", TRAIL_DOT, TRAIL_DOT, {fill: withAlpha(Colors.cyan, dot.alpha)}, 5)
      place(rect.sceneObject, -dot.behind, 0, 0)
    }
    const rect = addRoundedRect(pacer, "Dot", PACER_DOT, PACER_DOT, {fill: Colors.cyan, borderPx: 2, borderColor: white(1)}, 6)
    place(rect.sceneObject, 0, 0, 1)
    return pacer
  }
}
