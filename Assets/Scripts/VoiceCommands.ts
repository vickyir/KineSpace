import {VoiceInputProvider} from "SpectaclesUIKit.lspkg/Scripts/Services/VoiceInputProvider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Target, Targets} from "./ui/Targets"

/** Commands available at any time (4:4 input model, brief §4). */
export type GlobalCommand = "pause" | "stop" | "next" | "skip"
const GLOBAL_COMMANDS: GlobalCommand[] = ["pause", "stop", "next", "skip"]

/** First retry delay after an ASR error; doubles on each failure, up to MAX_RETRIES. */
const RETRY_S = 2
const MAX_RETRIES = 4

/** Lower-case words only, single-spaced. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function containsPhrase(transcript: string, phrase: string): boolean {
  const p = normalise(phrase)
  return p.length > 0 && ` ${transcript} `.indexOf(` ${p} `) >= 0
}

/**
 * VoiceCommands — one ASR session (through UI Kit's VoiceInputProvider, which owns AsrModule)
 * listening for the label of any visible button ("say it") and the global commands
 * "pause", "stop", "next", "skip". Button labels win over global commands, so saying "stop"
 * while the HUD Stop button is visible presses that button once.
 * ASR runs on Spectacles only; in the Lens Studio preview use simulate().
 */
@component
export class VoiceCommands extends BaseScriptComponent {
  static instance: VoiceCommands

  available = false
  status = "starting"
  lastTranscript = ""

  private readonly commandEvent = new Event<GlobalCommand>()
  readonly onCommand: PublicApi<GlobalCommand> = this.commandEvent.publicApi()
  private readonly transcriptEvent = new Event<string>()
  /** Every final transcript, normalised (dev hooks such as the debug overlay toggle). */
  readonly onTranscript: PublicApi<string> = this.transcriptEvent.publicApi()

  private failures = 0

  onAwake() {
    VoiceCommands.instance = this
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  /** Feeds a transcript as if it had been spoken (debug overlay, preview). */
  simulate(text: string): void {
    this.lastTranscript = `(sim) ${text}`
    this.handle(text)
  }

  private start(): void {
    try {
      VoiceInputProvider.getInstance().acquireListening(this, {
        onListeningUpdate: ([text, isFinal]) => this.onUpdate(text, isFinal),
        onListeningError: (code) => this.onError(`ASR error ${code}`),
        onListeningOwnershipLost: () => this.onError("microphone taken by another component"),
      })
      this.available = true
      this.status = "started — waiting for speech"
    } catch (e) {
      this.available = false
      this.status = `unavailable (${e})`
    }
  }

  private onUpdate(text: string, isFinal: boolean): void {
    this.failures = 0
    this.status = "listening"
    this.lastTranscript = text
    if (isFinal) this.handle(text)
  }

  private onError(reason: string): void {
    try {
      VoiceInputProvider.getInstance().releaseListening(this)
    } catch (e) {
      // provider already stopped
    }
    this.failures++
    if (this.failures > MAX_RETRIES) {
      this.available = false
      this.status = `unavailable — ${reason}`
      return
    }
    const delay = RETRY_S * Math.pow(2, this.failures - 1)
    this.status = `${reason} — retry ${this.failures}/${MAX_RETRIES} in ${delay}s`
    const retry = this.createEvent("DelayedCallbackEvent")
    retry.bind(() => this.start())
    retry.reset(delay)
  }

  private handle(text: string): void {
    const transcript = normalise(text)
    if (transcript.length === 0) return
    this.transcriptEvent.invoke(transcript)
    // The longest matching phrase wins ("start hand session" beats the card's "hand").
    let best: Target | null = null
    let bestLength = 0
    for (const target of Targets.active()) {
      for (const phrase of target.voicePhrases) {
        if (phrase.length > bestLength && containsPhrase(transcript, phrase)) {
          best = target
          bestLength = phrase.length
        }
      }
    }
    if (best) {
      best.press("voice")
      return
    }
    for (const command of GLOBAL_COMMANDS) {
      if (containsPhrase(transcript, command)) {
        this.commandEvent.invoke(command)
        return
      }
    }
  }
}
