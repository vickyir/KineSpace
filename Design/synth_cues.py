"""Synthesise the Physio Lens audio cues (soft sine timbres, mono 16-bit 44.1 kHz WAV)."""
import math, struct, sys, wave
SR = 44100
OUT = sys.argv[1]

def env_ad(t, dur, attack=0.01, release=None):
    release = dur - attack if release is None else release
    if t < attack: return t / attack
    return max(0.0, math.exp(-4.5 * (t - attack) / max(1e-6, release)))

def tone(freqs, dur, gain=0.35, attack=0.01, harmonics=(1.0, 0.18)):
    out = []
    for i in range(int(SR * dur)):
        t = i / SR
        s = sum(h * math.sin(2 * math.pi * f * (k + 1) * t) for f in freqs for k, h in enumerate(harmonics))
        out.append(gain * env_ad(t, dur, attack) * s / len(freqs))
    return out

def seq(notes, step, dur, gain=0.3):
    total = int(SR * (step * (len(notes) - 1) + dur)); buf = [0.0] * total
    for n, f in enumerate(notes):
        for i, v in enumerate(tone([f], dur, gain)):
            buf[int(n * step * SR) + i] += v
    return buf

def glide(f0, f1, dur, gain=0.3):
    out, ph = [], 0.0
    for i in range(int(SR * dur)):
        t = i / SR; f = f0 + (f1 - f0) * t / dur; ph += 2 * math.pi * f / SR
        out.append(gain * env_ad(t, dur, 0.02) * math.sin(ph))
    return out

def pad(freqs, inhale, exhale, gain=0.18):
    dur = inhale + exhale; out = []
    for i in range(int(SR * dur)):
        t = i / SR
        a = 0.5 - 0.5 * math.cos(math.pi * t / inhale) if t < inhale else 0.5 + 0.5 * math.cos(math.pi * (t - inhale) / exhale)
        s = sum(math.sin(2 * math.pi * f * t) + 0.12 * math.sin(2 * math.pi * 2 * f * t) for f in freqs) / len(freqs)
        out.append(gain * a * s)
    return out

def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    if peak > 0.98: samples = [s * 0.98 / peak for s in samples]
    fade = int(0.005 * SR)
    for i in range(min(fade, len(samples))): samples[-1 - i] *= i / fade
    with wave.open(f"{OUT}/{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
    print(f"{name}.wav {len(samples)/SR:.2f}s")

# Rising-pitch steps (approach / hold progress): C5 D5 E5 G5 A5 pentatonic
for k, f in enumerate([523.25, 587.33, 659.25, 783.99, 880.0], start=1):
    write(f"approach_{k}", tone([f], 0.09, 0.28, attack=0.006))
write("chime_reached", seq([1318.5, 1975.5], 0.09, 0.55, 0.26))      # target reached / rep counted
write("chime_saved", seq([523.25, 659.25, 783.99], 0.11, 0.6, 0.24))  # calibration captured
write("tone_down", glide(620, 400, 0.32, 0.26))                       # drift reset
write("tick_tempo", tone([440.0], 0.14, 0.22, attack=0.008))          # warm-up open / close beat
write("pad_rest", pad([220.0, 329.63, 440.0], 4.0, 6.0))              # rest: 4 s in, 6 s out
