/**
 * Targets — registry of everything the user can activate. Each target accepts the three
 * inputs required on every button: pinch (SIK, handled by the target itself), voice
 * (VoiceCommands matches `voicePhrases`) and head-aim dwell (HeadAimDwell raycasts the
 * camera-forward ray against `collider` and drives `setDwellProgress`).
 */
export type PressSource = "pinch" | "voice" | "dwell"

export interface Target {
  readonly sceneObject: SceneObject
  /** Collider the head-aim ray is tested against. */
  readonly collider: ColliderComponent
  /** Lower-case phrases that trigger this target by voice. */
  readonly voicePhrases: string[]
  /** True when the target draws its own dwell ring; otherwise HeadAimDwell rings the Aim dot. */
  readonly ownsDwellFeedback: boolean
  /** 0 = idle, (0, 1) = dwelling, 1 = complete (the target presses itself). */
  setDwellProgress(progress: number): void
  press(source: PressSource): void
}

const targets: Target[] = []

export const Targets = {
  add(target: Target): void {
    if (targets.indexOf(target) < 0) targets.push(target)
  },
  remove(target: Target): void {
    const i = targets.indexOf(target)
    if (i >= 0) targets.splice(i, 1)
  },
  /** Targets whose scene object is enabled in the hierarchy (destroyed ones are skipped). */
  active(): Target[] {
    return targets.filter((t) => {
      try {
        return !isNull(t.sceneObject) && t.sceneObject.isEnabledInHierarchy
      } catch (e) {
        return false
      }
    })
  },
}
