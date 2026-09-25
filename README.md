<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AeroGuard: Missile Trajectory Sim

A 3D tactical simulation of missile interception. Tune the engagement, launch an interceptor
against an evasive bogey, and watch it play out with live telemetry, three camera views and an
optional AI debrief.

View the original app in AI Studio: https://ai.studio/apps/drive/1u403MbBDBFpjqdAkri2lcfyl7W2ZWG7w

## Features

- **Engagement parameters**: interceptor and bogey speed, turn rate, range, launch elevation and
  a debris field, plus one-click presets. Each slider shows what the value means (Mach number,
  lateral g, time to impact).
- **Deterministic physics**: fixed 120 Hz integration, so outcomes don't depend on frame rate.
  The interceptor flies turn-rate-limited pure pursuit and steers around debris.
- **Readable 3D scene**: flight paths, line of sight, altitude drop-lines, range rings, a lock-on
  reticle with live range, bloom-lit exhaust and explosions.
- **Cameras**: orbit (auto-frames the engagement), chase and over-the-bogey's-shoulder, with smooth
  transitions and camera shake on impact.
- **Telemetry & debrief**: mission time, range, closing speed, time-to-go, a separation chart with
  the kill radius marked, and a post-flight summary.
- **Sound**: procedural launch, explosion and failure cues (mutable, remembered between visits).
- **AI tactical advisor** (optional): a Gemini-powered assessment of each engagement.

## Controls

| Key | Action |
| --- | --- |
| `Space` / `Enter` | Launch / re-engage |
| `R` | Reset |
| `1` `2` `3` | Orbit / chase / bogey camera (press `1` again to recenter) |
| `M` | Mute |

In orbit mode: drag to rotate, right-drag to pan, scroll to zoom.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. (Optional) Set `GEMINI_API_KEY` in [.env.local](.env.local) to enable the AI tactical advisor
3. Run the app:
   `npm run dev`

`npm run build` produces a static bundle in `dist/`.
