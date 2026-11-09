import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "./Config"
import {HeadMetrics} from "./HeadMetrics"
import {Colors, Textures} from "./Theme"
import {addImage, Arc, createChild} from "./ui/Primitives"
import {Target, Targets} from "./ui/Targets"

/** Aim dot size (Figma 25:295, px at WINDOW_Z_CM). */
const AIM_DOT_PX = 44
/** Ray length; targets live on the 110 cm plane or nearer. */
const RAY_CM = 300
/** Render on top of every window and HUD element. */
const AIM_DOT_RENDER_ORDER = 1000

/**
 * True while the target still exists and is shown. Reading `sceneObject` on a destroyed
 * component throws ("Object is null"), so the check is guarded.
 */
function isLive(target: Target): boolean {
  try {
    const so = target.sceneObject
    return !isNull(so) && so.isEnabledInHierarchy
  } catch (e) {
    return false
  }
}

/**
 * HeadAimDwell — "gaze" dwell without eye tracking: a ray from the eye through the display
 * centre (HeadMetrics.aimDirection), shown as the rigidly head-locked Aim dot (25:295). Aiming at
 * a target fills its dwell ring over DWELL_S; aiming off keeps the progress for DWELL_GRACE_MS,
 * then resets. A pressed target must be aimed off once before it can be dwelled again.
 */
@component
export class HeadAimDwell extends BaseScriptComponent {
  static instance: HeadAimDwell

  /** Master switch (screens without buttons, debug). */
  dwellEnabled = true

  private readonly targetEvent = new Event<Target | null>()
  /** Fires when the aimed target changes (null = nothing aimed). */
  readonly onTargetChanged: PublicApi<Target | null> = this.targetEvent.publicApi()

  private readonly probe = Physics.createGlobalProbe()
  private current: Target | null = null
  private progressValue = 0
  private graceLeft = 0
  private spent: Target | null = null
  private aimDot: SceneObject
  private aimRing: Arc

  onAwake() {
    HeadAimDwell.instance = this
    this.createEvent("OnStartEvent").bind(() => this.createAimDot())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  get target(): Target | null {
    return this.current
  }

  get progress(): number {
    return this.progressValue
  }

  /** Shows or hides the Aim dot (it is also hidden while dwell is disabled). */
  setAimDotVisible(visible: boolean): void {
    if (this.aimDot) this.aimDot.enabled = visible
  }

  private createAimDot(): void {
    const head = HeadMetrics.instance
    this.aimDot = createChild(head.cameraTransform.getSceneObject(), "AimDot")
    this.aimDot.getTransform().setLocalPosition(new vec3(0, Config.LAYOUT_Y0_CM, -Config.WINDOW_Z_CM))
    const image = addImage(this.aimDot, "Dot", Textures.aimDot, AIM_DOT_PX, AIM_DOT_PX, Colors.textPrimary, AIM_DOT_RENDER_ORDER)
    image.mainPass.depthTest = false
    // Dwell ring for targets without their own (segments, cards) — same stroke as the button ring.
    this.aimRing = new Arc(this.aimDot, "DwellRing", AIM_DOT_PX / 2 + 6, AIM_DOT_PX / 2 + 2.08, Colors.textPrimary, AIM_DOT_RENDER_ORDER)
    this.aimRing.setFraction(0)
  }

  /** Mirrors the dwell progress on the Aim dot ring when the target has no ring of its own. */
  private showRing(progress: number): void {
    this.aimRing?.setFraction(this.current && !this.current.ownsDwellFeedback ? progress : 0)
  }

  private update(): void {
    const head = HeadMetrics.instance
    if (!head) return
    // Drop targets that were destroyed or hidden since last frame (their screen closed).
    if (this.current && !isLive(this.current)) {
      this.current = null
      this.progressValue = 0
      this.graceLeft = 0
      this.aimRing?.setFraction(0)
      this.targetEvent.invoke(null)
    }
    if (this.spent && !isLive(this.spent)) this.spent = null
    const aimed = this.dwellEnabled ? this.raycast(head) : null
    if (this.spent && aimed !== this.spent) this.spent = null

    if (aimed && aimed === this.current) {
      this.graceLeft = Config.DWELL_GRACE_MS / 1000
      if (aimed !== this.spent) this.setProgress(this.progressValue + getDeltaTime() / Config.DWELL_S)
      return
    }
    if (this.current && this.graceLeft > 0) {
      this.graceLeft -= getDeltaTime()
      return
    }
    if (aimed !== this.current) {
      this.current?.setDwellProgress(0)
      this.current = aimed
      this.progressValue = 0
      this.graceLeft = Config.DWELL_GRACE_MS / 1000
      this.showRing(0)
      this.targetEvent.invoke(aimed)
    }
  }

  private setProgress(progress: number): void {
    const target = this.current
    if (!target) return
    if (progress >= 1) {
      this.progressValue = 0
      this.spent = target
      this.showRing(0)
      target.setDwellProgress(1)
      return
    }
    this.progressValue = progress
    this.showRing(progress)
    target.setDwellProgress(progress)
  }

  /** Nearest active target hit by the head-aim ray. */
  private raycast(head: HeadMetrics): Target | null {
    const active = Targets.active()
    if (active.length === 0) return null
    const origin = head.headPosition
    const hits = this.probe.rayCastAllSync(origin, origin.add(head.aimDirection.uniformScale(RAY_CM)))
    let best: Target | null = null
    let bestDistance = Number.MAX_VALUE
    for (const hit of hits) {
      if (hit.distance >= bestDistance) continue
      const target = active.find((t) => t.collider === hit.collider)
      if (target) {
        best = target
        bestDistance = hit.distance
      }
    }
    return best
  }
}
