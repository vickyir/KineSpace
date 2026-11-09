import {AudioCues} from "../AudioCues"
import {BatteryGuard} from "../BatteryGuard"
import {CalibrationStore, STORAGE_KEY} from "../CalibrationStore"
import {Config} from "../Config"
import {HandMetrics} from "../HandMetrics"
import {HeadAimDwell} from "../HeadAimDwell"
import {HeadMetrics} from "../HeadMetrics"
import {PacerController} from "../PacerController"
import {SessionStateMachine} from "../SessionStateMachine"
import {PhysioButton} from "../ui/PhysioButton"
import {PressSource} from "../ui/Targets"
import {VoiceCommands} from "../VoiceCommands"

const EPS = 1e-6

/**
 * FlowSelfTest (dev only) — scripted check of the Phase 2 services in the Lens Studio preview,
 * where pinch, voice and hands cannot be scripted: drives the real SessionStateMachine through
 * the §5 flow and interrupts (one action per frame, like a user), routes simulated voice,
 * dwells on a real button with the head-aim ray, runs the pacer and checks the target maths.
 * Snapshots Persistent Storage first and restores it afterwards. Prints PASS / FAIL lines.
 */
@component
export class FlowSelfTest extends BaseScriptComponent {
  @input
  @hint("Run once when the Lens starts (dev only). Leaves stored data as it was.")
  runOnStart: boolean = false

  private passed = 0
  private failed = 0

  onAwake() {
    if (!this.runOnStart) return
    this.createEvent("OnStartEvent").bind(() => {
      this.wait(1).then(() => this.run())
    })
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const event = this.createEvent("DelayedCallbackEvent")
      event.bind(() => resolve())
      event.reset(seconds)
    })
  }

  /** Runs one user action, then lets a frame pass. */
  private async act(action: () => void): Promise<void> {
    action()
    await this.wait(0)
  }

  private async reps(count: number, smooth = true): Promise<void> {
    for (let i = 0; i < count; i++) await this.act(() => SessionStateMachine.instance.completeRep(smooth))
  }

  private async nextTimes(count: number): Promise<void> {
    for (let i = 0; i < count; i++) await this.act(() => SessionStateMachine.instance.next())
  }

  private check(name: string, ok: boolean, detail = ""): void {
    if (ok) this.passed++
    else this.failed++
    print(`SELFTEST ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  }

  private async run(): Promise<void> {
    const storage = global.persistentStorageSystem.store
    const snapshot = storage.has(STORAGE_KEY) ? storage.getString(STORAGE_KEY) : null
    const store = CalibrationStore.instance
    const sm = SessionStateMachine.instance
    const hand = HandMetrics.instance
    const mockWas = hand.devMockHand
    try {
      store.reset()
      // The Preview has no hand tracking: hand steps run with the simulated hand.
      hand.devMockHand = true
      await this.wait(Config.RESUME_STABLE_S + 0.3)

      // ── Targets (§5) ──
      this.check("gentle target 0.8", Math.abs(store.targetFactor("gentle") - Config.TARGET_GENTLE) < EPS)
      this.check("standard target 0.9", Math.abs(store.targetFactor("standard") - Config.TARGET_STANDARD) < EPS)
      this.check("first sessions default to Gentle", store.defaultPace() === "gentle")

      // ── First run: onboarding → hub → warm-up → tutorial → hand module ──
      await this.act(() => sm.start())
      this.check("first run starts at 1a", sm.state === "1a", sm.state)
      await this.nextTimes(3)
      this.check("1a ▶ 1b ▶ 1c ▶ 1d", sm.state === "1d", sm.state)
      await this.nextTimes(1)
      this.check("1d ▶ hub 2, first run marked done", sm.state === "2" && store.firstRunDone, sm.state)
      await this.act(() => sm.chooseModule("hand", "gentle"))
      this.check("hub ▶ W warm-up", sm.state === "W", sm.state)
      await this.nextTimes(1)
      this.check("W ▶ 3 tutorial (unseen)", sm.state === "3", sm.state)
      await this.nextTimes(1)
      this.check("3 ▶ 4a, tutorial marked seen", sm.state === "4a" && store.isTutorialSeen("4a"), sm.state)
      await this.act(() => (hand.devMockHand = false))
      await this.wait(Config.TRACK_LOST_S + 0.3)
      this.check("hand lost on 4a ▶ 4g covers it", sm.isTrackingLost && sm.state === "4a", sm.state)
      await this.reps(1)
      this.check("4g freezes rep counting", sm.context.repsDoneInSet === 0, `${sm.context.repsDoneInSet}`)
      await this.act(() => (hand.devMockHand = true))
      await this.wait(Config.RESUME_STABLE_S + 0.3)
      this.check("stable hand ▶ 4g auto-resumes", !sm.isTrackingLost && sm.state === "4a", sm.state)
      await this.reps(Config.REPS_PER_SET - 1)
      this.check("rep counter", sm.context.rep === Config.REPS_PER_SET && sm.state === "4a", `rep ${sm.context.rep}`)
      await this.reps(1, false)
      this.check("set 1 done ▶ 4c rest", sm.state === "4c", sm.state)
      this.check("too-fast rep not counted as smooth", sm.context.smoothReps === Config.REPS_PER_SET - 1)
      await this.act(() => VoiceCommands.instance.simulate("skip"))
      this.check('voice "skip" on rest ▶ set 2', sm.state === "4a" && sm.context.set === 2, `${sm.state} set ${sm.context.set}`)
      await this.act(() => sm.togglePause())
      await this.reps(3)
      this.check("pause freezes rep counting", sm.isPaused && sm.context.repsDoneInSet === 0)
      await this.act(() => sm.togglePause())
      await this.reps(Config.REPS_PER_SET)
      this.check("4a done ▶ 4f (no tutorial frame)", sm.state === "4f" && sm.context.set === 1, sm.state)
      await this.reps(Config.REPS_PER_SET)
      await this.nextTimes(1)
      await this.reps(Config.REPS_PER_SET)
      this.check("last set ▶ 6a summary", sm.state === "6a", sm.state)
      await this.act(() => sm.setComfort("sore"))
      await this.act(() => sm.finish())
      this.check("Done ▶ end, session recorded", sm.state === "end" && store.sessionCount === 1)
      this.check(
        "A bit sore ▶ next target −5 %",
        Math.abs(store.targetFactor("gentle") - (Config.TARGET_GENTLE + Config.SORE_DELTA)) < EPS
      )
      const expectedReps = 2 * Config.SETS * Config.REPS_PER_SET
      this.check(`${expectedReps} reps recorded`, store.history[0].reps === expectedReps, `${store.history[0].reps}`)

      // ── Second session: daily calibration, head module, HUD Stop ▶ 6b ──
      await this.act(() => sm.start())
      this.check("returning user starts daily calibration at 1b", sm.state === "1b" && sm.context.dailyCalibration)
      await this.nextTimes(3)
      await this.act(() => sm.chooseModule("head", "standard"))
      await this.nextTimes(1)
      this.check("head module starts with 4d", sm.state === "4d", sm.state)
      await this.act(() => sm.hud.stopButton.press("pinch"))
      this.check("HUD Stop ▶ 6b safety stop", sm.state === "6b", sm.state)
      await this.act(() => sm.finish())
      this.check("after pain, next target 70 %", Math.abs(store.targetFactor("standard") - Config.TARGET_AFTER_PAIN) < EPS)
      this.check("pain flagged in the log", store.history[1].painFlag)

      // ── Low battery: finish the set, then summary ──
      await this.act(() => sm.start())
      await this.nextTimes(3)
      await this.act(() => sm.chooseModule("head", "standard"))
      await this.nextTimes(1)
      await this.act(() => BatteryGuard.instance.simulate(10))
      this.check("low battery waits for the set", sm.state === "4d", sm.state)
      await this.reps(Config.REPS_PER_SET)
      this.check("set finished ▶ 6a (battery)", sm.state === "6a", sm.state)
      await this.act(() => sm.finish())
      this.check("battery ending recorded", store.history[2].end === "battery", store.history[2].end)
      BatteryGuard.instance.resetSimulation()

      // ── 10-min cap ▶ 6a; 6a "Pain" ▶ 6b ▶ "View progress" ▶ 6a ──
      await this.act(() => sm.start())
      await this.nextTimes(3)
      await this.act(() => sm.chooseModule("hand", "gentle"))
      await this.nextTimes(1)
      this.check("tutorial already seen ▶ W goes straight to 4a", sm.state === "4a", sm.state)
      await this.act(() => sm.devAdvanceClock(Config.SESSION_CAP_MIN * 60))
      this.check("10-min cap ▶ 6a summary", sm.state === "6a" && sm.ending === "cap", `${sm.state} ${sm.ending}`)
      await this.act(() => sm.setComfort("pain"))
      this.check('6a "Pain" ▶ 6b safety stop', sm.state === "6b", sm.state)
      await this.act(() => sm.showSummary())
      this.check('6b "View progress" ▶ 6a', sm.state === "6a", sm.state)
      await this.act(() => sm.finish())
      this.check("pain reported after the cap is flagged", store.history[3].painFlag && store.history[3].end === "pain", store.history[3].end)

      // ── Voice routing: button labels win over global commands ──
      await this.act(() => sm.start())
      let pressed: PressSource | null = null
      const button = this.spawnButton("Continue")
      button.onPressed.add((source) => (pressed = source))
      await this.act(() => VoiceCommands.instance.simulate("okay continue please"))
      this.check('voice "continue" presses the Continue button', pressed === "voice", `${pressed}`)

      // ── Head-aim dwell on the same button, placed on the aim ray ──
      pressed = null
      HeadAimDwell.instance.dwellEnabled = true
      await this.wait(Config.DWELL_S + 0.6)
      this.check("head-aim dwell presses after DWELL_S", pressed === "dwell", `${pressed}`)
      button.sceneObject.destroy()

      // ── Head metrics & pacer ──
      await this.act(() => HeadMetrics.instance.captureNeutral())
      this.check("neutral captured, yaw ≈ 0", HeadMetrics.instance.hasNeutral && Math.abs(HeadMetrics.instance.yawDeg) < 0.5)
      const pacer = this.sceneObject.createComponent(PacerController.getTypeName()) as PacerController
      pacer.axis = "yaw"
      pacer.startLeg(0, 10, true)
      await this.wait(10 / Config.PACER_DEG_S + 0.4)
      this.check("pacer reaches the target at ≤ PACER_DEG_S", pacer.arrived && Math.abs(pacer.valueDeg - 10) < EPS)
      this.check("still head ▶ rep counted", pacer.repCounted)
      AudioCues.instance.play("reached")
      AudioCues.instance.speak("welcome")
      this.check("audio cues play without error", true)
    } catch (e) {
      this.check("no exceptions", false, `${e}`)
    } finally {
      hand.devMockHand = mockWas
      if (snapshot !== null) storage.putString(STORAGE_KEY, snapshot)
      else storage.remove(STORAGE_KEY)
      store.reload()
      sm.start()
      print(`SELFTEST DONE ${this.passed} passed, ${this.failed} failed (stored data restored)`)
    }
  }

  /** A Continue button centred on the head-aim ray at WINDOW_Z_CM. */
  private spawnButton(label: string): PhysioButton {
    const head = HeadMetrics.instance
    const so = global.scene.createSceneObject(`SelfTest_${label}`)
    so.getTransform().setWorldPosition(head.headPosition.add(head.aimDirection.uniformScale(Config.WINDOW_Z_CM)))
    so.getTransform().setWorldRotation(head.cameraTransform.getWorldRotation())
    const button = so.createComponent(PhysioButton.getTypeName()) as PhysioButton
    button.label = label
    button.initialize()
    return button
  }
}
