# Beatbox Studio

Beatbox Studio is a high-fidelity browser prototype for recording vocal percussion, assigning sounds to playable pads, arranging loops, and performing from a tactile studio surface.

## Preview

Open `index.html` directly, or serve the repository locally:

```powershell
python -m http.server 4173
```

Then visit `http://localhost:4173`.

## Included

- Interactive desktop studio with microphone, pad, timeline, and transport states
- Keyboard-triggered pads and Space-bar transport control
- Responsive mobile Perform mode
- Accessible focus, live status, and reduced-motion behavior
- Reusable design rules and tokens in `DESIGN.md`

The current build is a front-end interaction prototype. Audio capture, playback, persistence, and export are represented in the interface but are not yet connected to browser audio APIs or a backend.

