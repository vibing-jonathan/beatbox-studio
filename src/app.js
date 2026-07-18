import { AudioEngine, audioBufferToWav, normalizeSampleSettings } from './audio-engine.js';
import { loadRecordedPads, loadSettings, removeRecordedPad, saveRecordedPad, saveSettings } from './storage.js';
import { loopPositionAtTime, normalizeLoopPosition, quantizeLoopPosition, SWING_OFFSET_STEPS } from './timing.js';
import {
  createInitialPatterns,
  duplicateEvents,
  loopStepsForBars,
  nudgeEvent,
  quantizeEvent,
  trackIdForType,
} from './sequencer.js';
import { findNextEmptySlot, normalizationGainDb, remapPatternEventSlots, waveformPeaks } from './sample-editor.js';

const engine = new AudioEngine();
const padElements = [...document.querySelectorAll('.pad')];
const bankButtons = [...document.querySelectorAll('.bank-tab')];
const trackElements = [...document.querySelectorAll('.track')];
const playButton = document.getElementById('play-button');
const stopButton = document.getElementById('stop-button');
const recordButton = document.getElementById('record-button');
const inputRecord = document.getElementById('input-record');
const monitorButton = document.getElementById('monitor-button');
const timeline = document.getElementById('timeline');
const playhead = document.querySelector('.playhead');
const mobileLoopRail = document.querySelector('.mobile-loop-rail');
const liveRegion = document.getElementById('live-region');
const transportLabel = document.getElementById('transport-label');
const transportTime = document.getElementById('transport-time');
const themeToggle = document.getElementById('theme-toggle');
const bpmInput = document.getElementById('bpm');
const metronomeButton = document.getElementById('metro');
const countInButton = document.getElementById('count-in');
const quantizeSelect = document.querySelector('[aria-label="Quantization"]');
const saveState = document.querySelector('.save-state');
const projectName = document.querySelector('.project-name');
const exportButton = document.querySelector('.export-button');
const shareButton = document.querySelector('.share-button');
const clearOverdubsButton = document.querySelector('.clear-overdubs');
const undoButton = document.querySelector('[aria-label="Undo"]');
const redoButton = document.querySelector('[aria-label="Redo"]');
const micStatus = document.getElementById('mic-status');
const privacyLabel = document.getElementById('privacy-label');
const meter = document.getElementById('meter-fill');
const meterValue = document.getElementById('meter-value');
const meterRole = document.querySelector('[role="meter"]');
const patternSelect = document.getElementById('pattern-select');
const selectModeButton = document.getElementById('select-mode');
const duplicateSelectionButton = document.getElementById('duplicate-selection');
const deleteSelectionButton = document.getElementById('delete-selection');
const quantizeSelectionButton = document.getElementById('quantize-selection');
const barOptions = document.getElementById('bar-options');
const duplicatePatternButton = document.getElementById('duplicate-pattern');
const selectionStatus = document.getElementById('selection-status');
const inspectorCopy = document.getElementById('inspector-copy');
const velocityInput = document.getElementById('hit-velocity');
const velocityOutput = document.getElementById('hit-velocity-output');
const nudgeLeftButton = document.getElementById('nudge-left');
const nudgeRightButton = document.getElementById('nudge-right');
const timingOutput = document.getElementById('timing-output');
const sampleSheet = document.getElementById('sample-sheet');
const sampleScrim = document.getElementById('sample-scrim');
const sampleNameInput = document.getElementById('sample-name');
const sampleMeta = document.getElementById('sample-meta');
const waveformEditor = document.getElementById('waveform-editor');
const auditionButton = document.getElementById('sample-audition');
const normalizeButton = document.getElementById('sample-normalize');
const gainInput = document.getElementById('sample-gain');
const fadeInInput = document.getElementById('sample-fade-in');
const fadeOutInput = document.getElementById('sample-fade-out');
const pitchInput = document.getElementById('sample-pitch');
const reverseButton = document.getElementById('sample-reverse');
const playbackModes = document.getElementById('sample-playback-mode');
const moveTargetSelect = document.getElementById('move-target');

const KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];
const BANKS = {
  'Bank A': [
    ['Kick Deep', 'kick', 0.42], ['Snare Tight', 'snare', 0.31], ['Hat Closed', 'hat', 0.18], ['Click Roll', 'click', 0.58],
    ['Throat Bass', 'bass', 0.76], ['Clap Wide', 'clap', 0.36], ['Inward K', 'inward', 0.27], null, null, null, null, null,
  ],
  'Bank B': [
    ['Kick Soft', 'kick-soft', 0.3], ['Rim Knock', 'rim', 0.12], ['Hat Open', 'hat-open', 0.48], ['Tongue Click', 'click', 0.09],
    ['Low Hum', 'hum', 0.78], ['Hand Clap', 'clap', 0.34], ['Lip Pop', 'pop', 0.18], ['Shaker', 'hat', 0.12], null, null, null, null,
  ],
  'One-shots': [
    ['Sub Drop', 'bass', 0.8], ['Dust Snare', 'snare', 0.28], ['Open Air', 'hat-open', 0.48], ['Rim Flash', 'rim', 0.12],
    ['Soft Kick', 'kick-soft', 0.3], ['Wide Clap', 'clap', 0.36], ['Vocal Cut', 'inward', 0.24], ['Bubble Pop', 'pop', 0.18],
    ['Tight Hat', 'hat', 0.08], ['Pulse', 'click', 0.08], ['Low Tone', 'hum', 0.74], ['Accent', 'rim', 0.12],
  ],
};
const TRACKS = [
  { id: 'kicks', name: 'Kicks', type: 'kick', defaultName: 'Kick Deep', steps: [0, 32], gain: 0.95 },
  { id: 'snares', name: 'Snares', type: 'snare', defaultName: 'Snare Tight', steps: [8, 40], gain: 0.82 },
  { id: 'hats', name: 'Hats & clicks', type: 'hat', defaultName: 'Hat Closed', steps: Array.from({ length: 32 }, (_, index) => index * 2), gain: 0.45 },
  { id: 'bass', name: 'Throat bass', type: 'bass', defaultName: 'Throat Bass', steps: [16, 48], gain: 0.62 },
];

const stored = loadSettings();
const initialPatterns = createInitialPatterns(stored, TRACKS);
const state = {
  activeBank: BANKS[stored.activeBank] ? stored.activeBank : 'Bank A',
  bpm: clamp(Number(stored.bpm) || 92, 40, 240),
  metronome: stored.metronome ?? true,
  countIn: stored.countIn ?? true,
  quantize: stored.quantize ?? '1/16',
  projectName: stored.projectName || 'Basement Cypher 03',
  trackStates: TRACKS.map((track, index) => ({
    id: track.id,
    volume: clamp(Number(stored.trackStates?.[index]?.volume) || Number(trackElements[index]?.querySelector('.volume')?.value) || 75, 0, 100),
    muted: Boolean(stored.trackStates?.[index]?.muted),
    solo: Boolean(stored.trackStates?.[index]?.solo),
    cleared: Boolean(stored.trackStates?.[index]?.cleared),
  })),
  loopBars: [1, 2, 4, 8].includes(Number(stored.loopBars)) ? Number(stored.loopBars) : 4,
  patterns: initialPatterns.patterns,
  activePatternId: initialPatterns.activePatternId,
};

let isPlaying = false;
let isLoopRecording = false;
let pendingRecordSteps = 0;
let currentStep = 0;
let nextNoteTime = 0;
let loopStartTime = 0;
let schedulerTimer = null;
let animationFrame = null;
let inputStream = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let recordingTargetSlot = null;
let history = [sequenceSnapshot()];
let historyIndex = 0;
let saveTimer = null;
let toastStack = null;
const recordedPads = new Map();
const selectedEventIds = new Set();
const activePadPlaybacks = new Map();
let selectMode = false;
let activeSampleSlot = null;
let auditionPlayback = null;
let auditionFrame = null;
let auditionStartedAt = 0;
let velocitySnapshot = null;
let deleteSampleArmed = false;
let lastVisualStep = -1;
let sampleReturnFocus = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slotFor(bank, key) {
  return `${bank}:${key}`;
}

function loopSteps() {
  return loopStepsForBars(state.loopBars);
}

function activePattern() {
  return state.patterns.find((pattern) => pattern.id === state.activePatternId) ?? state.patterns[0];
}

function currentEvents() {
  return activePattern()?.events ?? [];
}

function sequenceSnapshot() {
  return structuredClone({
    patterns: state.patterns,
    activePatternId: state.activePatternId,
    loopBars: state.loopBars,
  });
}

function restoreSequenceSnapshot(snapshot) {
  state.patterns = structuredClone(snapshot.patterns);
  state.activePatternId = snapshot.activePatternId;
  state.loopBars = snapshot.loopBars;
  selectedEventIds.clear();
  renderSequencer();
  renderPatternControls();
  renderHistoryControls();
  persist();
}

function makeEventId(prefix = 'hit') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sampleSettings(record) {
  return normalizeSampleSettings(record, record?.duration);
}

function updateRecordSettings(record, settings) {
  Object.assign(record, normalizeSampleSettings({ ...record, ...settings }, record.duration), { updatedAt: Date.now() });
}

function announce(message) {
  liveRegion.textContent = '';
  requestAnimationFrame(() => { liveRegion.textContent = message; });
}

function toast(message, tone = 'neutral', duration = 3200) {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    toastStack.setAttribute('aria-live', 'polite');
    document.body.append(toastStack);
  }
  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  toastStack.append(item);
  requestAnimationFrame(() => item.classList.add('is-visible'));
  window.setTimeout(() => {
    item.classList.remove('is-visible');
    window.setTimeout(() => item.remove(), 180);
  }, duration);
}

function setSaveLabel(text, busy = false) {
  if (!saveState) return;
  saveState.classList.toggle('is-saving', busy);
  saveState.lastChild.textContent = text;
}

function persist() {
  clearTimeout(saveTimer);
  setSaveLabel('Saving…', true);
  saveTimer = window.setTimeout(() => {
    saveSettings({
      activeBank: state.activeBank,
      bpm: state.bpm,
      metronome: state.metronome,
      countIn: state.countIn,
      quantize: state.quantize,
      projectName: state.projectName,
      trackStates: state.trackStates,
      loopBars: state.loopBars,
      patterns: state.patterns,
      activePatternId: state.activePatternId,
    });
    setSaveLabel('Saved just now');
  }, 260);
}

function updateThemeToggle(theme) {
  const isLight = theme === 'light';
  const label = isLight ? 'Light' : 'Dark';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('aria-label', `Theme: ${label}. Switch to ${isLight ? 'dark' : 'light'} theme`);
  themeToggle.title = `Theme: ${label}`;
  themeToggle.querySelector('.theme-label').textContent = label;
}

function waveMarkup(seed = 1) {
  return Array.from({ length: 7 }, (_, index) => {
    const height = 18 + ((seed * 29 + index * 37) % 78);
    return `<i style="--h:${height}%"></i>`;
  }).join('');
}

function padDefinition(index) {
  const key = KEYS[index];
  const slot = slotFor(state.activeBank, key);
  const recording = recordedPads.get(slot);
  const preset = BANKS[state.activeBank][index];
  if (recording) return { name: recording.name, type: 'recorded', duration: recording.duration, slot, recorded: true };
  if (preset) return { name: preset[0], type: preset[1], duration: preset[2], slot, recorded: false };
  return { name: 'Record or drop', type: null, duration: 0, slot, recorded: false };
}

function decoratePadShells() {
  padElements.forEach((pad) => {
    if (pad.parentElement?.classList.contains('pad-shell')) return;
    const shell = document.createElement('div');
    shell.className = 'pad-shell';
    pad.before(shell);
    shell.append(pad);
    const editButton = document.createElement('button');
    editButton.className = 'pad-edit';
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    shell.append(editButton);
  });
}

function decorateTrackControls() {
  trackElements.forEach((track, index) => {
    const controls = track.querySelector('.track-controls');
    if (controls.querySelector('.track-clear')) return;
    const button = document.createElement('button');
    button.className = 'track-toggle track-clear';
    button.type = 'button';
    button.dataset.trackIndex = String(index);
    controls.append(button);
  });
}

function renderPads() {
  padElements.forEach((pad, index) => {
    const definition = padDefinition(index);
    const key = KEYS[index];
    const empty = !definition.type;
    pad.dataset.key = key;
    pad.dataset.slot = definition.slot;
    pad.dataset.sound = definition.type ?? '';
    pad.classList.toggle('empty', empty);
    pad.classList.toggle('recorded', !empty);
    pad.classList.toggle('user-recording', definition.recorded);
    pad.parentElement.classList.toggle('has-user-recording', definition.recorded);
    pad.classList.toggle('capture-target', definition.slot === recordingTargetSlot);
    pad.setAttribute('aria-label', empty
      ? `Empty pad, keyboard ${key.toUpperCase()}. Record or drop audio.`
      : `Play ${definition.name}, keyboard ${key.toUpperCase()}${definition.recorded ? '. Press Delete to clear.' : ''}`);
    pad.querySelector('.pad-name').textContent = definition.name;
    pad.querySelector('.keycap').textContent = key.toUpperCase();
    pad.querySelector('.pad-meta').textContent = empty ? 'EMPTY' : `${definition.duration.toFixed(2)} s`;
    const editButton = pad.parentElement.querySelector('.pad-edit');
    editButton.setAttribute('aria-label', definition.recorded ? `Edit ${definition.name} on pad ${key.toUpperCase()}` : 'Edit recording');
    editButton.title = definition.recorded ? `Edit ${definition.name}` : '';
    let wave = pad.querySelector('.pad-wave');
    if (!empty && !wave) {
      wave = document.createElement('span');
      wave.className = 'pad-wave';
      wave.setAttribute('aria-hidden', 'true');
      pad.querySelector('.pad-meta').before(wave);
    }
    if (wave) {
      wave.hidden = empty;
      if (!empty) wave.innerHTML = waveMarkup(index + state.activeBank.length);
    }
  });
  document.querySelector('.pad-section .eyebrow').textContent = state.activeBank === 'One-shots' ? 'ONE-SHOT KIT' : `PAD ${state.activeBank.toUpperCase()}`;
}

function renderBankButtons() {
  bankButtons.forEach((button) => {
    const active = button.textContent.trim() === state.activeBank;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

function renderTrackStates() {
  trackElements.forEach((track, index) => {
    const trackState = state.trackStates[index];
    const [mute, solo] = track.querySelectorAll('.track-toggle');
    const volume = track.querySelector('.volume');
    const clearButton = track.querySelector('.track-clear');
    mute.setAttribute('aria-pressed', String(trackState.muted));
    solo.setAttribute('aria-pressed', String(trackState.solo));
    volume.value = String(trackState.volume);
    track.classList.toggle('is-muted', trackState.muted);
    track.classList.toggle('is-solo', trackState.solo);
    track.classList.toggle('is-cleared', trackState.cleared);
    clearButton.textContent = trackState.cleared ? '↺' : '×';
    clearButton.setAttribute('aria-label', `${trackState.cleared ? 'Restore' : 'Clear'} ${TRACKS[index].id} track`);
    clearButton.title = trackState.cleared ? 'Restore track' : 'Clear track';
  });
}

function selectedEvents() {
  return currentEvents().filter((event) => selectedEventIds.has(event.id));
}

function renderPatternControls() {
  if (!patternSelect) return;
  patternSelect.innerHTML = state.patterns.map((pattern) => `<option value="${pattern.id}">${pattern.name}</option>`).join('');
  patternSelect.value = state.activePatternId;
  barOptions?.querySelectorAll('[data-bars]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.bars) === state.loopBars)));
  const loopReadout = document.getElementById('loop-bars-readout');
  if (loopReadout) loopReadout.firstChild.textContent = `${state.loopBars} `;
  const eyebrow = document.getElementById('loop-eyebrow');
  if (eyebrow) eyebrow.textContent = `${state.loopBars}-BAR LOOP · ${formatPosition(currentStep)}`;
}

function signedEventOffset(event) {
  const offset = Number(event.offset) || 0;
  return offset > 0.5 ? offset - 1 : offset;
}

function renderHitInspector() {
  const events = selectedEvents();
  const enabled = events.length > 0;
  [velocityInput, nudgeLeftButton, nudgeRightButton, duplicateSelectionButton, deleteSelectionButton]
    .forEach((control) => { if (control) control.disabled = !enabled; });
  if (selectionStatus) selectionStatus.textContent = enabled ? `${events.length} hit${events.length === 1 ? '' : 's'} selected` : 'No hits selected';
  if (inspectorCopy) inspectorCopy.textContent = enabled
    ? `Editing ${events.length} hit${events.length === 1 ? '' : 's'} together. Mixed values move relatively.`
    : 'Turn on Select hits, then choose one or more steps.';
  if (!enabled) {
    if (velocityOutput) velocityOutput.textContent = '—';
    if (timingOutput) timingOutput.textContent = '0 ms';
    return;
  }
  const velocities = events.map((event) => Math.round(event.velocity * 127));
  const offsets = events.map((event) => Math.round(signedEventOffset(event) * (60 / state.bpm / 4) * 1000));
  if (velocityInput) velocityInput.value = String(velocities[0]);
  if (velocityOutput) velocityOutput.textContent = velocities.every((value) => value === velocities[0]) ? String(velocities[0]) : 'Mixed';
  if (timingOutput) timingOutput.textContent = offsets.every((value) => value === offsets[0]) ? `${offsets[0]} ms` : 'Mixed';
}

function renderSequencer() {
  const steps = loopSteps();
  timeline.style.setProperty('--steps', String(steps));
  timeline.style.minWidth = `${136 + steps * 44}px`;
  const ruler = document.querySelector('.ruler');
  ruler.style.gridTemplateColumns = `repeat(${state.loopBars}, minmax(${16 * 44}px, 1fr))`;
  ruler.innerHTML = Array.from({ length: state.loopBars }, (_, bar) => `<span>${bar + 1} <small>· 1 2 3 4</small></span>`).join('');
  ruler.append(playhead);

  trackElements.forEach((trackElement, trackIndex) => {
    const track = TRACKS[trackIndex];
    const lane = trackElement.querySelector('.lane');
    lane.style.gridTemplateColumns = `repeat(${steps}, minmax(44px, 1fr))`;
    const byStep = new Map();
    currentEvents().filter((event) => event.trackId === track.id && event.step < steps).forEach((event) => {
      if (!byStep.has(event.step)) byStep.set(event.step, []);
      byStep.get(event.step).push(event);
    });
    lane.innerHTML = Array.from({ length: steps }, (_, step) => {
      const events = byStep.get(step) ?? [];
      const primary = events[0];
      const selected = events.some((event) => selectedEventIds.has(event.id));
      const origin = events.some((event) => event.origin === 'overdub') ? 'live' : 'preset';
      const velocity = primary?.velocity ?? 0.78;
      const position = formatPosition(step);
      return `<button class="step-cell${primary ? ` has-hit ${origin}` : ''}${selected ? ' selected' : ''}" data-track="${track.id}" data-step="${step}" data-event-ids="${events.map((event) => event.id).join(',')}" style="--velocity:${velocity}" aria-pressed="${Boolean(primary)}" aria-label="${track.name}, ${position}${primary ? `, ${origin === 'live' ? 'live overdub' : 'preset'} hit, velocity ${Math.round(velocity * 127)}` : ', empty'}">${events.length > 1 ? `<span class="hit-count">${events.length}</span>` : ''}</button>`;
    }).join('');
  });
  renderPatternControls();
  renderHitInspector();
}

function renderHistoryControls() {
  undoButton.disabled = historyIndex === 0;
  redoButton.disabled = historyIndex >= history.length - 1;
  if (clearOverdubsButton) clearOverdubsButton.disabled = currentEvents().length === 0;
}

function commitHistory(events) {
  activePattern().events = structuredClone(events);
  history = history.slice(0, historyIndex + 1);
  history.push(sequenceSnapshot());
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  selectedEventIds.forEach((id) => {
    if (!activePattern().events.some((event) => event.id === id)) selectedEventIds.delete(id);
  });
  renderSequencer();
  renderHistoryControls();
  persist();
}

function pushSequenceHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(sequenceSnapshot());
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  renderSequencer();
  renderHistoryControls();
  persist();
}

function undo() {
  if (historyIndex === 0) return;
  historyIndex -= 1;
  restoreSequenceSnapshot(history[historyIndex]);
  announce('Last edit undone');
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  restoreSequenceSnapshot(history[historyIndex]);
  announce('Edit restored');
}

function formatPosition(step) {
  const normalized = ((step % loopSteps()) + loopSteps()) % loopSteps();
  return `${Math.floor(normalized / 16) + 1}.${Math.floor((normalized % 16) / 4) + 1}.${(normalized % 4) + 1}`;
}

function activeTrack(index) {
  const anySolo = state.trackStates.some((track) => track.solo);
  const track = state.trackStates[index];
  return !track.cleared && !track.muted && (!anySolo || track.solo);
}

function swingDelayForStep(step) {
  return state.quantize === '1/8 swing' && step % 4 === 2 ? (60 / state.bpm / 4) * SWING_OFFSET_STEPS : 0;
}

function eventOffsetSteps(event) {
  if (event.quantize === '1/8 swing' && event.step % 4 === 2) return SWING_OFFSET_STEPS;
  if (Number.isFinite(event.offset)) return clamp(event.offset, 0, 0.999999);
  if (!event.quantize && state.quantize === '1/8 swing' && event.step % 4 === 2) return SWING_OFFSET_STEPS;
  return 0;
}

function eventLoopPosition(event) {
  return normalizeLoopPosition(event.step + eventOffsetSteps(event), loopSteps());
}

function scheduleStep(step, when) {
  const hitTime = when + swingDelayForStep(step);
  const secondsPerStep = 60 / state.bpm / 4;
  for (const event of currentEvents().filter((item) => item.step === step)) {
    const trackIndex = TRACKS.findIndex((track) => track.id === event.trackId);
    if (trackIndex < 0 || !activeTrack(trackIndex)) continue;
    const eventTime = when + eventOffsetSteps(event) * secondsPerStep;
    const gain = event.velocity * (state.trackStates[trackIndex].volume / 100);
    const recording = event.recorded ? recordedPads.get(event.slot) : null;
    if (recording && engine.playRecording(event.slot, { when: eventTime, gain, sample: recording, loop: false })) continue;
    engine.play(event.type, { when: eventTime || hitTime, gain });
  }
  if (state.metronome && step % 4 === 0) engine.play('click', { when, gain: step % 16 === 0 ? 0.32 : 0.18 });
  if (pendingRecordSteps > 0) {
    pendingRecordSteps -= 1;
    if (pendingRecordSteps === 0) setLoopRecording(true);
  }
}

function scheduler() {
  if (!isPlaying || !engine.context) return;
  const secondsPerStep = 60 / state.bpm / 4;
  while (nextNoteTime < engine.currentTime + 0.11) {
    scheduleStep(currentStep, nextNoteTime);
    currentStep = (currentStep + 1) % loopSteps();
    if (currentStep === 0) loopStartTime = nextNoteTime + secondsPerStep;
    nextNoteTime += secondsPerStep;
  }
}

function updatePlayhead() {
  if (!isPlaying || !engine.context) return;
  const loopDuration = (60 / state.bpm) * state.loopBars * 4;
  const audibleTime = engine.currentTime - engine.outputLatency;
  const progress = clamp(((audibleTime - loopStartTime) % loopDuration) / loopDuration, 0, 1);
  const visualStep = Math.floor(progress * loopSteps()) % loopSteps();
  if (visualStep !== lastVisualStep) {
    timeline.querySelectorAll('.step-cell.current').forEach((cell) => cell.classList.remove('current'));
    timeline.querySelectorAll(`.step-cell[data-step="${visualStep}"]`).forEach((cell) => cell.classList.add('current'));
    lastVisualStep = visualStep;
  }
  playhead.style.left = `${progress * 100}%`;
  mobileLoopRail.style.setProperty('--loop-progress', `${progress * 100}%`);
  mobileLoopRail.setAttribute('aria-label', `Loop position, ${Math.round(progress * 100)} percent`);
  transportTime.textContent = formatPosition(visualStep);
  animationFrame = requestAnimationFrame(updatePlayhead);
}

async function startTransport() {
  if (isPlaying) return;
  try {
    await engine.ensureReady();
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  isPlaying = true;
  currentStep = 0;
  lastVisualStep = -1;
  timeline.querySelectorAll('.step-cell.current').forEach((cell) => cell.classList.remove('current'));
  nextNoteTime = engine.currentTime + 0.06;
  loopStartTime = nextNoteTime;
  playButton.setAttribute('aria-pressed', 'true');
  playButton.setAttribute('aria-label', 'Pause');
  playButton.textContent = 'Ⅱ';
  timeline.classList.add('playing');
  transportLabel.textContent = pendingRecordSteps ? 'COUNT-IN' : isLoopRecording ? 'RECORDING' : 'PLAYING';
  schedulerTimer = window.setInterval(scheduler, 25);
  scheduler();
  animationFrame = requestAnimationFrame(updatePlayhead);
  announce('Loop playing');
}

function pauseTransport() {
  if (!isPlaying) return;
  isPlaying = false;
  window.clearInterval(schedulerTimer);
  cancelAnimationFrame(animationFrame);
  schedulerTimer = null;
  playButton.setAttribute('aria-pressed', 'false');
  playButton.setAttribute('aria-label', 'Play');
  playButton.textContent = '▶';
  timeline.classList.remove('playing');
  transportLabel.textContent = isLoopRecording ? 'RECORDING' : 'PAUSED';
  announce('Loop paused');
}

function stopTransport() {
  pauseTransport();
  isLoopRecording = false;
  pendingRecordSteps = 0;
  currentStep = 0;
  playhead.style.left = '0%';
  mobileLoopRail.style.setProperty('--loop-progress', '0%');
  mobileLoopRail.setAttribute('aria-label', 'Loop position, 0 percent');
  transportLabel.textContent = 'STOPPED';
  transportTime.textContent = '1.1.1';
  recordButton.classList.remove('recording');
  recordButton.setAttribute('aria-pressed', 'false');
  recordButton.setAttribute('aria-label', 'Record loop');
  announce('Transport stopped');
}

function setLoopRecording(enabled) {
  isLoopRecording = enabled;
  pendingRecordSteps = 0;
  recordButton.classList.toggle('recording', enabled);
  recordButton.setAttribute('aria-pressed', String(enabled));
  recordButton.setAttribute('aria-label', enabled ? 'Stop recording loop' : 'Record loop');
  transportLabel.textContent = enabled ? 'RECORDING' : isPlaying ? 'PLAYING' : 'READY';
  announce(enabled ? 'Loop overdub recording started' : 'Loop overdub recording stopped');
}

async function toggleLoopRecording() {
  if (isLoopRecording || pendingRecordSteps) {
    setLoopRecording(false);
    toast('Overdub captured', 'success');
    return;
  }
  if (!isPlaying && state.countIn) {
    pendingRecordSteps = 16;
    recordButton.classList.add('recording');
    recordButton.setAttribute('aria-pressed', 'true');
    recordButton.setAttribute('aria-label', 'Cancel count-in');
    transportLabel.textContent = 'COUNT-IN';
    await startTransport();
    announce('One bar count-in started');
    return;
  }
  if (!isPlaying) await startTransport();
  setLoopRecording(true);
}

function capturedOverdubTiming(audioTime) {
  const secondsPerStep = 60 / state.bpm / 4;
  const rawPosition = loopPositionAtTime(audioTime, loopStartTime, secondsPerStep, loopSteps());
  return quantizeLoopPosition(rawPosition, state.quantize, loopSteps());
}

async function triggerPad(pad, velocity = 1) {
  if (!pad) return;
  const definition = padDefinition(padElements.indexOf(pad));
  if (!definition.type) {
    recordingTargetSlot = definition.slot;
    renderPads();
    await toggleInputRecording();
    return;
  }
  try {
    await engine.ensureReady();
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const padTime = engine.currentTime;
  const recording = definition.recorded ? recordedPads.get(definition.slot) : null;
  const mode = recording ? sampleSettings(recording).mode : 'one-shot';
  if (activePadPlaybacks.has(definition.slot) && (mode === 'gate' || mode === 'loop')) return;
  const played = definition.recorded && engine.playRecording(definition.slot, {
    when: padTime,
    gain: velocity,
    sample: recording,
    onEnded: () => activePadPlaybacks.delete(definition.slot),
  });
  if (played && (mode === 'gate' || mode === 'loop')) activePadPlaybacks.set(definition.slot, played);
  if (!played) engine.play(definition.type, { when: padTime, gain: velocity });
  pad.classList.add('is-hit');
  window.setTimeout(() => pad.classList.remove('is-hit'), 120);
  if (isLoopRecording) {
    const timing = capturedOverdubTiming(padTime);
    const event = {
      ...timing,
      id: makeEventId('overdub'),
      trackId: trackIdForType(definition.type),
      velocity,
      origin: 'overdub',
      quantize: state.quantize,
      slot: definition.slot,
      name: definition.name,
      type: definition.type,
      recorded: definition.recorded,
    };
    const withoutDuplicate = currentEvents().filter((item) => !(item.slot === event.slot && Math.abs(eventLoopPosition(item) - eventLoopPosition(event)) < 0.05));
    commitHistory([...withoutDuplicate, event].sort((a, b) => eventLoopPosition(a) - eventLoopPosition(b)));
  }
  announce(`${definition.name} played`);
}

async function ensureInputStream() {
  await engine.ensureReady();
  if (inputStream?.active) return inputStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is not supported in this browser.');
  inputStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });
  engine.attachInputStream(inputStream);
  updateMeter();
  return inputStream;
}

function releaseInputStream() {
  if (mediaRecorder?.state === 'recording') return;
  inputStream?.getTracks().forEach((track) => track.stop());
  inputStream = null;
  engine.detachInputStream();
  engine.setMonitoring(false);
  monitorButton.setAttribute('aria-pressed', 'false');
  monitorButton.textContent = 'Monitoring off';
  meter.style.width = '0%';
  meterValue.textContent = '−60 dB';
  meterRole.setAttribute('aria-valuenow', '-60');
  privacyLabel.textContent = 'Ready';
}

function updateMeter() {
  if (!inputStream?.active) return;
  const level = engine.getInputLevel();
  const normalized = clamp(((level + 60) / 60) * 100, 0, 100);
  meter.style.width = `${normalized}%`;
  meterValue.textContent = `${Math.round(level)} dB`.replace('-', '−');
  meterRole.setAttribute('aria-valuenow', String(Math.round(level)));
  requestAnimationFrame(updateMeter);
}

function chooseMimeType() {
  const choices = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
  return choices.find((type) => window.MediaRecorder?.isTypeSupported(type)) || '';
}

async function startInputRecording() {
  try {
    const stream = await ensureInputStream();
    if (!window.MediaRecorder) throw new Error('Audio recording is not supported in this browser.');
    const fallbackSlot = KEYS.map((key) => slotFor(state.activeBank, key)).find((slot, index) => !recordedPads.has(slot) && !BANKS[state.activeBank][index]);
    recordingTargetSlot = recordingTargetSlot || fallbackSlot || slotFor(state.activeBank, KEYS[7]);
    renderPads();
    recordingChunks = [];
    const mimeType = chooseMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener('stop', finalizeInputRecording, { once: true });
    mediaRecorder.start(100);
    recordingStartedAt = performance.now();
    inputRecord.classList.add('recording');
    inputRecord.setAttribute('aria-label', 'Stop recording sound');
    privacyLabel.textContent = 'Recording locally';
    updateRecordingTimer();
    toast('Recording… tap the red button again to stop', 'record', 4200);
    announce('Recording new sound locally');
  } catch (error) {
    recordingTargetSlot = null;
    renderPads();
    micStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Microphone unavailable';
    privacyLabel.textContent = 'Input blocked';
    toast(error.name === 'NotAllowedError' ? 'Allow microphone access to record a pad.' : error.message, 'error', 5200);
  }
}

function updateRecordingTimer() {
  if (mediaRecorder?.state !== 'recording') return;
  const elapsed = (performance.now() - recordingStartedAt) / 1000;
  micStatus.textContent = `Recording new sound · 00:${String(Math.floor(elapsed)).padStart(2, '0')}`;
  if (elapsed >= 15) {
    stopInputRecording();
    return;
  }
  recordingTimer = requestAnimationFrame(updateRecordingTimer);
}

function stopInputRecording() {
  if (mediaRecorder?.state !== 'recording') return;
  mediaRecorder.stop();
  cancelAnimationFrame(recordingTimer);
  inputRecord.classList.remove('recording');
  inputRecord.setAttribute('aria-label', 'Record a new sound');
  micStatus.textContent = 'Processing capture…';
}

async function finalizeInputRecording() {
  try {
    const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    if (blob.size < 800) throw new Error('The recording was too short. Try again.');
    const duration = await engine.registerRecording(recordingTargetSlot, blob);
    const key = recordingTargetSlot.split(':').at(-1).toUpperCase();
    const record = {
      slot: recordingTargetSlot,
      blob,
      duration,
      name: `My sound ${key}`,
      ...normalizeSampleSettings({}, duration),
      updatedAt: Date.now(),
    };
    recordedPads.set(record.slot, record);
    await saveRecordedPad(record);
    renderPads();
    micStatus.textContent = `${record.name} saved to pad ${key}`;
    privacyLabel.textContent = 'Saved locally';
    toast(`${record.name} saved · use the trash button to delete`, 'success', 4800);
    announce(`${record.name} saved and ready to play`);
  } catch (error) {
    toast(error.message, 'error');
    micStatus.textContent = 'Capture failed — try again';
  } finally {
    recordingChunks = [];
    recordingTargetSlot = null;
    renderPads();
    if (monitorButton.getAttribute('aria-pressed') !== 'true') releaseInputStream();
  }
}

async function toggleInputRecording() {
  if (mediaRecorder?.state === 'recording') stopInputRecording();
  else await startInputRecording();
}

async function importAudioFile(file, pad) {
  if (!file?.type.startsWith('audio/')) {
    toast('Drop an audio file onto an empty pad.', 'error');
    return;
  }
  const slot = pad.dataset.slot;
  try {
    const duration = await engine.registerRecording(slot, file);
    const record = { slot, blob: file, duration, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Imported sound', ...normalizeSampleSettings({}, duration), updatedAt: Date.now() };
    recordedPads.set(slot, record);
    await saveRecordedPad(record);
    renderPads();
    toast(`${record.name} loaded · use the trash button to delete`, 'success', 4800);
    announce(`${record.name} loaded onto pad ${pad.dataset.key.toUpperCase()}`);
  } catch {
    toast('This audio file could not be decoded.', 'error');
  }
}

async function clearRecordedPad(pad) {
  const slot = pad.dataset.slot;
  const record = recordedPads.get(slot);
  if (!record) return;
  try {
    await removeRecordedPad(slot);
    recordedPads.delete(slot);
    engine.removeRecording(slot);
    state.patterns.forEach((pattern) => { pattern.events = pattern.events.filter((event) => event.slot !== slot); });
    history = [sequenceSnapshot()];
    historyIndex = 0;
    renderPads();
    renderSequencer();
    renderHistoryControls();
    persist();
    toast(`${record.name} cleared`);
    announce(`${record.name} removed from pad ${pad.dataset.key.toUpperCase()}`);
  } catch {
    toast('The recording could not be cleared.', 'error');
  }
}

function requestClearRecordedPad(pad) {
  const record = recordedPads.get(pad.dataset.slot);
  if (!record) return;
  const confirmed = window.confirm(`Delete “${record.name}”?\n\nThis removes the local recording and its overdub hits. This cannot be undone.`);
  if (confirmed) clearRecordedPad(pad);
}

function clearAllOverdubs() {
  if (!currentEvents().length) return;
  const count = currentEvents().length;
  commitHistory([]);
  toast(`${count} pattern ${count === 1 ? 'hit' : 'hits'} cleared · Undo is available`);
  announce('Pattern cleared. Use Undo to restore it.');
}

function collectLoopEvents(includeRecorded = true) {
  const secondsPerStep = 60 / state.bpm / 4;
  const events = [];
  currentEvents().filter((event) => event.step < loopSteps()).forEach((event) => {
    const trackIndex = TRACKS.findIndex((track) => track.id === event.trackId);
    if (trackIndex < 0 || !activeTrack(trackIndex)) return;
    const buffer = includeRecorded && event.recorded ? engine.getRecordingBuffer?.(event.slot) : null;
    const recording = buffer ? recordedPads.get(event.slot) : null;
    events.push({
      type: event.type,
      buffer,
      sample: recording,
      time: eventLoopPosition(event) * secondsPerStep,
      gain: event.velocity * (state.trackStates[trackIndex].volume / 100),
    });
  });
  return events;
}

async function exportLoop() {
  exportButton.disabled = true;
  exportButton.setAttribute('aria-busy', 'true');
  exportButton.lastChild.textContent = 'Rendering…';
  try {
    await engine.ensureReady();
    const buffer = await engine.renderLoop({ bpm: state.bpm, events: collectLoopEvents(), bars: state.loopBars });
    const wav = audioBufferToWav(buffer);
    const url = URL.createObjectURL(wav);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'beatbox-loop'}.wav`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(`${state.loopBars}-bar WAV exported`, 'success');
    announce('Loop export complete');
  } catch (error) {
    toast(`Export failed: ${error.message}`, 'error', 5200);
  } finally {
    exportButton.disabled = false;
    exportButton.removeAttribute('aria-busy');
    exportButton.lastChild.textContent = 'Export';
  }
}

async function shareStudio() {
  const shareData = { title: `Beatbox Studio — ${state.projectName}`, text: 'Listen to my Beatbox Studio session.', url: location.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(location.href);
      toast('Studio link copied', 'success');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('Could not share this session.', 'error');
  }
}

function handleStepCellClick(button, event) {
  const step = Number(button.dataset.step);
  const trackId = button.dataset.track;
  const ids = button.dataset.eventIds.split(',').filter(Boolean);
  if (selectMode || event.shiftKey) {
    if (!ids.length) {
      toast('That step is empty. Switch off Select hits to add one.');
      return;
    }
    ids.forEach((id) => (selectedEventIds.has(id) ? selectedEventIds.delete(id) : selectedEventIds.add(id)));
    renderSequencer();
    return;
  }
  if (ids.length) {
    commitHistory(currentEvents().filter((item) => !ids.includes(item.id)));
    toast(`${ids.length} hit${ids.length === 1 ? '' : 's'} removed`);
    return;
  }
  const track = TRACKS.find((item) => item.id === trackId);
  commitHistory([...currentEvents(), {
    id: makeEventId('drawn'),
    trackId,
    type: track.type,
    name: track.defaultName,
    step,
    offset: 0,
    velocity: 100 / 127,
    origin: 'overdub',
    recorded: false,
  }]);
  announce(`${track.name} hit added at ${formatPosition(step)}`);
}

function deleteSelection() {
  if (!selectedEventIds.size) return;
  const count = selectedEventIds.size;
  commitHistory(currentEvents().filter((event) => !selectedEventIds.has(event.id)));
  selectedEventIds.clear();
  toast(`${count} hit${count === 1 ? '' : 's'} deleted`);
}

function duplicateSelection() {
  if (!selectedEventIds.size) return;
  const occupied = new Set(currentEvents().map((event) => `${event.trackId}:${event.step}`));
  const copies = duplicateEvents(currentEvents(), selectedEventIds, loopSteps(), 1)
    .filter((event) => !occupied.has(`${event.trackId}:${event.step}`))
    .map((event) => ({ ...event, id: makeEventId('copy'), origin: 'overdub' }));
  if (!copies.length) {
    toast('No free step is available one step later.');
    return;
  }
  selectedEventIds.clear();
  copies.forEach((event) => selectedEventIds.add(event.id));
  commitHistory([...currentEvents(), ...copies]);
  toast(`${copies.length} hit${copies.length === 1 ? '' : 's'} duplicated one step later`);
}

function nudgeSelection(milliseconds) {
  if (!selectedEventIds.size) return;
  const stepDelta = (milliseconds / 1000) / (60 / state.bpm / 4);
  commitHistory(currentEvents().map((event) => selectedEventIds.has(event.id) ? nudgeEvent(event, stepDelta, loopSteps()) : event));
  announce(`Selected hits nudged ${milliseconds < 0 ? 'earlier' : 'later'} by ${Math.abs(milliseconds)} millisecond`);
}

function quantizeSelection() {
  const hasSelection = selectedEventIds.size > 0;
  commitHistory(currentEvents().map((event) => (!hasSelection || selectedEventIds.has(event.id))
    ? quantizeEvent(event, state.quantize, loopSteps())
    : event));
  toast(`${hasSelection ? 'Selected hits' : 'Pattern'} quantized to ${state.quantize}`);
}

function duplicatePattern() {
  const source = activePattern();
  const base = `${source.name} copy`;
  let name = base;
  let suffix = 2;
  while (state.patterns.some((pattern) => pattern.name === name)) name = `${base} ${suffix++}`;
  const copy = {
    id: makeEventId('pattern'),
    name,
    events: source.events.map((event) => ({ ...event, id: makeEventId('hit-copy') })),
  };
  state.patterns.push(copy);
  state.activePatternId = copy.id;
  selectedEventIds.clear();
  pushSequenceHistory();
  toast(`Pattern duplicated as ${name}`);
}

function populateMoveTargets() {
  if (!moveTargetSelect || !activeSampleSlot) return;
  moveTargetSelect.innerHTML = Object.keys(BANKS).flatMap((bank) => KEYS.map((key) => {
    const slot = slotFor(bank, key);
    if (slot === activeSampleSlot) return '';
    const recording = recordedPads.get(slot);
    if (!recording && BANKS[bank][KEYS.indexOf(key)]) return '';
    return `<option value="${slot}">${bank} · ${key.toUpperCase()}${recording ? ` · swap with ${recording.name}` : ''}</option>`;
  })).join('');
}

function renderSampleEditor() {
  const record = recordedPads.get(activeSampleSlot);
  if (!record) return;
  const settings = sampleSettings(record);
  const buffer = engine.getRecordingBuffer(record.slot);
  const startPercent = (settings.trimStart / record.duration) * 100;
  const endPercent = (settings.trimEnd / record.duration) * 100;
  waveformEditor.style.setProperty('--trim-start', `${startPercent}%`);
  waveformEditor.style.setProperty('--trim-end', `${endPercent}%`);
  waveformEditor.style.setProperty('--cursor', `${startPercent}%`);
  waveformEditor.querySelector('.waveform-bars').innerHTML = waveformPeaks(buffer).map((height) => `<i style="--h:${height}%"></i>`).join('');
  sampleNameInput.value = record.name;
  sampleMeta.textContent = `${record.slot.replace(':', ' · PAD ')} · ${record.duration.toFixed(2)} S`;
  document.getElementById('trim-start-time').textContent = `${settings.trimStart.toFixed(2)} s`;
  document.getElementById('trim-end-time').textContent = `${settings.trimEnd.toFixed(2)} s`;
  document.getElementById('trim-duration').textContent = `${(settings.trimEnd - settings.trimStart).toFixed(2)} s selected`;
  gainInput.value = String(settings.gainDb);
  fadeInInput.value = String(Math.round(settings.fadeIn * 1000));
  fadeOutInput.value = String(Math.round(settings.fadeOut * 1000));
  pitchInput.value = String(settings.pitch);
  document.getElementById('sample-gain-output').textContent = `${settings.gainDb > 0 ? '+' : ''}${settings.gainDb} dB`;
  document.getElementById('sample-fade-in-output').textContent = `${Math.round(settings.fadeIn * 1000)} ms`;
  document.getElementById('sample-fade-out-output').textContent = `${Math.round(settings.fadeOut * 1000)} ms`;
  document.getElementById('sample-pitch-output').textContent = `${settings.pitch > 0 ? '+' : ''}${settings.pitch} st`;
  reverseButton.setAttribute('aria-pressed', String(settings.reverse));
  playbackModes.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === settings.mode)));
  const hints = {
    'one-shot': 'Plays the whole trimmed sound each time you trigger the pad.',
    gate: 'Plays only while you hold the pad.',
    loop: 'Repeats the trimmed sound while you hold the pad.',
  };
  document.getElementById('sample-mode-hint').textContent = hints[settings.mode];
  populateMoveTargets();
}

function stopAudition() {
  auditionPlayback?.stop();
  auditionPlayback = null;
  cancelAnimationFrame(auditionFrame);
  auditionFrame = null;
  if (auditionButton) auditionButton.textContent = '▶ Audition';
}

async function auditionSample() {
  if (auditionPlayback) {
    stopAudition();
    return;
  }
  const record = recordedPads.get(activeSampleSlot);
  if (!record) return;
  await engine.ensureReady();
  const settings = sampleSettings(record);
  auditionStartedAt = engine.currentTime;
  auditionPlayback = engine.playRecording(record.slot, {
    sample: { ...settings, mode: 'one-shot' },
    loop: false,
    onEnded: stopAudition,
  });
  auditionButton.textContent = '■ Stop';
  const playbackDuration = auditionPlayback.duration;
  const start = (settings.trimStart / record.duration) * 100;
  const end = (settings.trimEnd / record.duration) * 100;
  const tick = () => {
    if (!auditionPlayback) return;
    const progress = clamp((engine.currentTime - auditionStartedAt) / playbackDuration, 0, 1);
    const cursor = settings.reverse ? end - (end - start) * progress : start + (end - start) * progress;
    waveformEditor.style.setProperty('--cursor', `${cursor}%`);
    auditionFrame = requestAnimationFrame(tick);
  };
  tick();
}

function openSampleEditor(slot) {
  if (!recordedPads.has(slot)) return;
  sampleReturnFocus = document.activeElement;
  activeSampleSlot = slot;
  deleteSampleArmed = false;
  document.getElementById('delete-recording').textContent = 'Delete recording';
  renderSampleEditor();
  sampleSheet.classList.add('open');
  sampleScrim.classList.add('open');
  sampleSheet.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => sampleNameInput.focus(), 190);
}

function closeSampleEditor() {
  stopAudition();
  sampleSheet.classList.remove('open');
  sampleScrim.classList.remove('open');
  sampleSheet.setAttribute('aria-hidden', 'true');
  activeSampleSlot = null;
  if (sampleReturnFocus?.isConnected) sampleReturnFocus.focus();
  sampleReturnFocus = null;
}

async function saveActiveSample(settings, { redraw = true } = {}) {
  const record = recordedPads.get(activeSampleSlot);
  if (!record) return;
  updateRecordSettings(record, settings);
  await saveRecordedPad(record);
  if (redraw) renderSampleEditor();
  renderPads();
}

function trimFromPointer(handle, clientX) {
  const record = recordedPads.get(activeSampleSlot);
  if (!record) return;
  const rect = waveformEditor.getBoundingClientRect();
  const time = clamp((clientX - rect.left) / rect.width, 0, 1) * record.duration;
  const settings = sampleSettings(record);
  const minimum = Math.min(0.02, record.duration / 4);
  if (handle.dataset.trim === 'start') settings.trimStart = Math.min(settings.trimEnd - minimum, time);
  else settings.trimEnd = Math.max(settings.trimStart + minimum, time);
  updateRecordSettings(record, settings);
  renderSampleEditor();
}

async function duplicateActiveSample() {
  const record = recordedPads.get(activeSampleSlot);
  const target = findNextEmptySlot(BANKS, KEYS, recordedPads.keys(), activeSampleSlot);
  if (!record || !target) {
    toast('No empty pad is available.', 'error');
    return;
  }
  const copy = { ...record, slot: target, name: `${record.name} copy`.slice(0, 24), updatedAt: Date.now() };
  await engine.registerRecording(target, copy.blob);
  recordedPads.set(target, copy);
  await saveRecordedPad(copy);
  renderPads();
  populateMoveTargets();
  toast(`${record.name} duplicated to ${target.replace(':', ' · ')}`, 'success');
}

function remapEventSlots(from, to, swapFrom = null) {
  remapPatternEventSlots(state.patterns, from, to, Boolean(swapFrom));
}

async function moveOrSwapActiveSample() {
  const from = activeSampleSlot;
  const to = moveTargetSelect.value;
  const record = recordedPads.get(from);
  if (!record || !to) return;
  const targetRecord = recordedPads.get(to);
  if (targetRecord) {
    const moved = { ...record, slot: to, updatedAt: Date.now() };
    const swapped = { ...targetRecord, slot: from, updatedAt: Date.now() };
    recordedPads.set(to, moved);
    recordedPads.set(from, swapped);
    await Promise.all([engine.registerRecording(to, moved.blob), engine.registerRecording(from, swapped.blob), saveRecordedPad(moved), saveRecordedPad(swapped)]);
    remapEventSlots(from, to, true);
    toast(`Pads swapped`, 'success');
  } else {
    const moved = { ...record, slot: to, updatedAt: Date.now() };
    await removeRecordedPad(from);
    engine.removeRecording(from);
    recordedPads.delete(from);
    recordedPads.set(to, moved);
    await Promise.all([engine.registerRecording(to, moved.blob), saveRecordedPad(moved)]);
    remapEventSlots(from, to);
    toast(`${record.name} moved to ${to.replace(':', ' · ')}`, 'success');
  }
  activeSampleSlot = to;
  pushSequenceHistory();
  renderPads();
  renderSampleEditor();
}

async function replaceActiveSample(file) {
  const record = recordedPads.get(activeSampleSlot);
  if (!record || !file?.type.startsWith('audio/')) return;
  try {
    const duration = await engine.registerRecording(record.slot, file);
    Object.assign(record, { blob: file, duration, ...normalizeSampleSettings({}, duration), updatedAt: Date.now() });
    await saveRecordedPad(record);
    renderPads();
    renderSampleEditor();
    toast('Recording replaced. Pad key and sequence hits were kept.', 'success');
  } catch {
    toast('This audio file could not be decoded.', 'error');
  }
}

function beginProjectRename() {
  const before = state.projectName;
  projectName.contentEditable = 'true';
  projectName.classList.add('is-editing');
  projectName.focus();
  const range = document.createRange();
  range.selectNodeContents(projectName);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const finish = (save) => {
    projectName.contentEditable = 'false';
    projectName.classList.remove('is-editing');
    projectName.textContent = save ? projectName.textContent.trim().slice(0, 48) || before : before;
    state.projectName = projectName.textContent;
    projectName.setAttribute('aria-label', `${state.projectName}. Rename project`);
    projectName.removeEventListener('blur', onBlur);
    projectName.removeEventListener('keydown', onEditKeydown);
    persist();
  };
  const onBlur = () => finish(true);
  const onEditKeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); projectName.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  };
  projectName.addEventListener('blur', onBlur, { once: true });
  projectName.addEventListener('keydown', onEditKeydown);
}

function wireEvents() {
  updateThemeToggle(document.documentElement.dataset.theme);
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('beatbox-studio-theme', next); } catch {}
    updateThemeToggle(next);
    if (activeSampleSlot) renderSampleEditor();
    announce(`${next === 'light' ? 'Light' : 'Dark'} theme active`);
  });

  padElements.forEach((pad) => {
    pad.addEventListener('pointerdown', (event) => {
      if (event.button === 0) triggerPad(pad);
    });
    pad.addEventListener('click', (event) => {
      if (event.detail === 0) triggerPad(pad);
    });
    const release = () => {
      const playback = activePadPlaybacks.get(pad.dataset.slot);
      const record = recordedPads.get(pad.dataset.slot);
      if (playback && ['gate', 'loop'].includes(sampleSettings(record).mode)) {
        playback.stop();
        activePadPlaybacks.delete(pad.dataset.slot);
        pad.classList.remove('is-hit');
      }
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('dragover', (event) => { event.preventDefault(); pad.classList.add('is-drop-target'); });
    pad.addEventListener('dragleave', () => pad.classList.remove('is-drop-target'));
    pad.addEventListener('drop', (event) => {
      event.preventDefault();
      pad.classList.remove('is-drop-target');
      importAudioFile(event.dataTransfer.files[0], pad);
    });
    pad.addEventListener('keydown', (event) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && recordedPads.has(pad.dataset.slot)) {
        event.preventDefault();
        requestClearRecordedPad(pad);
      }
    });
    pad.parentElement.querySelector('.pad-edit').addEventListener('click', (event) => {
      event.stopPropagation();
      openSampleEditor(pad.dataset.slot);
    });
  });

  bankButtons.forEach((button) => button.addEventListener('click', () => {
    state.activeBank = button.textContent.trim();
    recordingTargetSlot = null;
    renderBankButtons();
    renderPads();
    persist();
    announce(`${state.activeBank} selected`);
  }));

  playButton.addEventListener('click', () => (isPlaying ? pauseTransport() : startTransport()));
  stopButton.addEventListener('click', stopTransport);
  recordButton.addEventListener('click', toggleLoopRecording);
  inputRecord.addEventListener('click', toggleInputRecording);
  exportButton.addEventListener('click', exportLoop);
  shareButton.addEventListener('click', shareStudio);
  clearOverdubsButton?.addEventListener('click', clearAllOverdubs);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  projectName.addEventListener('dblclick', beginProjectRename);
  projectName.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && projectName.contentEditable !== 'true') {
      event.preventDefault();
      beginProjectRename();
    }
  });

  monitorButton.addEventListener('click', async () => {
    const enabled = monitorButton.getAttribute('aria-pressed') !== 'true';
    try {
      if (enabled) await ensureInputStream();
      engine.setMonitoring(enabled);
      monitorButton.setAttribute('aria-pressed', String(enabled));
      monitorButton.textContent = enabled ? 'Monitoring on' : 'Monitoring off';
      privacyLabel.textContent = enabled ? 'Monitoring locally' : 'Ready';
      if (!enabled) releaseInputStream();
      announce(monitorButton.textContent);
    } catch (error) {
      toast(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : error.message, 'error');
    }
  });

  metronomeButton.addEventListener('click', () => {
    state.metronome = !state.metronome;
    metronomeButton.setAttribute('aria-pressed', String(state.metronome));
    persist();
  });
  countInButton.addEventListener('click', () => {
    state.countIn = !state.countIn;
    countInButton.setAttribute('aria-pressed', String(state.countIn));
    countInButton.textContent = state.countIn ? 'Count-in · 1 bar' : 'Count-in · off';
    persist();
  });
  bpmInput.addEventListener('change', () => {
    state.bpm = clamp(Number(bpmInput.value) || 92, 40, 240);
    bpmInput.value = String(state.bpm);
    if (isPlaying) { stopTransport(); startTransport(); }
    persist();
    announce(`Tempo ${state.bpm} beats per minute`);
  });
  quantizeSelect.addEventListener('change', () => {
    state.quantize = quantizeSelect.value;
    document.querySelector('.transport-right .readout-value').textContent = state.quantize;
    persist();
  });

  timeline.addEventListener('click', (event) => {
    const cell = event.target.closest('.step-cell');
    if (cell) handleStepCellClick(cell, event);
  });
  selectModeButton?.addEventListener('click', () => {
    selectMode = !selectMode;
    selectModeButton.setAttribute('aria-pressed', String(selectMode));
    selectedEventIds.clear();
    renderSequencer();
    announce(selectMode ? 'Select hits on. Tap hits to build a selection.' : 'Draw mode on. Tap steps to add or remove hits.');
  });
  duplicateSelectionButton?.addEventListener('click', duplicateSelection);
  deleteSelectionButton?.addEventListener('click', deleteSelection);
  quantizeSelectionButton?.addEventListener('click', quantizeSelection);
  nudgeLeftButton?.addEventListener('click', () => nudgeSelection(-1));
  nudgeRightButton?.addEventListener('click', () => nudgeSelection(1));
  velocityInput?.addEventListener('pointerdown', () => { velocitySnapshot = sequenceSnapshot(); });
  velocityInput?.addEventListener('focus', () => { if (!velocitySnapshot) velocitySnapshot = sequenceSnapshot(); });
  velocityInput?.addEventListener('input', () => {
    const velocity = Number(velocityInput.value) / 127;
    activePattern().events = currentEvents().map((event) => selectedEventIds.has(event.id) ? { ...event, velocity } : event);
    renderSequencer();
  });
  velocityInput?.addEventListener('change', () => {
    if (!velocitySnapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(sequenceSnapshot());
    historyIndex = history.length - 1;
    velocitySnapshot = null;
    renderHistoryControls();
    persist();
  });
  barOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bars]');
    if (!button || Number(button.dataset.bars) === state.loopBars) return;
    state.loopBars = Number(button.dataset.bars);
    currentStep %= loopSteps();
    selectedEventIds.clear();
    pushSequenceHistory();
    announce(`Loop length ${state.loopBars} bars`);
  });
  patternSelect?.addEventListener('change', () => {
    state.activePatternId = patternSelect.value;
    selectedEventIds.clear();
    history = [sequenceSnapshot()];
    historyIndex = 0;
    renderSequencer();
    renderHistoryControls();
    persist();
    announce(`${activePattern().name} loaded`);
  });
  duplicatePatternButton?.addEventListener('click', duplicatePattern);

  trackElements.forEach((track, index) => {
    const [mute, solo] = track.querySelectorAll('.track-toggle');
    const volume = track.querySelector('.volume');
    mute.addEventListener('click', () => {
      state.trackStates[index].muted = !state.trackStates[index].muted;
      renderTrackStates();
      persist();
    });
    solo.addEventListener('click', () => {
      state.trackStates[index].solo = !state.trackStates[index].solo;
      renderTrackStates();
      persist();
    });
    volume.addEventListener('input', () => {
      state.trackStates[index].volume = Number(volume.value);
      persist();
    });
    track.querySelector('.track-clear').addEventListener('click', () => {
      state.trackStates[index].cleared = !state.trackStates[index].cleared;
      renderTrackStates();
      persist();
      const action = state.trackStates[index].cleared ? 'cleared' : 'restored';
      toast(`${track.querySelector('.track-title').childNodes[0].textContent.trim()} ${action}`);
      announce(`${TRACKS[index].id} track ${action}`);
    });
  });

  document.getElementById('close-sample-sheet')?.addEventListener('click', closeSampleEditor);
  sampleScrim?.addEventListener('click', closeSampleEditor);
  sampleNameInput?.addEventListener('change', async () => {
    const record = recordedPads.get(activeSampleSlot);
    if (!record) return;
    const previous = record.name;
    record.name = sampleNameInput.value.trim().slice(0, 24) || previous;
    record.updatedAt = Date.now();
    state.patterns.forEach((pattern) => pattern.events.forEach((event) => {
      if (event.slot === activeSampleSlot) event.name = record.name;
    }));
    await saveRecordedPad(record);
    renderPads();
    renderSequencer();
    renderSampleEditor();
    persist();
    announce('Sample name updated');
  });
  auditionButton?.addEventListener('click', auditionSample);
  normalizeButton?.addEventListener('click', async () => {
    const record = recordedPads.get(activeSampleSlot);
    const buffer = engine.getRecordingBuffer(activeSampleSlot);
    if (!record || !buffer) return;
    const settings = sampleSettings(record);
    const gainDb = normalizationGainDb(buffer, settings.trimStart, settings.trimEnd);
    await saveActiveSample({ gainDb });
    toast('Normalized to −1 dB peak', 'success');
  });
  [gainInput, fadeInInput, fadeOutInput, pitchInput].forEach((input) => input?.addEventListener('change', async () => {
    const settings = {
      gainDb: Number(gainInput.value),
      fadeIn: Number(fadeInInput.value) / 1000,
      fadeOut: Number(fadeOutInput.value) / 1000,
      pitch: Number(pitchInput.value),
    };
    await saveActiveSample(settings);
    announce('Sample settings saved');
  }));
  [gainInput, fadeInInput, fadeOutInput, pitchInput].forEach((input) => input?.addEventListener('input', () => {
    document.getElementById('sample-gain-output').textContent = `${Number(gainInput.value) > 0 ? '+' : ''}${gainInput.value} dB`;
    document.getElementById('sample-fade-in-output').textContent = `${fadeInInput.value} ms`;
    document.getElementById('sample-fade-out-output').textContent = `${fadeOutInput.value} ms`;
    document.getElementById('sample-pitch-output').textContent = `${Number(pitchInput.value) > 0 ? '+' : ''}${pitchInput.value} st`;
  }));
  reverseButton?.addEventListener('click', async () => {
    const record = recordedPads.get(activeSampleSlot);
    if (!record) return;
    await saveActiveSample({ reverse: !sampleSettings(record).reverse });
    announce(sampleSettings(record).reverse ? 'Reverse on' : 'Reverse off');
  });
  playbackModes?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    await saveActiveSample({ mode: button.dataset.mode });
    announce(`${button.textContent} playback selected`);
  });
  waveformEditor?.querySelectorAll('.trim-handle').forEach((handle) => handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => trimFromPointer(handle, moveEvent.clientX);
    const finish = async () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      const record = recordedPads.get(activeSampleSlot);
      if (record) await saveRecordedPad(record);
      announce('Trim updated');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }));
  waveformEditor?.querySelectorAll('.trim-handle').forEach((handle) => handle.addEventListener('keydown', async (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const record = recordedPads.get(activeSampleSlot);
    if (!record) return;
    const settings = sampleSettings(record);
    const delta = event.key === 'ArrowLeft' ? -0.01 : 0.01;
    if (handle.dataset.trim === 'start') settings.trimStart = clamp(settings.trimStart + delta, 0, settings.trimEnd - 0.02);
    else settings.trimEnd = clamp(settings.trimEnd + delta, settings.trimStart + 0.02, record.duration);
    await saveActiveSample(settings);
  }));
  document.getElementById('duplicate-recording')?.addEventListener('click', duplicateActiveSample);
  document.getElementById('move-recording')?.addEventListener('click', moveOrSwapActiveSample);
  const replaceFile = document.getElementById('replace-recording-file');
  document.getElementById('replace-recording')?.addEventListener('click', () => replaceFile.click());
  replaceFile?.addEventListener('change', async () => {
    await replaceActiveSample(replaceFile.files[0]);
    replaceFile.value = '';
  });
  document.getElementById('delete-recording')?.addEventListener('click', (event) => {
    if (!deleteSampleArmed) {
      deleteSampleArmed = true;
      event.currentTarget.textContent = 'Confirm delete';
      toast('Press again to delete this recording');
      window.setTimeout(() => {
        deleteSampleArmed = false;
        if (event.currentTarget) event.currentTarget.textContent = 'Delete recording';
      }, 3200);
      return;
    }
    const pad = padElements.find((item) => item.dataset.slot === activeSampleSlot);
    closeSampleEditor();
    clearRecordedPad(pad);
  });

  document.getElementById('coach-dismiss').addEventListener('click', () => {
    document.querySelector('.pad-section').classList.add('coach-dismissed');
    document.getElementById('coach').remove();
    announce('Coaching dismissed');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sampleSheet?.classList.contains('open')) {
      event.preventDefault();
      closeSampleEditor();
      return;
    }
    const target = event.target;
    if (target.matches('input, select, textarea') || target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEventIds.size) {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      isPlaying ? pauseTransport() : startTransport();
      return;
    }
    const pad = padElements.find((item) => item.dataset.key === key);
    if (pad) triggerPad(pad, event.repeat ? 0.65 : 1);
  });
  document.addEventListener('keyup', (event) => {
    const pad = padElements.find((item) => item.dataset.key === event.key.toLowerCase());
    const playback = pad ? activePadPlaybacks.get(pad.dataset.slot) : null;
    const record = pad ? recordedPads.get(pad.dataset.slot) : null;
    if (playback && ['gate', 'loop'].includes(sampleSettings(record).mode)) {
      playback.stop();
      activePadPlaybacks.delete(pad.dataset.slot);
      pad.classList.remove('is-hit');
    }
  });
  window.addEventListener('beforeunload', releaseInputStream);
}

async function restoreRecordings() {
  try {
    const records = await loadRecordedPads();
    for (const record of records) {
      try {
        await engine.registerRecording(record.slot, record.blob);
        Object.assign(record, normalizeSampleSettings(record, record.duration));
        recordedPads.set(record.slot, record);
      } catch {
        // Skip a damaged recording without blocking the studio.
      }
    }
    renderPads();
  } catch {
    toast('Local recordings could not be restored.', 'error');
  }
}

function initialize() {
  decoratePadShells();
  decorateTrackControls();
  history = [sequenceSnapshot()];
  historyIndex = 0;
  bpmInput.value = String(state.bpm);
  metronomeButton.setAttribute('aria-pressed', String(state.metronome));
  countInButton.setAttribute('aria-pressed', String(state.countIn));
  countInButton.textContent = state.countIn ? 'Count-in · 1 bar' : 'Count-in · off';
  quantizeSelect.value = state.quantize;
  document.querySelector('.transport-right .readout-value').textContent = state.quantize;
  projectName.textContent = state.projectName;
  projectName.tabIndex = 0;
  projectName.setAttribute('role', 'button');
  projectName.setAttribute('aria-label', `${state.projectName}. Rename project`);
  renderBankButtons();
  renderPads();
  renderTrackStates();
  renderSequencer();
  renderHistoryControls();
  wireEvents();
  restoreRecordings();
}

initialize();
