# Erg Buddy

A vanilla HTML, CSS and JavaScript Concept2 PM5 companion for **Android Chrome**, with three swipeable session screens designed to fit a phone in landscape. No backend, account, runtime downloads, API keys, or CDN requests.

## Session screens

- **3D Rower:** an articulated rower on a procedural erg, animated using live PM5 stroke-state transitions and measured drive/recovery durations. Includes pace, rate, and HR. The model illustrates reference movement; the PM5 cannot measure your body position. Movement freezes when telemetry becomes stale. Reduced motion uses static phase poses.
- **Coaching:** a rhythm/consistency rating, actionable cue, the PM5's latest **force curve**, and HR with a two-minute trend, average and maximum. The curve shows relative force normalized to its peak. The PM5's force plot is often called a power curve, but instantaneous watts cannot be derived without handle velocity; the app does not invent that measurement.
- **Workout:** monitor elapsed time and cumulative distance, split, rate, calculated watts, HR, latest stroke timing, work, length and drag. Recording totals are separately labelled `REC` and include received strokes only.

Swipe left/right across a screen, tap a numbered tab, or focus the tabs and use Left/Right/Home/End. Swipes wrap through the three screens. Screens automatically cycle every five seconds by default. Use the bottom **Pause / Play · 5s** button to hold a screen or resume cycling. Manual navigation restarts the five-second countdown; cycling waits while Settings is open, during a swipe, or while the app is in the background. This control only affects screen navigation, not recording or the workout. Recording, finish, fullscreen, connection status and settings stay within reach. Changing screens does not interrupt telemetry, coaching, recording or curve collection. Settings and saved-session downloads live in a scrollable dialog outside the session screens.

Layouts were checked at 640×320, 667×375, 740×360, 844×390, 915×412, and 932×430 CSS pixels, with no page scrolling or clipped cards on any session screen. Browser chrome and safe-area insets are accounted for with dynamic viewport height. Portrait also has a compact fallback.

## Run and connect

```sh
npm run serve
```

Open `http://localhost:8080` on that computer. For Android, deploy this directory to any static **HTTPS** host. A phone visiting a computer's plain HTTP LAN address cannot use Web Bluetooth. There is no build step or installation requirement. JavaScript modules and Three.js are served locally from this repository.

Open **Settings → Connect PM5** after enabling wireless on the monitor (**Connect**, or older firmware **More Options → Turn Wireless On**). Close ErgData or other apps holding the Bluetooth connection. Pair an HR sensor with the PM5 for HR data. PM3/PM4, USB, Safari and Firefox are not supported by the live connection.

**Try a demo session** runs all screens without hardware, with explicitly simulated stroke timing, force curves and HR. **Start recording**, **Pause recording**, **Resume recording**, and **Finish & save** control recording; live metrics and coaching continue while recording is paused. Settings closes automatically when connected or entering demo.

## Coaching

This is an **unvalidated practice heuristic**, not a rating of rowing form. It uses the latest 12 valid strokes, with at least eight required.

- Consistency = `max(0, 100 − 400 × (0.5 × workCV + 0.3 × cycleTimeCV + 0.2 × driveLengthCV))`.
- Rhythm = `max(0, 100 − 80 × abs(meanRecoveryDriveRatio − targetRatio) / targetRatio)`.
- Overall = `round(0.7 × consistency + 0.3 × rhythm)`.

CV is population standard deviation divided by mean. The rate target affects cues, not the score. Targets are adjustable practice goals, not universal technique standards. Changing them finishes the current recording so each export has one configuration. Optional speech is capped at once every 20 seconds. Planned effort changes can lower consistency without indicating poor technique. Posture, sequencing, early arm bend and injury risk cannot be assessed from PM5 telemetry.

## PM5 data and force curves

Reads the Concept2 rowing service `ce060030-43e5-11e4-916c-0800200c9a66`: general status `0031`, additional status 1 `0032`, and stroke data `0035`. Multibyte integers are little endian. Elapsed time is uint24 × .01 seconds; distance uint24 × .1 metres; drive/recovery time × .01 seconds; drive length and stroke distance × .01 metres; work × .1 joules; force × .1 pounds (converted to newtons for display). HR 0/255 is unavailable. Power is calculated from split: `2.8 / (splitSeconds / 500)^3`.

Force-curve support additionally subscribes to PM5 control-service receive characteristic `0022` and writes **read-only query commands** to transmit characteristic `0021`. At the transition into recovery, CSAFE `SETUSERCFG1 (0x1a) / GET_FORCEPLOTDATA (0x6b)` requests chunks of up to 20 bytes. The app serially assembles samples until an empty chunk or trailing zero terminates the curve, with checksums, byte unstuffing, fragmented-notification handling, response deadlines and sample limits. No workout configuration or resistance commands are sent. Raw samples are normalized for display rather than labelled as watts or assigned unverified force units.

If control-service access, notification setup or a curve query fails, the app shows that the curve is unavailable while ordinary metrics/coaching continue. A failed query disables curve requests until reconnect to avoid repeatedly flooding the monitor. Metrics clear after five seconds of missing status data; ten seconds without a stroke clears the coaching baseline and stale curve. HR history leaves gaps for missing data instead of connecting them as repeated readings. Physical PM5 firmware and Android Bluetooth behavior still need testing on your device.

## Recording and storage

Latest ten sessions are saved in localStorage, with JSON/CSV downloads in Settings. Demo exports are explicitly marked. Only complete, unique, actively received strokes are recorded. Recording time/distance sum drive+recovery durations and stroke distances for accepted strokes, excluding pauses and missing strokes. Monitor elapsed/distance remain in each raw stroke. Supporting stale metrics become null/empty cells. JSON includes raw force curves and receipt timestamps, separately from stroke records because the force response does not contain a reliable stroke ID. CSV contains stroke records, including fields named `*ForceLbs` in pounds; time is seconds and distance metres.

Counter resets, Bluetooth disconnect and page exit save received data. Finish/start a recording for each interval piece. Reload preserves saved sessions but does not reconnect automatically. Browser storage may be cleared or fill up; download sessions for retention. Storage failures keep downloads available during the visit. No Concept2 Logbook or Strava upload is implemented.

Screen Wake Lock is requested while connected or in demo and reacquired when returning to the foreground. The browser/OS can revoke it and can suspend Bluetooth in the background.

## Verification

```sh
npm test
```

Node.js 20+ runs protocol/unit conversion, scoring, recording, GATT cleanup/fallback, CSAFE framing/checksum/chunk handling, transport cancellation, and stroke-motion tests. In restricted sandboxes, use `node --test --test-isolation=none tests/*.test.js`.

Browser verification requires Node.js 22+ (built-in WebSocket), a local server, and Chromium started with `--headless --remote-debugging-port=9222 --user-data-dir=/tmp/erg-buddy-browser about:blank`. Run `node tests/browser.mjs`. It checks all landscape sizes, WebGL rendering, native touch swipes, keyboard tabs, demo/live phase changes, fragmented measured force-curve responses from a simulated PM5, HR, recording, exports, and persistence. Screenshots go to ignored `verification-results/`. It clears localStorage in that isolated test profile; do not use your real session profile. These tests do not certify physical hardware behavior.

## Credits

Inspired by the implemented [yahooligan branch](https://github.com/bigreddog/yahooligan/tree/interactive-virtual-trainer-implementation-9714638404665484110). Three.js r180 is vendored under `js/vendor/` with its MIT license, using the same version as yahooligan. The model is built procedurally; no external assets are fetched. PM5 packet layouts and force-query structure were cross-checked against [ErgometerJS](https://github.com/tijmenvangulik/ErgometerJS/tree/master/api/typescript/ergometer).
