# KineSpace — Spectacles Physio Lens

A home-physiotherapy Lens for Snap Spectacles. It guides about 7 minutes of neck and hand exercises, two to three times a day. The flow runs through head and hand calibration, a module and pace choice, a warm-up, the exercises with rest between sets, and a summary with a comfort check.

It is built with **Lens Studio 5.24.1**, Spectacles Interaction Kit and Spectacles UI Kit 2.0, from the Figma file `4SCv02YIheXVRsWneQyKwg`.

> **Status:** built and checked in the **Lens Studio simulator (Preview panel)** only. It has not run on a Spectacles device yet. Hand tracking, pinch and voice in the simulator are simulated or replaced by dev shortcuts (see [§3](#3-use-it-in-the-simulator)). The device plan is in [`Docs/DEVICE_TEST_CHECKLIST.md`](Docs/DEVICE_TEST_CHECKLIST.md).

**Contents**

1. [Install](#1-install)
2. [Open and run in the simulator](#2-open-and-run-in-the-simulator)
3. [Use it in the simulator](#3-use-it-in-the-simulator)
4. [Dev switches and shortcuts](#4-dev-switches-and-shortcuts)
5. [Run on Spectacles (not yet tested)](#5-run-on-spectacles-not-yet-tested)
6. [Project layout](#6-project-layout)
7. [Session flow](#7-session-flow)
8. [Architecture](#8-architecture)
9. [Tuning `Config.ts`](#9-tuning-configts)
10. [Assets](#10-assets)
11. [Verification](#11-verification)

---

## 1. Install

### Requirements

The requirements below are as listed on Snap's [Lens Studio 5.24 download page](https://ar.snap.com/download/v5-24-0).

| | |
|---|---|
| Operating system | Windows 11 (64-bit) or macOS 12+ |
| Hardware | Intel Core i3 2.5 GHz, AMD FX 4300 2.6 GHz, or Apple M1; 8 GB RAM |
| Lens Studio | **5.24.1**, the version this project was made with |
| Git | To clone the repo (or download the ZIP from GitHub) |
| Python 3 + Pillow | Optional, only for the design tools in `Design/` |

### Step 1 — Install Lens Studio

1. Open [ar.snap.com/download](https://ar.snap.com/download) and download Lens Studio **5.24.1** for your system.
2. Run the installer (`.dmg` on macOS, `.exe` on Windows) and start Lens Studio once so it finishes setting up.

Notes:
- A newer 5.x version may offer to upgrade the project when you open it. Try that on a separate branch.
- Snap says 5.25 is the last release for Intel Macs.
- Signing in (My Lenses) is not needed for the simulator. It only enables voice commands in the Preview panel and sending to a device.

### Step 2 — Get the project

```bash
git clone <this-repo-url> KineSpace
cd KineSpace
```

Or use GitHub's **Code → Download ZIP** and unzip it.

Everything the Lens needs is in the repo, including the two Snap packages in `Packages/`. The `Cache/`, `Support/`, `Workspaces/` and `PluginsUserPreferences/` folders are not in git; Lens Studio rebuilds them the first time it opens the project.

---

## 2. Open and run in the simulator

### Step 3 — Open the project

1. Start Lens Studio and choose **Open Project** (on the home screen, or **File → Open Project**).
2. Select **`KineSpace.esproj`** in the repo folder.
3. The first open takes a minute while Lens Studio rebuilds its cache and compiles the TypeScript.
4. Open the **Logger** panel. There should be no red script errors.

Some messages in the Logger are expected:
- "Login to My Lenses is required for testing of the VoiceML API in the Preview panel" (voice needs a login).
- `SceneMaterialBatcher … unbatched` warnings (DEVIATIONS P16).
- Lines like `AudioCues: no en-US recording for "welcome"`. Voice recordings don't exist yet, so spoken lines are only logged.

### Step 4 — Check the Preview panel

The **Preview** panel is the simulator. The project already uses these settings; check them if the Lens doesn't appear:

- **Device:** Spectacles (this project's preview is set to the "SPECS 27" device).
- **Input:** **Interactive**. You can walk around a simulated room with the camera as your head.

The Lens draws only in the middle band of the preview, where the Spectacles display is. That is expected.

The Preview camera starts tilted about 12° down, while windows open level with your eyes, so the top of the first card can be cut off. Hold the **right mouse button** and drag up a little until the small Aim dot sits in the middle of the card.

To restart the Lens from the beginning, use the Preview panel's refresh/reset button. Saving a script also restarts it.

### Step 5 — Learn the simulator controls

The keyboard and mouse controls below come from [Snap's previewing guide](https://developers.snap.com/lens-studio/lens-studio-workflow/previewing-your-lens). Click inside the Preview panel first so it receives keys.

| To do this | In the Preview panel |
|---|---|
| Look around (head turn) | Hold the **right mouse button** and drag |
| Turn the head left / right (yaw) | Hold **Shift** + **A** / **D** |
| Look up / down (pitch) | Hold **Shift** + **W** / **S** |
| Tilt the head, ear to shoulder (roll) | Hold **Shift** + **Q** / **E** |
| Walk | **W A S D**; **Q** / **E** for down / up |
| Change key speed | **Shift + scroll wheel**; **Space** resets the speed |
| Put the camera back | The panel's **Reset** button |
| Press a button (pinch) | Point at it with the mouse and **click**. The mouse acts as the simulated hand ray. If the first click only moves the cursor onto the button, click again. |
| Press a button (dwell) | Turn the head so the small **Aim dot** in the centre sits on the button for **3 s** |

Head speed matters. Moving faster than 30°/s shows amber "Slower, please" (and in an exercise the rep isn't counted). If that happens, lower the key speed with Shift + scroll, or drag the mouse slowly.

---

## 3. Use it in the simulator

The simulator has **no real hands and no voice**, unless you're signed in for voice. The Lens has dev switches for those parts (full list in [§4](#4-dev-switches-and-shortcuts)):

- **Simulated hand.** In the **Scene Hierarchy**, select **PhysioApp → Services → HandMetrics**, tick **devMockHand** in the **Inspector**, and restart the preview. A simulated hand appears in the hand zone (the hand chosen in 1d, right by default), and its thumb touches each fingertip in turn. Hand exercises then run by themselves.
- **Debug overlay.** Select **DebugOverlay** and tick **showOverlay**. Live metrics appear at the bottom of the view, with clickable buttons: **Next**, **Rep ✓**, **Rep (fast)**, **Neutral**, **Pause**, **Pain**, **Battery 10%**, **Hand L/R**, **Say "skip"**, **Say "continue"**, **Restart**, **Reset data**.

### A full session, step by step

The first launch starts at **1a**. Every later launch starts at **1b** (daily calibration). To see the first run again, press **Reset data** on the debug overlay.

| Screen | What you see | What to do in the simulator |
|---|---|---|
| **1a** Safety | Welcome card with the safety badge | Click **I understand**, or hold the Aim dot on it for 3 s. |
| **1b** Neutral head | A ring straight ahead | Don't move for 3 s. It saves your neutral head position with a chime. |
| **1c** Head range | A gauge with left / right, then up / down, then tilt | Turn slowly left (Shift + A) to about 30° and **stop** for 2 s; it saves. Then right (Shift + D), up / down (Shift + W / S), and tilt left / right (Shift + Q / E). Or press **Next** on the overlay to skip. |
| **1d** Hand range | A frame at chest height for your hand | Needs a real, spread hand. Press **Next** on the overlay. |
| **2** Hub | Two module cards, Gentle / Standard pace | Click **Hand & Finger Mobility** or **Head & Cervical Relief**, pick a pace, click **Start … session**. |
| **W** Warm-up | Ghost hand opening and closing, then a dot to follow with your head | Runs by itself (about 50 s). Follow the dot with Shift + A / D if you like. Press **Next** to skip. |
| **3** Tutorial (first time only) | Ghost OK-hand, targets 1–4, "Try it once" | With **devMockHand** on, the touches count by themselves and **Start exercise** unlocks. Otherwise click **Skip tutorial**. |
| **4a** Finger opposition | Bubbles on the fingertips | With **devMockHand** on, bubbles pop by themselves (one per rep). Without it, the **4g** card appears after 0.5 s: click **End exercise**, or turn devMockHand on. **Rep ✓** counts a rep by hand. |
| **4f** Tendon gliding | Pose stepper Open → Tabletop → Fist | Needs real poses. Use **Rep ✓** on the overlay to count reps. |
| **4c** Rest (between sets) | 15 s countdown with a breathing halo | Wait, or click **Skip rest**. |
| **4d** Look up & down | Up / down targets and a dot that leads | Follow the dot with Shift + W / S, then hold on the target for 3 s. Each rep is up then down. |
| **4e** Ear to shoulder | A level bar ("You") and a tilted target line | Tilt with Shift + Q / E until the lines meet and the line turns solid; hold 3 s. Then the other side. |
| **4b** Turn left & right | A gauge with a dot, and a hold ring at the target | Follow the dot with Shift + A / D, hold 3 s on the ring, then come back to centre. Each rep is left then right. |
| **6a** Summary | Session stats and "How do your neck and hands feel?" | Click **Good**, **A bit sore** or **Pain**, then **Done**. |
| **6b** Safety stop | "Let's stop for today" | Reached from **Pain**, the HUD **✕** button, or **Pain** on the overlay. Click **Okay** or **View progress**. |

During an exercise, the **HUD bar** at the top has **Pause** (‖) and **Stop** (✕). Stop opens the safety stop.

**Head exercises use today's calibrated range.** If you skipped 1c, the targets are 0° and the head exercises finish instantly. Turn on **devSeedHeadRom** (see §4) to fill in sample ranges.

---

## 4. Dev switches and shortcuts

All switches are in the **Inspector** after selecting the object in the **Scene Hierarchy**, and all are **off by default**. Restart the preview after changing one.

| Object (Scene Hierarchy) · switch | What it does |
|---|---|
| `PhysioApp/Services/SessionStateMachine` · **devStartAt** | Type a screen ID to open that screen directly at launch, with the context it would have in the real flow: `1a`…`1d`, `2`, `W`, `3`, `4a`, `4b`, `4c`, `4d`, `4e`, `4f`, `4g`, `6a`, `6b`. Leave it empty for the normal flow. |
| `PhysioApp/Services/HandMetrics` · **devMockHand** | Simulates the chosen hand in the hand zone; the thumb touches each fingertip in turn. Use it for 3, 4a and 4f. |
| `PhysioApp/Services/CalibrationStore` · **devSeedHeadRom** | Fills head ranges that are still 0 with sample values, giving Figma's example targets (4b 30°, 4d up 24° / down 28°, 4e 24°). Use it for W, 4b, 4d and 4e without running 1c. |
| `PhysioApp/Services/CalibrationStore` · **resetOnStart** | Clears all saved data at launch, for testing the first run. |
| `FlowSelfTest` · **runOnStart** | Runs the automatic flow test and prints `SELFTEST PASS / FAIL` lines in the Logger (41 checks, about 25 s), then restores saved data. |
| `DebugOverlay` · **showOverlay** | Shows live metrics and the flow buttons listed in §3. With voice working, saying "debug" also toggles it. |

Example: to check 4d in ten seconds, set **devStartAt** to `4d` and tick **devSeedHeadRom**. Restart the preview, then hold Shift + W.

**Before publishing**, turn every switch off. Also disable the `DebugOverlay` and `FlowSelfTest` objects (untick them in the Scene Hierarchy), and keep `Component Gallery` disabled.

---

## 5. Run on Spectacles (not yet tested)

This project has **not** been run on a device. These steps follow Snap's [Connecting Lens Studio to Spectacles](https://developers.snap.com/spectacles/get-started/start-building/connecting-lens-studio-to-spectacles) guide. Work through [`Docs/DEVICE_TEST_CHECKLIST.md`](Docs/DEVICE_TEST_CHECKLIST.md) once it runs.

1. **Check the Lens Studio version against your Spectacles firmware.** Snap's 5.24 download page warns that the current Spectacles firmware may not support every Lens Studio version. It also says **Spectacles (2024) users should stay on Lens Studio 5.15.x**, and a 5.24 project can't be opened there. Use the Lens Studio version your device's firmware supports, as listed on [ar.snap.com/download](https://ar.snap.com/download).
2. Set **Project Info → Lens Name** to something like "KineSpace". It still says "SpecsBaseTemplate" from the template, and a Lens sent with the same name replaces the earlier one on the device. The project is already marked for Spectacles (target platform Spectacles).
3. Sign in to Lens Studio (**My Lenses**) with the **same account** as your Spectacles.
4. In the **Spectacles app** on your phone, open **Settings → Lens Development** and turn on **Enable Wired Connectivity**. You only do this once.
5. Connect:
   - **Wired:** plug Spectacles into the computer with a USB-C cable. The Logger shows "Spectacles connected to USB".
   - **Wireless:** put the computer and the Spectacles on the same Wi-Fi with internet. Networks with client or AP isolation won't work; a phone hotspot does.
6. Click **Preview Lens** in the toolbar. The first click connects, the next sends the Lens. **Additional Settings** next to it opens the full connection panel and **Spectacles Monitor**.
7. On the Spectacles, open the Lens from the **Drafts** folder. Hold your training hand at chest height with the palm facing you.

On a device, real hand tracking, pinch and voice replace the dev switches; keep them all off.

---

## 6. Project layout

```
KineSpace.esproj          Lens Studio project file (open this)
Assets/
  Scripts/                TypeScript: services, ui/, screens/, Dev/
  Scene.scene             The scene
  UI/                     Icons and silhouettes (PNG, ≤ 512 px)
  Fonts/  Audio/  Materials/
Packages/                 Spectacles Interaction Kit, Spectacles UI Kit (committed)
Design/
  svg/                    SVG sources of every icon and silhouette
  synth_cues.py           Generates the sound cues in Assets/Audio
  compare_preview.py      Builds Figma-vs-preview comparison images
Docs/
  DEVICE_TEST_CHECKLIST.md
  Review/                 Figma vs preview comparisons per phase
DEVIATIONS.md             Every change from Figma and why, plus open decisions
AGENTS.md, CLAUDE.md      Notes for AI coding agents (Lens Studio toolkit)
```

---

## 7. Session flow

The flow is owned by [`SessionStateMachine.ts`](Assets/Scripts/SessionStateMachine.ts) and follows brief §5 and Figma 20:775:

```
LAUNCH ─ first run ─▶ 1a ▶ 1b ▶ 1c ▶ 1d ─┐
       └ otherwise ─▶ 1b ▶ 1c ▶ 1d ──────┤
2 HUB (module + pace) ▶ W warm-up ▶ [3 tutorial, first time only] ▶
EXERCISES: REPS_PER_SET × SETS each, 4c REST between sets ▶ 6a SUMMARY ▶ END
  Hand module: 4a ▶ 4f      Head module: 4d ▶ 4e ▶ 4b
```

| Interrupt | Behaviour |
|---|---|
| Hand lost on 3, 4a or 4f, or no hand seen on 4a / 4f | The **4g** card covers the frozen step; it resumes after `RESUME_STABLE_S` of stable tracking. |
| Head turning faster than `TOO_FAST_DEG_S` | Amber "Slower, please"; the pacer stops and the rep is not counted. |
| Pain (6a option, HUD Stop, voice "stop") | **6b**. The session ends, the next target becomes `TARGET_AFTER_PAIN`, and the log is flagged. |
| Battery below `BATTERY_END_PCT` | The current set finishes, then 6a. |
| `SESSION_CAP_MIN` reached | 6a. |
| HUD Pause or voice "pause" | Freezes timers, holds and rep counting; the HUD shows "Paused". |

Progress is saved (Persistent Storage, on the device only, no network) on every state change and on pause or exit. An interrupted session is moved into the history on the next launch.

---

## 8. Architecture

TypeScript, one component per file under `Assets/Scripts/`. The scene graph is:

```
PhysioApp
├─ Services   CalibrationStore · HeadMetrics · HandMetrics · AudioCues · BatteryGuard ·
│             HeadAimDwell · VoiceCommands · SessionStateMachine   (order = init order)
└─ Screens    Screen1a … Screen6b   (one object per Figma screen)
DebugOverlay · FlowSelfTest · Component Gallery (disabled)   — dev only
```

### Services

| File | Responsibility |
|---|---|
| `Config.ts` | Every tunable number, with its source cited (see §9). |
| `Theme.ts` | Figma tokens (colours, type, radii), device mappings of visionOS materials, textures, and the px → cm helpers. |
| `SessionStateMachine.ts` | The flow and interrupts. Owns screen visibility, the session clock, the HUD bar and the phase strip. |
| `CalibrationStore.ts` | Persistent Storage: Neutral Forward Vector, today's range (Max_ROM_User), hand, history, tutorial flags, next-target adjustment. No network. |
| `HeadMetrics.ts` | Yaw, pitch and roll relative to the neutral pose, angular speed, and head-height drop. Reads the camera transform. |
| `HandMetrics.ts` | SIK keypoints of the chosen hand: thumb-to-tip distances, finger spread, joint flexion, tip-to-palm distances, palm facing, and a debounced tracking state. |
| `PacerController.ts` | The pacer dot (W, 4b, 4d). Moves at ≤ `PACER_DEG_S` and stops while the user is too fast. |
| `HoldTimer.ts` | The 3:122 radial hold ring. Fills over the hold time and drains at `HOLD_DRAIN_MULT` when the user leaves tolerance. |
| `HeadAimDwell.ts` | Head-aim dwell, since there is no eye tracking. Casts a ray through the display centre, shows the Aim dot, fills dwell rings over `DWELL_S` with `DWELL_GRACE_MS` grace. |
| `VoiceCommands.ts` | One ASR session listening for any visible button's label and the global "pause", "stop", "next", "skip". |
| `AudioCues.ts` | All sound: chimes, rising approach tones, the rest pad, and spoken lines from per-locale recordings. |
| `BatteryGuard.ts` | Battery Level API watcher. |

### UI (`ui/`)

Thin wrappers over UI Kit, themed from `Theme.ts`. Each follows the UI Kit lifecycle: create → set props → `initialize()`.

- **Controls:** `Window`, `PhysioButton`, `IconButton`, `SegmentedControl`, `ComfortOptions`, `ModuleCard`.
- **Status and feedback:** `HudBar`, `PhaseStrip`, `Badge`, `Chip`, `RangeGauge`, `Bubble`, `JointNode`.
- **Plumbing:** `LazyFollow` (soft head-lock), `Targets` (input registry), and `Primitives` (text, rounded rects, images, arcs, dashed lines, world dots).

### Screens (`screens/`)

`ScreenBase` provides the shared plumbing:
- **Lifecycle:** `build()` runs once; `onShow`, `tick(dt)` and `onHide` follow; `setFrozen` handles pause and tracking loss; `setCovered` is used when 4g covers the screen.
- **Anchoring modes** (Figma 4:4):
  - `spawnPose()` plus `Window`: windows are world-locked where they spawn and lazy-follow.
  - `followRoot()`: soft head-lock, used for the HUD and lower bands.
  - `neutralPose(yaw, pitch)`: exercise targets world-locked relative to the Neutral Forward Vector.
  - `ghostRoot()`: ghost guides at 90 cm, 1:1 hand scale.
  - `pinToPoint()`: hand-anchored near-field content (never text).
  - Children of the camera: the reticle, the 4e level bar and the Aim dot.

`PacedHeadExercise` holds the shared 4b / 4d logic: the pacer leads out, the user holds, the pacer leads back, then the head settles at centre; both sides make one rep.

### Conventions

- **Canvas mapping:** the Figma canvas is 1000 × 1400 px and stands for the display at 110 cm (`WINDOW_Z_CM`), so 1 px = 0.053 cm (`PX_TO_CM`). `canvasPosition(x, y)` turns a Figma point into camera space, and `place(so, x, y, layer)` positions children in px.
- **Targets are a fraction of today's range:** today's calibrated range × `targetFactor` (Gentle 0.8, Standard 0.9, 0.7 after pain, −0.05 after "a bit sore"). No therapy target is an absolute angle.
- **Inputs:** every activatable control is registered with `Targets` and accepts pinch, voice (its label) and head-aim dwell.
- **Additive display:** there is no blur, and black is transparent. visionOS glass and vibrancy are mapped to low-alpha tints (DEVIATIONS P1, P2). Materials are unlit; textures are ≤ 512 px; audio is WAV.

---

## 9. Tuning `Config.ts`

All numbers live in [`Assets/Scripts/Config.ts`](Assets/Scripts/Config.ts). Each entry cites its source:

| Tag | Meaning |
|---|---|
| `§6` | The brief's initial config. |
| `4:4` | The Figma Spatial System board. |
| `20:775` | The Figma flow and constraint tables. |
| `1a` … `6b` | The Spec panel under that Figma screen. |
| `PROPOSED` | Not in Figma; approved as a starting value. |

**Every therapy threshold carries `// TODO: validate with physiotherapist`.** Values without the tag are layout, display or platform constants.

| What you want to change | Keys |
|---|---|
| Session size | `REPS_PER_SET`, `SETS`, `REST_S`, `WARMUP_REPS`, `SESSION_TARGET_MIN`, `SESSION_CAP_MIN`, `DAILY_GOAL_SESSIONS` |
| How far targets go | `TARGET_GENTLE`, `TARGET_STANDARD`, `TARGET_AFTER_PAIN`, `SORE_DELTA`, `GENTLE_DEFAULT_SESSIONS` |
| Holds | `HOLD_S`, `HOLD_DRAIN_MULT`, `OPPOSITION_HOLD_S`, `HEAD_RANGE_HOLD_S`, `HAND_RANGE_HOLD_S` |
| Speed | `PACER_DEG_S` (pacer), `TOO_FAST_DEG_S` ("Slower") |
| On-target tolerances | `HEAD_TARGET_TOL_DEG`, `RETURN_CENTRE_DEG`, `OPPOSITION_CONTACT_CM`, `OPPOSITION_APPROACH_CM`, `TENDON_STRAIGHT_DEG`, `TABLETOP_MCP_DEG`, `FIST_TIP_PALM_CM` |
| Calibration | `NEUTRAL_MAX_ERR_DEG`, `NEUTRAL_HOLD_S`, `NEUTRAL_DRIFT_RESET_DEG`, `CAL_LIMIT_STABLE_DEG`, `SPREAD_STABLE_CM` |
| Compensation and posture | `SHOULDER_DROP_CM`, `POSTURE_CUE_COOLDOWN_S` |
| Tracking-loss sensitivity | `TRACK_LOST_S`, `RESUME_STABLE_S`, `HANDS_OVERLAP_CM`, `KEYPOINT_JUMP_CM` |
| Input | `DWELL_S`, `DWELL_GRACE_MS` |
| Placement on device | `LAYOUT_Y0_CM` (vertical offset of all UI; tune on device), `HAND_ZONE_PITCH_DEG`, `HAND_ZONE_REACH_CM`, `GHOST_DIST_CM`, `LAZY_FOLLOW_S` |
| Battery | `BATTERY_END_PCT` |

**Keep fixed:**
- `WINDOW_Z_CM` and `PX_TO_CM` define the Figma → cm mapping. Changing them breaks every layout.
- `MIN_TARGET_CM` and `MIN_TARGET_GAP_CM` are the 2° / 1° platform minimums.

After a change, run `FlowSelfTest`. It reads the values from `Config` too, so it stays valid.

---

## 10. Assets

| Kind | Source → output |
|---|---|
| Fonts | Inter Regular, Medium, SemiBold and Bold in `Assets/Fonts`. |
| Icons and silhouettes | SVG sources in `Design/svg/` (exported from Figma, white for tinting) are imported into Lens Studio and rasterised with **Convert SVG to Texture** into `Assets/UI/Icons` (128 px) and `Assets/UI/Silhouettes` (at most 512 px). File names carry the pixel size. |
| Sound cues | `Assets/Audio/*.wav`, synthesised by `Design/synth_cues.py`. |
| Voice | No recordings yet; Lens Studio 5.24 has no on-device text-to-speech (DEVIATIONS P14). |

To add a voice recording:
1. Put the WAV in `Assets/Audio/Voice/<locale>/`.
2. Map it in `VOICE_CLIPS` in `AudioCues.ts`.
3. Use the exact Figma line, listed in `VOICE_LINE_TEXT`.

Missing clips are logged and stay silent.

---

## 11. Verification

- **`FlowSelfTest`** (41 checks; see §4) drives the real state machine, with one action per frame:
  - The full hand and head flows.
  - Pause, rest skip, tracking loss and auto-resume.
  - Pain from the HUD and from 6a, low battery and the 10-min cap.
  - Voice routing and head-aim dwell.
  - Pacer speed and the target maths.
- **`Docs/Review/phase*.png`** are Figma frames next to simulator captures. Build one with `python3 Design/compare_preview.py figma.png preview.png out.png "label"`.
- **[`Docs/DEVICE_TEST_CHECKLIST.md`](Docs/DEVICE_TEST_CHECKLIST.md)** lists everything only a device can verify: acceptance criteria per screen, the left-palm system menu, power, voice and battery.
- **[`DEVIATIONS.md`](DEVIATIONS.md)** records every change from Figma. Its **Open decisions** table lists what still needs a designer or physiotherapist.
