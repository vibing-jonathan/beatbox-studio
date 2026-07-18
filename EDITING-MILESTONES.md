# Beatbox Studio editing milestones

This implementation follows the editing prototype generated in the existing Beatbox Studio Open Design project.

## Editable loop sequencer

- Draw mode is the default: tap an empty cell to add a live-overdub hit and tap a populated cell to remove it. Warm solid blocks are preset hits; cool dashed blocks are live overdubs. Both are editable.
- **Select hits** changes taps from draw/erase to selection. Shift-click also builds a selection.
- Velocity and timing apply to the selection. Timing nudges in 1 ms steps.
- Duplicate places copies one step later when space is free. Quantize affects the selection, or the whole pattern when nothing is selected.
- Loop length supports 1, 2, 4, or 8 bars. Hidden hits are retained when the loop is shortened.
- Duplicate pattern creates and opens a named, switchable copy. Clear pattern is recoverable through Undo.
- Each editable step retains a 44 px target inside a labelled, horizontally scrolling editor.

## Recorded-pad sample editor

- Only user-recorded pads expose **Edit**. Preset pads remain play-only.
- Edit opens a right-side sheet on desktop and a bottom sheet below 820 px.
- The waveform provides draggable and keyboard-adjustable trim handles, selected-duration readouts, and an audition cursor.
- Name, gain, normalize, fade-in/out, semitone pitch, reverse, and playback mode are non-destructive parameters.
- One-shot plays the trim once. Gate plays while held. Loop repeats while held.
- Duplicate uses the next truly empty pad. Move/swap targets an empty or user-recorded pad. Replace preserves the pad key and sequence hits. Delete uses inline second-press confirmation.

## Local project sessions

- The project name opens a 460 px desktop sheet and an 88dvh mobile bottom sheet containing recent local sessions.
- Search, create, inline rename, independent duplicate, and two-step inline deletion are available without native dialogs.
- Explicit Save stores project settings and recorded audio in IndexedDB, with a visible dirty state and an unsaved-change warning before leaving.
- Versioned `.beatbox` bundles include sequence, pad audio, sample edits, mixer state, and effects. Import validates the bundle and offers Keep both, Replace, or Cancel when names conflict.

## Mixer and effects

- Sequence and Mix are peer views sharing project, theme, input, and transport controls.
- Four channel strips and a master provide stereo meters, mute/solo, pan/balance, faders, and limiter state.
- The selected channel inspector exposes fixed three-band EQ, compressor threshold/ratio, reverb send, delay send, bypass, and neutral reset.
- Recorded-pad editing links to the corresponding channel effects.
- Offline WAV export renders channel processing, sends, panning, faders, master balance, and limiting into the file.
- Below 820 px, mixer strips scroll and snap inside their rail while the effects inspector follows beneath it; page-level horizontal overflow remains disabled.

## Shared behavior

- Stage Felt and Daylight Console use the same markup and semantic tokens.
- The page does not horizontally scroll; pad and sequencer regions own their overflow.
- Keyboard shortcuts are ignored while editing form controls. Escape closes the active project or sample sheet.
- Transport, edit, destructive, and save states are announced through the live region.
