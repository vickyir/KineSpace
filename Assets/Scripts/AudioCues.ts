import {HeadMetrics} from "./HeadMetrics"

/** Sound effects (Assets/Audio, synthesised by Design/synth_cues.py). */
export type Cue = "reached" | "saved" | "driftReset" | "tempo"

const CUES: Record<Cue, AudioTrackAsset> = {
  reached: requireAsset("../Audio/chime_reached.wav") as AudioTrackAsset, // target / rep (3:122, 4a, 4d)
  saved: requireAsset("../Audio/chime_saved.wav") as AudioTrackAsset, // calibration captured (1b, 1c, 1d)
  driftReset: requireAsset("../Audio/tone_down.wav") as AudioTrackAsset, // 1b drift > 5°
  tempo: requireAsset("../Audio/tick_tempo.wav") as AudioTrackAsset, // W open / close beat
}

/** Rising-pitch steps for approach / hold progress (no pitch control on AudioComponent). */
const APPROACH_STEPS: AudioTrackAsset[] = [
  requireAsset("../Audio/approach_1.wav") as AudioTrackAsset,
  requireAsset("../Audio/approach_2.wav") as AudioTrackAsset,
  requireAsset("../Audio/approach_3.wav") as AudioTrackAsset,
  requireAsset("../Audio/approach_4.wav") as AudioTrackAsset,
  requireAsset("../Audio/approach_5.wav") as AudioTrackAsset,
]
const REST_PAD = requireAsset("../Audio/pad_rest.wav") as AudioTrackAsset

/** Spoken guidance lines. IDs map to exact Figma copy; clips are recorded per locale. */
export type VoiceLine = "welcome" | "safety" | "handBackInView" | "returnToCentre"

/** Exact Figma copy for each line (subtitles, recording scripts). */
export const VOICE_LINE_TEXT: Record<VoiceLine, string> = {
  welcome: "Welcome to your therapy space", // 1a title — "VO reads title + safety line"
  safety: "Only do movements you can already do on your own. Stop if you feel sharp pain, numbness or dizziness.", // 1a
  handBackInView: "Hand back in view", // 4g
  returnToCentre: "Then follow the dot back to centre — slowly", // 4b, 20:775 "voice cue to return to centre"
}

export type Locale = "en-US" | "id-ID"

/**
 * Recorded clips per locale. Empty until recordings exist — Lens Studio 5.24 no longer ships
 * on-device Text To Speech (DEVIATIONS.md P14). Add clips under Assets/Audio/Voice/<locale>/.
 */
const VOICE_CLIPS: Record<Locale, Partial<Record<VoiceLine, AudioTrackAsset>>> = {
  "en-US": {},
  "id-ID": {},
}

/** Simultaneous one-shot voices (performance: few sounds at once). */
const ONE_SHOT_VOICES = 2
const APPROACH_VOLUME = 0.6
const PAD_VOLUME = 0.5
const PAD_FADE_S = 1

/**
 * AudioCues — the only place that plays sound. Spatial one-shots for approach / reached /
 * saved / drift / tempo, a looping rest pad, and spoken guidance that plays the recorded clip
 * for the current locale (or logs the line when no clip exists).
 */
@component
export class AudioCues extends BaseScriptComponent {
  static instance: AudioCues

  locale: Locale = "en-US"
  /** Last voice line requested — shown by the debug overlay. */
  lastLine = ""

  private readonly oneShots: AudioComponent[] = []
  private nextOneShot = 0
  private pad: AudioComponent
  private voice: AudioComponent
  private lastApproachStep = -1
  private voiceQueue: VoiceLine[] = []

  onAwake() {
    AudioCues.instance = this
    for (let i = 0; i < ONE_SHOT_VOICES; i++) this.oneShots.push(this.createSource(`OneShot${i}`, true))
    this.pad = this.createSource("RestPad", false)
    this.voice = this.createSource("Voice", false)
    this.createEvent("OnStartEvent").bind(() => this.ensureListener())
  }

  /** One-shot cue, spatialised at `worldPosition` when given (target, joint, ring). */
  play(cue: Cue, worldPosition?: vec3): void {
    this.playTrack(CUES[cue], 1, worldPosition)
  }

  /**
   * Rising tone for progress 0–1 (hold timers, approaching a target, gap closing in 4a).
   * Plays only when the step changes, so calling it every frame is fine.
   */
  approach(progress: number, worldPosition?: vec3): void {
    const step = Math.max(0, Math.min(APPROACH_STEPS.length - 1, Math.floor(progress * APPROACH_STEPS.length)))
    if (progress <= 0) {
      this.lastApproachStep = -1
      return
    }
    if (step === this.lastApproachStep) return
    this.lastApproachStep = step
    this.playTrack(APPROACH_STEPS[step], APPROACH_VOLUME, worldPosition)
  }

  /** Looping rest pad (4c), breathing 4 s in / 6 s out. */
  startRestPad(): void {
    if (this.pad.isPlaying()) return
    this.pad.audioTrack = REST_PAD
    this.pad.volume = PAD_VOLUME
    this.pad.fadeInTime = PAD_FADE_S
    this.pad.play(-1)
  }

  stopRestPad(): void {
    if (this.pad.isPlaying()) {
      this.pad.fadeOutTime = PAD_FADE_S
      this.pad.stop(true)
    }
  }

  /** Spoken guidance, in order: the recorded clip per line for the locale (missing clips are logged). */
  speak(...lines: VoiceLine[]): void {
    if (this.voice.isPlaying()) this.voice.stop(false)
    this.voiceQueue = lines.slice()
    this.speakNext()
  }

  private speakNext(): void {
    const line = this.voiceQueue.shift()
    if (!line) return
    this.lastLine = VOICE_LINE_TEXT[line]
    const clip = VOICE_CLIPS[this.locale][line]
    if (!clip) {
      print(`AudioCues: no ${this.locale} recording for "${line}" — "${this.lastLine}"`)
      this.speakNext()
      return
    }
    this.voice.audioTrack = clip
    this.voice.setOnFinish(() => this.speakNext())
    this.voice.play(1)
  }

  stopAll(): void {
    this.oneShots.forEach((source) => source.isPlaying() && source.stop(false))
    this.stopRestPad()
    this.voiceQueue = []
    if (this.voice.isPlaying()) this.voice.stop(false)
  }

  private playTrack(track: AudioTrackAsset, volume: number, worldPosition?: vec3): void {
    const source = this.oneShots[this.nextOneShot]
    this.nextOneShot = (this.nextOneShot + 1) % this.oneShots.length
    if (source.isPlaying()) source.stop(false)
    const position = worldPosition ?? HeadMetrics.instance?.headPosition ?? vec3.zero()
    source.getSceneObject().getTransform().setWorldPosition(position)
    source.audioTrack = track
    source.volume = volume
    source.play(1)
  }

  private createSource(name: string, spatial: boolean): AudioComponent {
    const so = global.scene.createSceneObject(name)
    so.setParent(this.sceneObject)
    const source = so.createComponent("Component.AudioComponent") as AudioComponent
    source.spatialAudio.enabled = spatial
    return source
  }

  /** Spatial audio needs an AudioListener on the camera. */
  private ensureListener(): void {
    const camera = HeadMetrics.instance?.cameraTransform.getSceneObject()
    if (camera && !camera.getComponent("Component.AudioListenerComponent")) {
      camera.createComponent("Component.AudioListenerComponent")
    }
  }
}
