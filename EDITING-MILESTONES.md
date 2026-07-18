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

## Shared behavior

- Stage Felt and Daylight Console use the same markup and semantic tokens.
- The page does not horizontally scroll; pad and sequencer regions own their overflow.
- Keyboard shortcuts are ignored while editing form controls. Escape closes the sample sheet.
- Transport, edit, destructive, and save states are announced through the live region.
