import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Colors, white, withAlpha} from "../Theme"
import {addRoundedRect, Arc, createChild, DashedRing, place} from "./Primitives"

export type BubbleState = "idle" | "next" | "approaching"

// Figma 19:193 / 19:199 "Bubble · … fingertip", px (64 × 64).
const SIZE = 64
const R = SIZE / 2
const IDLE_RING = 2
const NEXT_RING = 3
const FILL_ALPHA = 0.18
/** Glint: 16 × 10 ellipse at (23.4, 18.3), rotated −30° (counter-clockwise), white 70 %. */
const HIGHLIGHT = {w: 16, h: 10, x: 23.43 - R, y: R - 18.33, deg: 30}
const DASHES = 12

/**
 * FingertipBubble — 4a target on a fingertip (19:193–19:199): idle white bubble, the next
 * finger's cyan bubble (Joint Node "neutral"), and the spec's dashed amber ring while the thumb
 * approaches. Hand-anchored (callers pin it with ScreenBase.pinToPoint); no text.
 */
export class FingertipBubble {
  readonly sceneObject: SceneObject
  private readonly fill: RoundedRectangle
  private readonly idleRing: Arc
  private readonly nextRing: Arc
  private readonly dashed: DashedRing
  private state: BubbleState | null = null

  constructor(parent: SceneObject, name: string, renderOrder: number) {
    const so = createChild(parent, name)
    this.sceneObject = so
    this.fill = addRoundedRect(so, "Fill", SIZE, SIZE, {fill: white(0.08)}, renderOrder)
    this.idleRing = new Arc(so, "Ring", R, R - IDLE_RING, white(0.6), renderOrder + 1)
    place(this.idleRing.sceneObject, 0, 0, 1)
    this.nextRing = new Arc(so, "NextRing", R, R - NEXT_RING, Colors.cyan, renderOrder + 1)
    place(this.nextRing.sceneObject, 0, 0, 1)
    this.dashed = new DashedRing(so, "TargetRing", R, R - NEXT_RING, DASHES, Colors.amber, renderOrder + 1)
    place(this.dashed.sceneObject, 0, 0, 1)
    const glint = addRoundedRect(so, "Glint", HIGHLIGHT.w, HIGHLIGHT.h, {fill: white(0.7)}, renderOrder + 2)
    place(glint.sceneObject, HIGHLIGHT.x, HIGHLIGHT.y, 2)
    glint.sceneObject.getTransform().setLocalRotation(quat.angleAxis((HIGHLIGHT.deg * Math.PI) / 180, vec3.forward()))
    this.setState("idle")
  }

  setState(state: BubbleState): void {
    if (state === this.state) return
    this.state = state
    this.idleRing.sceneObject.enabled = state === "idle"
    this.nextRing.sceneObject.enabled = state === "next"
    this.dashed.sceneObject.enabled = state === "approaching"
    this.fill.backgroundColor =
      state === "idle" ? white(0.08) : withAlpha(state === "next" ? Colors.cyan : Colors.amber, FILL_ALPHA)
  }
}
