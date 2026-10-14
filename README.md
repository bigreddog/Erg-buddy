# Erg Buddy

A vanilla HTML, CSS and JavaScript companion for a Concept2 rower with a **PM5**, designed for **Android Chrome**. No runtime dependencies, accounts, API keys, server backend, or CDN requests.

Inspired by the implemented [`yahooligan` branch](https://github.com/bigreddog/yahooligan/tree/interactive-virtual-trainer-implementation-9714638404665484110): live Bluetooth metrics, a scenic workout display, device-local recording, demo mode, and screen wake lock. The river is a lightweight procedural Canvas scene rather than a Three.js simulation.

## Run

```sh
cd Erg-buddy
npm run serve
```

Open `http://localhost:8080` on the same computer, or deploy the whole directory to a static **HTTPS** host for Android. A phone visiting a computer's plain HTTP LAN address cannot use Web Bluetooth. No build step is needed. `npm test` runs the protocol, coaching, recording, and mocked Bluetooth checks with Node.js 20+.

On your PM5, open **Connect** (older firmware: **More Options → Turn Wireless On**). Close ErgData or another app holding the Bluetooth connection, tap **Connect PM5**, and choose the monitor. Start rowing and tap **Start recording**. PM3/PM4, USB, Safari, and Firefox are not supported by the live connection. Demo mode runs without hardware.

## Features

- Live split, stroke rate, heart rate (when a sensor is paired with the PM5), drag factor, and calculated power.
- Latest stroke drive time, recovery time, length, work, and peak force; work-per-stroke chart.
- Rhythm/consistency score and one actionable coaching cue, with optional speech capped at once per 20 seconds.
- Adjustable rate and recovery/drive targets; focus view and a river that progresses with reported PM5 distance.
- Start/pause/resume/finish recording. Save the latest ten sessions in localStorage and export JSON or CSV. Demo exports are explicitly marked simulated.
- Screen Wake Lock requested while connected or in demo, and reacquired on foreground return when supported. OS/browser restrictions may still allow the screen to sleep.
- Stale live metrics clear after five seconds. A pause/gap exceeding ten seconds clears the coaching baseline. Counter resets finish and save the current recording.

## What the score means

This is an **unvalidated practice heuristic**, not a rating of rowing form. The app uses the latest 12 valid strokes, with at least eight required.

Consistency = `max(0, 100 − 400 × (0.5 × workCV + 0.3 × cycleTimeCV + 0.2 × driveLengthCV))`.

Rhythm = `max(0, 100 − 80 × abs(meanRecoveryDriveRatio − targetRatio) / targetRatio)`.

Overall score = `round(0.7 × consistency + 0.3 × rhythm)`. CV is population standard deviation divided by mean. Target rate affects coaching cues, not the score. Changing targets finishes the current recording so each export has one clear configuration.

Steady practice is the best use case. Planned changes in effort/rate can lower the score without indicating poor technique. Recovery targets are adjustable drill goals, not a universal prescription. The PM5 cannot verify posture, leg/body/arm sequencing, early arm bend, or injury risk. Force-curve analysis and camera-based form analysis are not implemented; the displayed force is the monitor's peak force, not a reconstructed curve.

## Protocol and data integrity

Reads Concept2's rowing service `ce060030-43e5-11e4-916c-0800200c9a66`: general status (`0031`), additional status 1 (`0032`), and stroke data (`0035`). Uses three independent notification subscriptions; no CSAFE commands, multiplex fallback, workout programming, or resistance control. Notification failures disconnect and report the error. PM5 firmware/device behavior needs physical testing.

All multibyte integers use little endian. Elapsed time is uint24 × 0.01 seconds; total distance uint24 × 0.1 metres; drive/recovery time × 0.01 seconds; drive length and stroke distance × 0.01 metres; work × 0.1 joules; force × 0.1 pounds, converted to newtons for display. Heart rate 0/255 means unavailable. Power is calculated from split: `2.8 / (splitSeconds / 500)^3`; it is not claimed as direct per-stroke watts. Layouts were cross-checked against [ErgometerJS protocol definitions](https://github.com/tijmenvangulik/ErgometerJS/blob/master/api/typescript/ergometer/ble/typedefinitions.ts).

Only complete, unique, actively received strokes are recorded. Missing/stale supporting metrics export as empty CSV cells or JSON nulls. Recording totals sum PM5 stroke distance and drive/recovery durations for accepted strokes, excluding pauses and missing strokes. Raw monitor cumulative distance, elapsed time, received timestamps, and the elapsed span remain in JSON for review. CSV uses metres, seconds, watts, bpm, joules, and pounds for fields named `*ForceLbs`. No GPS coordinates, video evidence, or missing strokes are invented.

Finish/start a new recording for each interval piece; changes in targets finish a recording. Bluetooth disconnect or page exit saves received data. Reloading keeps saved sessions, but does not reconnect automatically. Storage can be cleared by the browser; download exports for retention. If localStorage is unavailable/full, downloads remain available during the current visit. No Strava or Concept2 Logbook upload is implemented.

## Verification

`npm test` checks byte layouts/unit conversion, malformed packets, absent heart rate, scoring baseline and cues, duplicate/reset handling, gap-free recording totals, CSV output, and mocked GATT subscriptions/cleanup. Browser demo verification checks interactive controls, responsive layout, recording/export, and page errors. Neither can certify live PM5 hardware behavior; test that on your Android phone and erg.

To run the browser verification with Node.js 22+ (built-in WebSocket), start the local server, launch Chromium with `--headless --remote-debugging-port=9222 --user-data-dir=/tmp/erg-buddy-browser about:blank`, then run `node tests/browser.mjs`. Screenshots are written to the ignored `verification-results/` folder. The verification clears localStorage in that isolated browser profile. Only use a separate test profile, not one containing your real session log.
