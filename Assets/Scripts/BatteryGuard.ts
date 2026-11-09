import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Config} from "./Config"

/**
 * BatteryGuard — watches the Battery Level API (global.deviceInfoSystem). Below
 * BATTERY_END_PCT it fires onLow once: the session finishes the current set, saves and goes to
 * the summary (20:775). `level` is −1 when the API is not available (e.g. Lens Studio preview).
 * Overheating has no Lens API — Snap OS warns / throttles, and progress auto-saves on pause.
 */
@component
export class BatteryGuard extends BaseScriptComponent {
  static instance: BatteryGuard

  level = -1
  charging = false
  /** Debug override (−1 = off) to test the low-battery path in the preview. */
  simulatedLevel = -1

  private readonly lowEvent = new Event<number>()
  readonly onLow: PublicApi<number> = this.lowEvent.publicApi()
  private lowFired = false

  onAwake() {
    BatteryGuard.instance = this
    try {
      const info = global.deviceInfoSystem
      this.apply(info.getBatteryState())
      info.onBatteryStateChanged.add((state) => this.apply(state))
    } catch (e) {
      this.level = -1
    }
  }

  get isLow(): boolean {
    const level = this.effectiveLevel
    return level >= 0 && level < Config.BATTERY_END_PCT
  }

  get effectiveLevel(): number {
    return this.simulatedLevel >= 0 ? this.simulatedLevel : this.level
  }

  simulate(level: number): void {
    this.simulatedLevel = level
    this.check()
  }

  /** Ends a simulation and re-arms the low-battery event (dev tools). */
  resetSimulation(): void {
    this.simulatedLevel = -1
    this.lowFired = false
  }

  private apply(state: BatteryStateArgs): void {
    if (!state) return
    this.level = state.batteryLevel
    this.charging = state.isCharging
    this.check()
  }

  private check(): void {
    if (this.isLow && !this.lowFired) {
      this.lowFired = true
      this.lowEvent.invoke(this.effectiveLevel)
    }
  }
}
