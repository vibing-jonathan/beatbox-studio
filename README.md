# Beatbox Studio

Beatbox Studio is a browser-based vocal percussion instrument for recording and shaping sounds, editing step-sequenced loops, and exporting finished ideas without uploading audio to a server.

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
node tests/sample-editor.test.mjs
node tests/sequencer.test.mjs
node tests/timing.test.mjs
```

## Features

- Web Audio-powered synthesized beatbox kit across three pad banks
- Low-latency keyboard and pointer performance controls
- Editable 1, 2, 4, or 8-bar step sequencer with draw/erase, multi-selection, velocity, timing nudge, duplication, quantize, patterns, history, mute, solo, and track volume
- Microphone recording directly into pads, plus audio file drag and drop
- Non-destructive recorded-pad editor with waveform trim, gain/normalize, fades, pitch, reverse, one-shot/gate/loop modes, duplicate, move/swap, replace, and delete
- Local persistence for settings, patterns, recorded pads, overdub events, and sample edits
- Offline loop-length-aware WAV export and native share support
- Responsive sequencer and mobile sample-editor sheet with light and dark themes
- Accessible live status, keyboard navigation, visible focus, and reduced-motion behavior

## Controls

- `1–4`, `Q–R`, `A–F`: play pads
- `Space`: play or pause
- `Ctrl/Cmd+Z`: undo an edit
- `Ctrl/Cmd+Shift+Z`: redo an edit
- `Delete`: remove selected sequencer hits
- Use **Edit** on a user-recorded pad to open its sample editor and pad actions
- Use the track `×` button to clear a built-in track; use `↺` to restore it
- Use **Clear pattern** to remove all pattern hits, with Undo available
- Double-click the session name to rename it

## Privacy and browser support

Microphone audio stays on the device. Recordings are stored in IndexedDB and are only included in a downloaded WAV when you explicitly export. A current Chromium, Firefox, or Safari release is recommended. Microphone access requires `localhost` or HTTPS.
