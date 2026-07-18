# Beatbox Studio

Beatbox Studio is a browser-based vocal percussion instrument for recording sounds, playing pads, building four-bar loops, and exporting finished ideas without uploading audio to a server.

## Preview

Open `index.html` directly, or serve the repository locally:

```powershell
python -m http.server 4173
```

Then visit `http://localhost:4173`.

## Verification

Run the dependency-free audio export test with:

```powershell
node tests/audio-engine.test.mjs
node tests/timing.test.mjs
```

## Features

- Web Audio-powered synthesized beatbox kit across three pad banks
- Low-latency keyboard and pointer performance controls
- Four-bar sequencer with BPM, metronome, count-in, quantized overdubbing, mute, solo, and track volume
- Microphone recording directly into pads, plus audio file drag and drop
- Local persistence for settings, recorded pads, and overdub events
- Offline four-bar WAV export and native share support
- Responsive mobile Perform mode with light and dark themes
- Accessible live status, keyboard navigation, visible focus, and reduced-motion behavior

## Controls

- `1–4`, `Q–R`, `A–F`: play pads
- `Space`: play or pause
- `Ctrl/Cmd+Z`: undo an overdub
- `Ctrl/Cmd+Shift+Z`: redo an overdub
- Use the trash button on a recorded pad to delete that local recording
- Use the track `×` button to clear a built-in track; use `↺` to restore it
- Use **Clear overdubs** to remove recorded loop hits, with Undo available
- Double-click the session name to rename it

## Privacy and browser support

Microphone audio stays on the device. Recordings are stored in IndexedDB and are only included in a downloaded WAV when you explicitly export. A current Chromium, Firefox, or Safari release is recommended. Microphone access requires `localhost` or HTTPS.
