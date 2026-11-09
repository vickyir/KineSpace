# KineSpace — device test checklist

This is the Phase 7 verification of the Spectacles Physio Lens. It covers:
- every acceptance criterion in brief §7;
- the left-palm system-menu check;
- a power reading in Spectacles Monitor;
- an Interaction Simulation pass in Lens Studio.

Work top to bottom. For each item, tick it, or write ✗ plus a note and log anything new in [`DEVIATIONS.md`](../DEVIATIONS.md). Thresholds are in [`Assets/Scripts/Config.ts`](../Assets/Scripts/Config.ts); tuning is described in [`README.md`](../README.md) §9.

| Tester | Date | Device / Snap OS | Lens build | Hand trained (1d) |
|---|---|---|---|---|
| | | | | |

---

## 0. Setup

- [ ] **Dev switches off** (Inspector):
  - `SessionStateMachine.devStartAt` is empty;
  - `HandMetrics.devMockHand`, `CalibrationStore.devSeedHeadRom` and `FlowSelfTest.runOnStart` are off;
  - `DebugOverlay.showOverlay` is off. Saying "debug" shows the live metrics, which helps with §C.
- [ ] For the first-run pass, turn on `CalibrationStore.resetOnStart`, push once, then turn it off and push again. Every later run is then a "returning user".
- [ ] Battery above 40 % at the start; Spectacles Monitor connected (§E).
- [ ] A quiet room for voice; a chair; a clear space about 1.5 m wide.

## A. Interaction Simulation pass (Lens Studio, before the device)

The Preview injects a touch as a simulated SIK hand pinch. The first press moves the hand ray onto the target and the second one pinches, so press twice.

| Control type | Example | Expected | Phase 7 preview result |
|---|---|---|---|
| `PhysioButton` | 1a "I understand", 6b "View progress" | Hover fill, then press → next screen | ✓ (1a ▶ 1b, 6b ▶ 6a) |
| `ComfortOptions` | 6a "A bit sore", then "Good", then "Pain" | Selected option turns white 18 %; Pain opens 6b | ✓ |
| `IconButton` | HUD Pause on 4d | "Paused" in amber; Pause and Stop don't move (P30) | ✓ |
| `ModuleCard` | Hub head card | Card selected; button reads "Start head session" | ✓ |
| `SegmentedControl` | Hub pace, 1d hand | Selection moves | Same hookup as the four above, not pressed separately |

- [ ] Redo the pass after any UI change.
- [ ] Run `FlowSelfTest` (`runOnStart` on): expect `SELFTEST DONE 41 passed, 0 failed`, then switch it off.

## B. Every screen (brief §7)

Check these on every screen as you go through §C:

- [ ] Copy, hierarchy, colour tokens and relative positions match the Figma frame. Comparisons are in `Docs/Review/phase*.png`.
- [ ] Every button works by **pinch**, by **voice** (saying its label) and by **3 s head-aim dwell**. The dwell ring fills, and looking away for less than 300 ms keeps the progress.
- [ ] Every interactive element sits inside the display at 110 cm without turning the head. Note anything clipped at the top or bottom; it may need `LAYOUT_Y0_CM` (§I).
- [ ] A sound plays on success or on reaching a target.
- [ ] Text is readable; the smallest is 24 px, about 1.3 cm at 110 cm.

## C. Acceptance criteria per screen

### 1a · Safety
- [ ] "Step 1 of 4", the amber safety badge (pulses once), and "Only do movements you can already do on your own."
- [ ] "I understand" shows the dwell state with the Aim dot.
- [ ] The voice lines are logged in the Lens Studio log, but there is no sound until recordings exist (P14).

### 1b · Neutral head
- [ ] Head-locked reticle and a world-locked ring straight ahead. No hand input is needed.
- [ ] Holding within 2° for 3 s captures the neutral pose, with a chime.
- [ ] Drifting more than 5° resets the ring with a down-tone.

### 1c · Comfortable head range
- [ ] All UI lazy-follows the head.
- [ ] The gauge fills left, then right; holding 2 s at the comfortable limit saves each side, with a badge and chime.
- [ ] Turning faster than 30°/s pauses capture and shows "Slower, please".
- [ ] Pitch and roll steps run with DRAFT copy (F7); check that the saved values look plausible on the debug overlay.

### 1d · Hand range
- [ ] The Right / Left selector persists across launches.
- [ ] The capture frame sits at chest height around the hand.
- [ ] The fingertip dots turn emerald once the spread is stable for 3 s; "Save baseline" then saves the maximum spread.
- [ ] The posture hint reads "Palm facing you · hand at chest height".

### 2 · Hub
- [ ] The banner shows the session length, frequency, today's count, battery % from the API, and the hand-tracking state (emerald when tracked).
- [ ] Two module cards; Gentle / Standard pace with today's %; the session-structure line.

### W · Warm-up
- [ ] The ghost hand open ↔ close loop with a 2 s tempo halo and tick; no scoring.
- [ ] Then 5 slow head turns behind the pacer dot, within today's range × pace.
- [ ] Pause freezes it. Saying "skip" works only after the first week (F20).

### 3 · Tutorial (first time only)
- [ ] The cyan OK-pose ghost at 90 cm, about the size of your hand, with numbered targets 1–4 cycling.
- [ ] "Try it once" counts 4 touches; "Start exercise" unlocks only then.
- [ ] "Skip tutorial" always works.

### 4a · Finger opposition
- [ ] A bubble sits on each fingertip; the next one is cyan.
- [ ] The next bubble turns into a dashed amber ring with a rising tone as the thumb approaches.
- [ ] The contact ring appears at the thumb–tip midpoint when they are closer than 2 cm.
- [ ] The hold ring sits beside the contact on the thumb side; there is no text near the hand.
- [ ] A 1 s hold pops the bubble: burst, chime and "Index bubble popped"; the rep dots fill; then "Next: pop the middle-finger bubble".
- [ ] The hand outline comes from the SIK hand visual, not a 2D image.

### 4b · Turn left & right
- [ ] The hold ring is world-locked at today's left and right targets.
- [ ] The readout shows "28° of 30°" style values; "Then follow the dot back to centre — slowly" appears while holding.
- [ ] The edge indicator ("› Centre 30°") and glow appear once the centre is 20° away, and pulse on the way back until the head is within 5° of centre (F24).
- [ ] The gauge's pacer dot leads both ways; the marker is emerald inside the band.

### 4c · Rest
- [ ] A 15 s countdown and the breathing halo (4 s in / 6 s out) with the rest audio.
- [ ] No hand UI is shown.
- [ ] It moves on to set 2 by itself; "Skip rest" (pinch, voice, dwell) skips it.

### 4d · Look up & down
- [ ] The up and down targets sit at today's pitch range × pace, fixed in the room.
- [ ] The pacer leads along the dotted path and the head-locked reticle follows it.
- [ ] A 3 s hold fills the ring, chimes, and the dot leads back.

### 4e · Ear to shoulder
- [ ] The world target line is tilted to today's roll range; the head-locked level bar shows "You".
- [ ] When they meet, the line turns solid, the rising tone plays, and a 3 s hold gives a chime.
- [ ] The readout shows "18° of 24°" style values.
- [ ] Dropping the head by more than 3 cm (shoulder compensation) shows amber "Keep shoulders level" and the hold pauses. **Watch for false alarms near your full tilt** (§J).

### 4f · Tendon gliding
- [ ] The stepper goes Open → Tabletop → Fist, with each pose held 3 s and the card showing live checks ("Knuckles bent X° / Y°", "Fingers straight").
- [ ] The side-view ghost is illustration only; tracking reads the front view.

### 4g · Tracking lost
- [ ] Lower the hand during 4a or 4f. After about 0.5 s, 4g covers the step and the HUD shows amber "Paused".
- [ ] The rep count doesn't change while 4g is up.
- [ ] Bring the hand back: after 1 s of steady tracking it resumes where it was; the "Hand back in view" line is logged (P14).
- [ ] Overlapping both hands also triggers 4g.
- [ ] "End exercise" moves to the next exercise.

### 6a · Summary
- [ ] Metrics compare with your first session and last week (needs history; see F31 for the no-history case).
- [ ] The subtitle shows minutes, exercises, reps and "session n of 3 today".
- [ ] Good / A bit sore / Pain each work by pinch, voice and dwell.
- [ ] "A bit sore" lowers the next session's targets by 5 % (visible on the next Hub's pace %).
- [ ] "Done" saves and ends.

### 6b · Safety stop
- [ ] Reachable from 6a "Pain", the HUD Stop button and voice "stop".
- [ ] The coral alert appears; the next session's targets are 70 % (check the Hub next time); the log is flagged.
- [ ] "Okay" ends the session; "View progress" opens 6a.

## D. Left-palm system menu (P11)

Do this with **Left** selected in 1d.

- [ ] During 3, 4a and 4f, hold the left palm toward you as instructed. Note whether the Snap OS palm menu button appears and whether it covers or conflicts with our UI. Our UI draws only on the fingertips and the thumb–tip contact, never on the palm centre.
- [ ] Try triggering the system menu by accident during a 4a hold, and note what happens.
- [ ] Repeat once with **Right** selected for comparison.
- [ ] Log the findings in DEVIATIONS P11.

## E. Power (Spectacles Monitor)

The target is **below 100 throughout**.

| Screen | Power | Notes |
|---|---|---|
| 1a / 1b | | |
| 2 Hub | | |
| W | | |
| 4a (hand tracked) | | |
| 4b / 4d | | |
| 4e | | |
| 4c rest | | |
| 6a | | |

- [ ] If any reading is above 100, record it and note which elements are on screen. Text and shapes are not batched (P16).

## F. Interrupts

- [ ] **Too fast:** a quick head turn in 4b or 4d gives amber "Slower, please", the dot stops, and the rep is not counted (the HUD rep number stays).
- [ ] **Pain:** see 6b above.
- [ ] **Low battery:** below 15 % during an exercise, the current set finishes and 6a opens. If you can't reach 15 % naturally, note it as not tested.
- [ ] **10-minute cap:** a full head-module session ends at 10:00 in 6a (see F32 for the expected length).
- [ ] **Pause:** HUD Pause or voice "pause" freezes timers, holds and reps; pressing again resumes.

## G. Voice

Voice uses Snap's ASR module. Also note how it behaves with no internet connection.

- [ ] Global commands: "pause", "stop", "next" (on rest and tutorial), "skip" (rest, tutorial, and the warm-up after the first week).
- [ ] Button labels: "I understand", "Save baseline", "Start hand session" / "Start head session", "Start exercise", "Skip tutorial", "Skip rest", "End exercise", "Good", "A bit sore", "Pain", "Done", "Okay", "View progress".
- [ ] Saying "stop" while the HUD is visible triggers the safety stop once.
- [ ] Background talk doesn't trigger buttons; note any false triggers.

## H. Storage and data

- [ ] Quit mid-exercise and relaunch: it starts at 1b (daily calibration), and the interrupted session counts in today's total on the Hub.
- [ ] The tutorial is shown only the first time.
- [ ] The hand choice (1d) persists.
- [ ] After "A bit sore", the next session's pace % is 5 points lower; after "Pain" it is 70 %.

## I. Placement tuning

- [ ] **`LAYOUT_Y0_CM`** (P15): if windows sit too high or low in the display, change it in steps of 2 cm and note the final value.
- [ ] **Hand zone** (`HAND_ZONE_PITCH_DEG`, `HAND_ZONE_REACH_CM`): the 1d frame and the ghosts should sit where a relaxed hand is held at chest height.
- [ ] **Ghost distance** (`GHOST_DIST_CM`): the 3 and W ghosts should look hand-sized.
- [ ] **Near-field content** (4a bubbles, contact ring): it should stay on the fingertips without visible lag or jitter.

## J. Watch for (open items that need a device)

- [ ] **F32:** time a full head session from 1b to 6a. Is it cut by the cap?
- [ ] **F24:** is the 4b edge indicator timing comfortable?
- [ ] **4e:** does a full, comfortable tilt alone drop the head by more than 3 cm and wrongly show "Keep shoulders level"?
- [ ] **Tracking-loss sensitivity:** does `KEYPOINT_JUMP_CM` (5 cm per frame) or `HANDS_OVERLAP_CM` cause 4g to appear without a real loss?
- [ ] **`OPPOSITION_CONTACT_CM` (2 cm)** and **`OPPOSITION_APPROACH_CM` (4 cm)**: do bubbles pop reliably without false pops?
- [ ] **4f:** do the open / tabletop / fist checks pass for a correct pose and fail for an incorrect one?

## K. Release build

- [ ] All §0 dev switches off, and `resetOnStart` off.
- [ ] Disable the `DebugOverlay` and `FlowSelfTest` scene objects, and keep `Component Gallery` disabled.
- [ ] Recompile; the Lens Studio log shows no script errors at start.
- [ ] Add the voice recordings, if available (README §10).
