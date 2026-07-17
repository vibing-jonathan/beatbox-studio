# Beatbox Studio Design System

## Directions: Stage Felt + Daylight Console

Beatbox Studio feels like a compact instrument set on a dark rehearsal-stage surface: matte, precise, warm where the performer touches it, and cool where the system measures time. The interface is not a dashboard. It is one continuous performance surface with a clear vertical rhythm: identity, input, creation, sequencing, transport.

Its light counterpart is **Daylight Console**: the same instrument set on warm technical paper and pale console shells, with dark ink, visible physical edges, and restrained vertical grain. It is not a white SaaS theme. Raised controls read as molded hardware; pressed controls settle into the desk; timing and recording colors retain their dedicated jobs.

### Product posture

- **Immediate:** the first useful action is always visible; microphone state is never ambiguous.
- **Tactile:** pads depress, meters move, transport controls have weight, and active states occupy space rather than relying on color alone.
- **Credible:** timing, monitoring, quantization, and save state remain legible during performance.
- **Calm under energy:** the canvas stays dark and quiet so recorded sound, playhead, and armed states can speak.
- **Human:** coaching uses plain language and appears adjacent to the action, never as a blocking tour.

## Foundations

### Color

All product color is expressed in OKLCH. Use the semantic token, not a literal color, in components.

```css
:root {
  color-scheme: dark;
  --bg: oklch(14% 0.012 255);
  --surface: oklch(18% 0.014 255);
  --surface-raised: oklch(22% 0.016 255);
  --surface-pressed: oklch(12% 0.012 255);
  --fg: oklch(94% 0.008 80);
  --muted: oklch(68% 0.018 255);
  --border: oklch(31% 0.018 255);
  --border-strong: oklch(43% 0.024 255);

  --accent: oklch(72% 0.16 55);
  --accent-strong: oklch(66% 0.19 48);
  --accent-ink: oklch(16% 0.025 45);
  --functional: oklch(72% 0.13 215);
  --functional-soft: oklch(30% 0.055 220);

  --record: oklch(65% 0.23 25);
  --record-soft: oklch(25% 0.075 25);
  --success: oklch(73% 0.15 150);
  --warning: oklch(78% 0.16 85);
  --disabled: oklch(42% 0.012 255);
}
```

Daylight Console overrides the same roles at the document level. Components never select a palette directly.

~~~css
html[data-theme="light"] {
  color-scheme: light;
  --bg: oklch(93% 0.018 82);
  --surface: oklch(88% 0.022 82);
  --surface-raised: oklch(97% 0.012 82);
  --surface-pressed: oklch(83% 0.027 82);
  --fg: oklch(22% 0.02 255);
  --muted: oklch(43% 0.027 255);
  --border: oklch(61% 0.025 75);
  --border-strong: oklch(47% 0.03 65);

  --accent: oklch(56% 0.17 50);
  --accent-strong: oklch(49% 0.17 45);
  --accent-ink: oklch(98% 0.01 82);
  --functional: oklch(44% 0.12 220);
  --functional-soft: oklch(84% 0.055 220);

  --record: oklch(51% 0.21 25);
  --record-soft: oklch(87% 0.06 25);
  --success: oklch(43% 0.13 150);
  --warning: oklch(47% 0.14 80);
  --disabled: oklch(58% 0.015 255);
}
~~~

Color roles:

- Warm `--accent` marks performer-owned content: populated pads, selected clips, and the primary export action. Use it at most twice in one viewport.
- Cool `--functional` marks time and signal: playhead, input level, focus ring, quantization, and monitoring.
- `--record` is reserved for live capture, armed state, clipping, and destructive stop-record actions. It is never the brand color.
- Never encode a state by color alone. Pair state color with a label, icon, waveform, border, or position.
- Minimum contrast is 4.5:1 for normal text and 3:1 for large text, icons, focus rings, and component boundaries.

### Theme behavior

- Theme state lives on the document element with data-theme="dark|light"; markup and interaction logic are shared.
- On first visit, the studio follows prefers-color-scheme. A saved explicit choice always wins.
- Read persisted state and set the document theme in the head before stylesheet paint to prevent a wrong-theme flash.
- Persist explicit choice as beatbox-studio-theme in localStorage. System changes do not override a saved choice.
- The top-bar toggle exposes the visible current state, a clear action-oriented accessible name, aria-pressed, a tooltip, and a 44 × 44 px mobile target.
- Set native color-scheme per theme so number, range, and select controls match the active surface.

### Cross-theme component guidance

- **Canvas and panels:** Stage Felt uses low-light radial depth and near-invisible grain. Daylight Console uses warm paper, a pale console step, and restrained ink grain; neither uses a decorative color wash.
- **Physical controls:** Every raised control keeps a top highlight, border, lower edge, and pressed translation. In light mode, edges darken enough to remain visible against pale surfaces.
- **Pads:** Empty pads stay neutral and outlined. Recorded pads use a warm-tinted console surface, a stronger edge, a waveform, a duration, and a name; color is never the only recorded-state cue.
- **Timeline:** Warm clips represent performer-owned material; cool clips, playhead, grid feedback, quantization, and meters represent timing or signal. Clip labels use theme-specific ink tokens.
- **Recording:** --record and --record-soft remain semantically separate from the warm brand accent in both themes. Armed and recording states also change label, border, icon shape, or position.
- **Focus and selection:** The cool functional ring remains at least 3:1 against the adjacent surface. Selected controls retain a ring, underline, or pressed geometry in addition to color.
- **Text and metadata:** Body and control text meet 4.5:1. Muted text is darker in Daylight Console rather than becoming faint gray.
- **Hover, pressed, and disabled:** Hover changes surface and edge without layout shift; pressed controls move inward; disabled controls retain readable labels at reduced emphasis.
- **Transport:** The bottom dock remains a visually heavier console rail in both themes, with a high-contrast play control and a separately coded recording control.
- **Mobile Perform mode:** The theme toggle remains in the top bar as an icon-only 44 px control. Pad priority, loop rail, and bottom transport remain unchanged.

### Typography

```css
--font-display: "Avenir Next", "Segoe UI Variable Display", system-ui, sans-serif;
--font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", "Cascadia Mono", ui-monospace, monospace;
```

- Display: project identity, mode title, major BPM readout; 600–750 weight with tight tracking.
- Body: controls, coaching, track names; 450–650 weight.
- Mono: BPM, bars/beats, keyboard labels, time values, input dB, loop length; tabular numerals.
- Scale: 11 / 12 / 14 / 16 / 20 / 28 / 40 px. Eleven-pixel text is limited to high-contrast metadata; interactive labels start at 12 px.
- Control labels are sentence case. Short instrument names may use title case. Avoid all-caps except compact signal labels such as `MIC` and `BPM`.

### Spacing

Base unit: 4 px.

- `1`: 4 px — icon-to-label optical corrections
- `2`: 8 px — compact control gaps
- `3`: 12 px — internal control padding
- `4`: 16 px — panel padding
- `5`: 20 px — instrument groups
- `6`: 24 px — primary grid gutters
- `8`: 32 px — large workspace separation
- `12`: 48 px — empty-state breathing room

The studio uses an 8 px baseline grid. Dense tool rows may use 4 px increments; major panel boundaries remain on 8 px.

### Radii

- 6 px: chips, keycaps, tooltips, meter segments
- 10 px: compact controls and timeline clips
- 14 px: panels and transport dock
- 18 px: pads; a distinctive physical radius, never used for every container
- 999 px: status dots and rotary/round record controls only

### Elevation and texture

- Canvas: subtle radial grain made from low-opacity noise or a 1 px repeating pattern; no gradients used as decoration.
- Panel: inset top highlight plus a 1 px border; avoid floating-card shadows.
- Interactive raised: `0 1px 0` highlight, `0 6px 14px` dark shadow, and a darker lower edge.
- Pad: visible 3–4 px lower edge. Pressed state translates 2 px and reduces the lower edge to 1 px.
- Focused/armed controls add an outer ring; they do not increase elevation.

### Motion

- Pad press: 90 ms in, 140 ms out, `cubic-bezier(.2,.8,.2,1)`.
- Transport/state change: 160 ms.
- Playhead: linear and tied to audio timing, never a decorative animation.
- Meter: 40–80 ms attack, 180–260 ms release.
- Coaching reveal: 180 ms opacity plus 4 px translation.
- `prefers-reduced-motion: reduce` removes translation, springing, pulsing, and animated scrolling. State changes remain instant and visible.

### Icons

Use one 1.75 px rounded-stroke outline family (Lucide-compatible) at 16, 18, or 20 px. Filled shapes are reserved for record, stop, play, mute, and warning states where silhouette speeds recognition. Every icon-only control has an accessible name and tooltip. Do not use emoji.

## Workspace architecture

Desktop is one instrument surface, not a collection of dashboard cards.

1. **Top bar — 56 px:** project name, session/save state, undo/redo, share, export.
2. **Input strip — 64 px:** source, privacy state, meter, monitoring, capture action. It visually bridges the top bar and pads.
3. **Creation body:** pad bank at left (minimum 42% width), timeline at right. At widths below 1180 px the timeline moves below the pads.
4. **Transport dock — 72 px:** persistent, centered play/stop/record cluster with timing controls on either side.
5. **Coaching:** one contextual sentence anchored near the current task; dismissible and never modal after microphone consent.

### Pad grid

- Desktop: 4 × 3 primary bank with fixed 16:11 pad proportions and 12–16 px gutters.
- A recorded pad shows a short name, keycap, duration, and waveform. An empty pad shows `Record or drop` and its key.
- Hover raises 1 px; press lowers 2 px; keyboard and pointer share the same state.
- Selection uses a cool focus ring. Playing uses a warm inner fill plus a small activity bar. Recording uses the red status color and explicit `Recording…` label.
- Keyboard map: `1–4`, `Q–R`, `A–F`; Space controls transport. Ignore pad shortcuts while a text field is focused.

### Timeline

- Tracks have a 136 px header and a horizontally scalable beat grid.
- Header contains name, mute, solo, volume, and a level hint without duplicating a dashboard card.
- Events use filled waveform or step blocks; empty tracks preserve the beat grid.
- Cool playhead is 2 px with a visible cap. Current bar/beat is text, not color alone.
- Quantization is explicit (`1/16`, `1/8 swing`, `Off`). Snapping feedback appears at the clip edge.

### Recording and privacy

- Before access: `Microphone off · nothing is being captured` plus a `Enable microphone` action.
- Checking: `Listening locally…` with the cool functional color.
- Ready: device name, live meter, `Monitoring off/on`, and `Ready`.
- Armed: red ring plus `Armed — starts after 1-bar count-in`.
- Capturing: elapsed time, red filled record control, `Recording locally`, and a visible stop control.
- Clipping: meter turns red above −1 dB and announces `Input clipping` to assistive technology.
- Privacy copy stays concise: `Audio stays in this session until you share or export.`

## Interaction states

Every control supports default, hover, active/pressed, focus-visible, disabled, and selected/armed where relevant.

- Hover: surface lightens by ~4% lightness; no layout shift.
- Active: 1–2 px inward translation and darker surface.
- Focus-visible: 2 px `--functional` ring with 2 px offset; never remove outlines without replacement.
- Disabled: 45% opacity plus disabled cursor; labels remain readable.
- Selected: cool ring or underline plus semantic text.
- Armed/recording: red border or fill plus explicit status text; a pulse is optional and disabled under reduced motion.
- Error: brief inline explanation and recovery action; no toast-only critical failures.

## Responsive rules

### Wide desktop — 1440 px and above

- Pad grid and timeline share one row at roughly 46/54.
- Top bar exposes labeled Share and Export controls.
- Transport is a dock aligned to the workspace, not browser chrome.

### Compact desktop/tablet — 820–1439 px

- Below 1180 px, timeline moves below pads; input controls wrap by function.
- Track header narrows to 112 px; secondary labels collapse into tooltips.
- Touch targets remain at least 44 px.

### Mobile — below 820 px

- Becomes **Perform mode**, not a squeezed studio.
- Top bar keeps project identity, save state, and a mode label.
- Primary content is a 2 × 4 pad bank with 12 px gaps and ≥72 px pad height.
- Transport becomes a bottom dock with stop/play, record, BPM, and loop status.
- Timeline editing, detailed input routing, export options, undo history, and mixer controls move to desktop. Mobile may show a read-only loop progress rail and per-pad mute.
- First-time microphone consent remains an explicit full-width inline step.
- No horizontal page scroll at 360, 390, 430, 600, 768, 820, 1024, 1366, 1440, or 1920 px.

## Content voice

- Short, direct, and musical: `Make a sound`, `Trim the tail`, `Drop it on a pad`, `Loop locked`.
- Explain system truth plainly: `Microphone off`, `Saved just now`, `Recording locally`.
- Coaching suggests one next move: `Try tapping K and S together. Quantize will keep the loop tight.`
- Avoid gamified praise, studio jargon without context, and vague labels such as `Submit` or `Continue`.

## Accessibility and implementation checklist

- Use semantic buttons, inputs, labels, meters, and landmarks.
- Maintain logical DOM order: top bar → input → pads → timeline → transport.
- All pad actions work with keyboard and pointer; pressed state uses `aria-pressed` where appropriate.
- Space does not trigger transport while a form control has focus.
- Live recording, clipping, save, and microphone states use polite or assertive live regions as appropriate.
- Do not trap focus in coaching or tooltips.
- Minimum touch target: 44 × 44 px.
- Respect reduced motion and operating-system contrast preferences.
- Never begin recording without a user gesture and an explicit visible state change.
