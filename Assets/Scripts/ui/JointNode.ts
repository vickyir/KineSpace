import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Colors, withAlpha} from "../Theme"
import {addRoundedRect, place, setRadialGradient} from "./Primitives"

export type JointStatus = "Neutral" | "Approaching" | "Reached"

/** Cyan = neutral, amber = approaching, emerald = target reached (3:105). */
const STATUS_COLORS: Record<JointStatus, vec4> = {
  Neutral: Colors.cyan,
  Approaching: Colors.amber,
  Reached: Colors.emerald,
}

// Figma 3:105 "Joint Node", px: halo r24 at 20 %, core r12, glow blur 8 at 90 %.
const HALO = 48
const CORE = 24
const GLOW = 64
const HALO_ALPHA = 0.2
const GLOW_ALPHA = 0.5

/**
 * JointNode — dot anchored to a SIK hand keypoint (no text: near-field content).
 * Sizes are Figma px at WINDOW_Z_CM; hand-anchored callers scale the object for distance.
 *
 * Lifecycle: createComponent → set status → initialize(); then setStatus() at runtime.
 */
@component
export class JointNode extends BaseScriptComponent {
  status: JointStatus = "Neutral"

  private glow: RoundedRectangle
  private halo: RoundedRectangle
  private core: RoundedRectangle
  private built = false

  initialize(): void {
    if (this.built) return
    this.built = true
    const root = this.sceneObject
    this.glow = addRoundedRect(root, "Glow", GLOW, GLOW, {fill: withAlpha(Colors.cyan, 0)}, 0)
    this.halo = addRoundedRect(root, "Halo", HALO, HALO, {fill: Colors.cyan20}, 1)
    place(this.halo.sceneObject, 0, 0, 1)
    this.core = addRoundedRect(root, "Core", CORE, CORE, {fill: Colors.cyan}, 2)
    place(this.core.sceneObject, 0, 0, 2)
    this.setStatus(this.status)
  }

  setStatus(status: JointStatus): void {
    this.status = status
    if (!this.built) return
    const color = STATUS_COLORS[status]
    this.halo.backgroundColor = withAlpha(color, HALO_ALPHA)
    this.core.backgroundColor = color
    setRadialGradient(this.glow, withAlpha(color, GLOW_ALPHA), withAlpha(color, 0), 1)
  }
}
