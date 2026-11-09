import SmoothFollow from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/modules/SmoothFollow"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Colors, px, Radius} from "../Theme"
import {addRoundedRect, createChild, place} from "./Primitives"

/** Window edge highlight width (Figma: 1.5 px border, white 40 %). */
const BORDER = 1.5
/**
 * SmoothFollow pushes panels wider than its 26° budget beyond 110 cm (1.1 × w / 2 / tan 13°).
 * The canvas is designed for exactly WINDOW_Z_CM, so the width it sees is capped at the widest
 * panel that still stays there (≈ 46 cm).
 */
const FOLLOW_MAX_VISIBLE_WIDTH_CM = (2 * 110 * Math.tan((13 * Math.PI) / 180)) / 1.1

/**
 * Window — the device version of visionOS "Glass · Window": a UI Kit RoundedRectangle plate at
 * a low neutral tint with an edge highlight (no blur exists on Spectacles). With `lazyFollow`
 * the window is world-locked where it spawns and drifts back into view with UI Kit Frame's
 * SmoothFollow when the user turns away — never rigidly head-locked. With `plate = false` it is
 * an invisible follow group for screens made of several glass elements (Hub).
 *
 * Lifecycle: createComponent → set size / flags → initialize(); then spawn(position, rotation)
 * each time the screen opens. Add children under `content` (origin = window centre, +y up).
 */
@component
export class Window extends BaseScriptComponent {
  widthPx = 880
  heightPx = 744
  radiusPx = Radius.window
  plate = true
  lazyFollow = true

  private contentRoot: SceneObject
  private follow: SmoothFollow | null = null
  private readonly followUpdate = new Event<void>()
  private built = false

  get content(): SceneObject {
    return this.contentRoot
  }

  initialize(): void {
    if (this.built) return
    this.built = true
    if (this.plate) {
      addRoundedRect(
        this.sceneObject,
        "Glass",
        this.widthPx,
        this.heightPx,
        {fill: Colors.glassFill, radiusPx: this.radiusPx, borderPx: BORDER, borderColor: Colors.glassEdge},
        0
      )
    }
    this.contentRoot = createChild(this.sceneObject, "Content")
    place(this.contentRoot, 0, 0, 2)
    this.createEvent("UpdateEvent").bind(() => {
      if (this.follow) this.followUpdate.invoke()
    })
    this.createEvent("OnDestroyEvent").bind(() => this.follow?.destroy())
  }

  /** Places the window (world-locked) and restarts lazy-follow from there. */
  spawn(position: vec3, rotation: quat): void {
    const transform = this.getTransform()
    transform.setWorldPosition(position)
    transform.setWorldRotation(rotation)
    this.follow?.destroy()
    this.follow = null
    if (!this.lazyFollow) return
    const idle = new Event<void>()
    const resized = new Event<vec3>()
    this.follow = new SmoothFollow({
      transform,
      visibleWidth: Math.min(px(this.widthPx), FOLLOW_MAX_VISIBLE_WIDTH_CM),
      onFollowUpdate: this.followUpdate.publicApi(),
      onDragStart: idle.publicApi(),
      onDragEnd: idle.publicApi(),
      onScalingStart: idle.publicApi(),
      onScalingEnd: idle.publicApi(),
      onSizeChanged: resized.publicApi(),
    })
  }
}
