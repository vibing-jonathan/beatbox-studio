import { AudioEngine, audioBufferToWav, normalizeSampleSettings } from './audio-engine.js';
import {
  deleteProjectSession,
  getActiveProjectId,
  listProjectSessions,
  loadProjectRecovery,
  loadProjectSession,
  loadRecordedPads,
  loadSettings,
  removeRecordedPad,
  saveProjectSession,
  saveRecordedPad,
  saveSettings,
  setActiveProjectId,
} from './storage.js';
import { RecoverableSaveQueue } from './save-queue.js';
import {
  cleanProjectName,
  createProjectRecord,
  duplicateProjectRecord,
  parseProjectBundle,
  projectFileName,
  serializeProjectBundle,
  uniqueProjectName,
} from './project-session.js';
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
import { normalizeChannelMixer, normalizeMasterMixer, panLabel, resetChannelEffects } from './mixer.js';

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
const projectSheet = document.getElementById('project-sheet');
const projectScrim = document.getElementById('project-scrim');
const projectList = document.getElementById('project-list');
const projectSearch = document.getElementById('project-search');
const projectCount = document.getElementById('project-count');
const projectRecovery = document.getElementById('project-recovery');
const projectError = document.getElementById('project-error');
const projectConflict = document.getElementById('project-conflict');
const newProjectForm = document.getElementById('new-project-form');
const newProjectName = document.getElementById('new-project-name');
const importProjectFile = document.getElementById('import-project-file');
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
const workspace = document.querySelector('.workspace');
const mixerView = document.getElementById('mixer-view');
const mixerRail = document.getElementById('mixer-rail');
const effectsInspector = document.getElementById('effects-inspector');
const effectsHeading = document.getElementById('effects-heading');
const effectsBypass = document.getElementById('effects-bypass');
const studioViewButtons = [...document.querySelectorAll('[data-studio-view]')];

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
  trackStates: TRACKS.map((track, index) => normalizeChannelMixer(stored.trackStates?.[index], {
    id: track.id,
    volume: Number(trackElements[index]?.querySelector('.volume')?.value) || 75,
  })),
  masterMixer: normalizeMasterMixer(stored.masterMixer),
  studioView: stored.studioView === 'mix' ? 'mix' : 'sequence',
  selectedMixerTrackId: TRACKS.some((track) => track.id === stored.selectedMixerTrackId) ? stored.selectedMixerTrackId : TRACKS[0].id,
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
let activeProjectId = null;
let activeProjectCreatedAt = Date.now();
const projectSaveQueue = new RecoverableSaveQueue();
let projectCache = [];
let projectReturnFocus = null;
let pendingDeleteProjectId = null;
let pendingDeleteTimer = null;
let pendingImportedProject = null;
let lastProjectFingerprint = '';
let mixerMeterFrame = null;

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

function currentSettings() {
  return {
    activeBank: state.activeBank,
    bpm: state.bpm,
    metronome: state.metronome,
    countIn: state.countIn,
    quantize: state.quantize,
    projectName: state.projectName,
    trackStates: state.trackStates,
    masterMixer: state.masterMixer,
    studioView: state.studioView,
    selectedMixerTrackId: state.selectedMixerTrackId,
    loopBars: state.loopBars,
    patterns: state.patterns,
    activePatternId: state.activePatternId,
  };
}

function applyStoredSettings(settings = {}) {
  const patterns = createInitialPatterns(settings, TRACKS);
  state.activeBank = BANKS[settings.activeBank] ? settings.activeBank : 'Bank A';
  state.bpm = clamp(Number(settings.bpm) || 92, 40, 240);
  state.metronome = settings.metronome ?? true;
  state.countIn = settings.countIn ?? true;
  state.quantize = ['1/16', '1/8 swing', '1/8', 'Off'].includes(settings.quantize) ? settings.quantize : '1/16';
  state.projectName = cleanProjectName(settings.projectName, 'Untitled session');
  state.trackStates = TRACKS.map((track, index) => normalizeChannelMixer(settings.trackStates?.[index], {
    id: track.id,
    volume: Number(trackElements[index]?.querySelector('.volume')?.value) || 75,
  }));
  state.masterMixer = normalizeMasterMixer(settings.masterMixer);
  state.studioView = settings.studioView === 'mix' ? 'mix' : 'sequence';
  state.selectedMixerTrackId = TRACKS.some((track) => track.id === settings.selectedMixerTrackId) ? settings.selectedMixerTrackId : TRACKS[0].id;
  state.loopBars = [1, 2, 4, 8].includes(Number(settings.loopBars)) ? Number(settings.loopBars) : 4;
  state.patterns = patterns.patterns;
  state.activePatternId = patterns.activePatternId;
}

function currentProjectRecord(now = Date.now()) {
  return {
    id: activeProjectId,
    name: cleanProjectName(state.projectName),
    createdAt: activeProjectCreatedAt,
    updatedAt: now,
    settings: structuredClone(currentSettings()),
    recordings: [...recordedPads.values()].map((recording) => ({ ...recording })),
  };
}

function currentProjectFingerprint() {
  return JSON.stringify({
    settings: currentSettings(),
    recordings: [...recordedPads.values()].map((recording) => ({
      slot: recording.slot,
      name: recording.name,
      updatedAt: recording.updatedAt,
      size: recording.blob?.size ?? 0,
    })),
  });
}

async function flushProjectSave({ createRecovery = true } = {}) {
  if (!activeProjectId) return null;
  const fingerprint = currentProjectFingerprint();
  if (fingerprint === lastProjectFingerprint) {
    return projectCache.find((project) => project.id === activeProjectId) ?? currentProjectRecord();
  }
  const snapshot = currentProjectRecord();
  const saved = await projectSaveQueue.enqueue(() => saveProjectSession(snapshot, { createRecovery }));
  lastProjectFingerprint = fingerprint;
  const existingIndex = projectCache.findIndex((project) => project.id === saved.id);
  if (existingIndex >= 0) projectCache[existingIndex] = saved;
  else projectCache.push(saved);
  projectCache.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  return saved;
}

function persist() {
  clearTimeout(saveTimer);
  setSaveLabel('Saving…', true);
  saveTimer = window.setTimeout(async () => {
    saveSettings(currentSettings());
    try {
      await flushProjectSave();
      setSaveLabel('Saved just now · on this device');
    } catch (error) {
      setSaveLabel('Save failed');
      const message = error?.name === 'QuotaExceededError'
        ? 'Local storage is full. Your edits are still open; export this session before clearing space.'
        : 'Saving was interrupted. Your edits are still open and the next change will retry.';
      toast(message, 'error', 5200);
    }
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
  engine.configureMixer(state.trackStates, state.masterMixer);
}

function effectValueLabel(key, value) {
  if (['eqLow', 'eqMid', 'eqHigh', 'compThreshold'].includes(key)) return `${Number(value) > 0 ? '+' : ''}${value} dB`;
  if (key === 'compRatio') return `${value}:1`;
  return `${value}%`;
}

function renderEffectsInspector() {
  const channel = state.trackStates.find((track) => track.id === state.selectedMixerTrackId) ?? state.trackStates[0];
  const track = TRACKS.find((candidate) => candidate.id === channel.id) ?? TRACKS[0];
  effectsHeading.textContent = track.name;
  effectsBypass.setAttribute('aria-pressed', String(channel.bypass));
  effectsBypass.textContent = channel.bypass ? 'Bypassed' : 'Bypass';
  effectsInspector.querySelectorAll('[data-effect]').forEach((input) => {
    input.value = String(channel[input.dataset.effect]);
    input.disabled = false;
  });
  effectsInspector.querySelectorAll('[data-effect-output]').forEach((output) => {
    const key = output.dataset.effectOutput;
    output.value = effectValueLabel(key, channel[key]);
    output.textContent = output.value;
  });
}

function channelStripMarkup(track, channel) {
  return `<section class="channel-strip${channel.id === state.selectedMixerTrackId ? ' selected' : ''}" data-mixer-track="${channel.id}" aria-label="${track.name} channel">
    <div class="channel-name"><strong>${track.name}</strong><span>${channel.bypass ? 'FX BYPASSED' : 'CHANNEL'}</span></div>
    <div class="channel-actions"><button type="button" data-mixer-action="mute" aria-pressed="${channel.muted}" aria-label="Mute ${track.name}">M</button><button type="button" data-mixer-action="solo" aria-pressed="${channel.solo}" aria-label="Solo ${track.name}">S</button></div>
    <div class="channel-fader-zone"><span class="channel-meter" data-meter="left" aria-hidden="true"></span><span class="channel-meter" data-meter="right" aria-hidden="true"></span><input class="channel-fader" data-mixer-volume type="range" min="0" max="100" value="${channel.volume}" aria-orientation="vertical" aria-label="${track.name} mixer volume"></div>
    <div><div class="channel-value"><output data-volume-output>${Math.round(channel.volume)}%</output></div><label class="pan-row"><span class="sr-only">${track.name} pan</span><input data-mixer-pan type="range" min="-100" max="100" value="${channel.pan}" aria-label="${track.name} pan"><output data-pan-output>${panLabel(channel.pan)}</output></label></div>
    <button class="channel-fx" type="button" data-mixer-action="effects">Effects</button>
  </section>`;
}

function masterStripMarkup() {
  const master = state.masterMixer;
  return `<section class="channel-strip master" data-master-strip aria-label="Master channel">
    <div class="channel-name"><strong>Master</strong><span>OUTPUT</span></div>
    <div class="channel-actions"><button type="button" data-master-limiter aria-pressed="${master.limiter}">Limiter</button><button type="button" disabled>−1 dB</button></div>
    <div class="channel-fader-zone"><span class="channel-meter" data-master-meter="left" aria-hidden="true"></span><span class="channel-meter" data-master-meter="right" aria-hidden="true"></span><input class="channel-fader" data-master-volume type="range" min="0" max="100" value="${master.volume}" aria-orientation="vertical" aria-label="Master volume"></div>
    <div><div class="channel-value"><output data-master-volume-output>${Math.round(master.volume)}%</output></div><label class="pan-row"><span class="sr-only">Master balance</span><input data-master-balance type="range" min="-100" max="100" value="${master.balance}" aria-label="Master balance"><output data-master-balance-output>${panLabel(master.balance)}</output></label></div>
    <div class="master-status" id="master-status" role="status" aria-live="polite">LIMITER READY · −1 dB CEILING</div>
  </section>`;
}

function renderMixer() {
  mixerRail.innerHTML = `${TRACKS.map((track, index) => channelStripMarkup(track, state.trackStates[index])).join('')}${masterStripMarkup()}`;
  renderEffectsInspector();
  engine.configureMixer(state.trackStates, state.masterMixer);
}

function updateMixerMeters() {
  if (state.studioView !== 'mix') {
    mixerMeterFrame = null;
    return;
  }
  state.trackStates.forEach((channel) => {
    const level = engine.getTrackLevel(channel.id);
    const percent = `${clamp(((level + 60) / 60) * 100, 3, 100)}%`;
    const strip = mixerRail.querySelector(`[data-mixer-track="${channel.id}"]`);
    strip?.querySelectorAll('.channel-meter').forEach((meterElement) => meterElement.style.setProperty('--level', percent));
  });
  const masterLevel = engine.getMasterLevel();
  const masterPercent = `${clamp(((masterLevel + 60) / 60) * 100, 3, 100)}%`;
  mixerRail.querySelectorAll('[data-master-meter]').forEach((meterElement) => meterElement.style.setProperty('--level', masterPercent));
  const masterStatus = document.getElementById('master-status');
  if (masterStatus) {
    masterStatus.classList.toggle('clipping', masterLevel > -0.5);
    masterStatus.textContent = masterLevel > -0.5 ? 'CLIPPING · LOWER MASTER' : `${state.masterMixer.limiter ? 'LIMITER READY' : 'LIMITER OFF'} · ${state.masterMixer.ceiling} dB CEILING`;
  }
  mixerMeterFrame = requestAnimationFrame(updateMixerMeters);
}

function setStudioView(view, { save = true } = {}) {
  state.studioView = view === 'mix' ? 'mix' : 'sequence';
  workspace.classList.toggle('is-hidden', state.studioView === 'mix');
  mixerView.classList.toggle('active', state.studioView === 'mix');
  studioViewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.studioView === state.studioView)));
  if (state.studioView === 'mix') {
    renderMixer();
    if (!mixerMeterFrame) mixerMeterFrame = requestAnimationFrame(updateMixerMeters);
  } else if (mixerMeterFrame) {
    cancelAnimationFrame(mixerMeterFrame);
    mixerMeterFrame = null;
  }
  if (save) persist();
  announce(`${state.studioView === 'mix' ? 'Mix' : 'Sequence'} view active`);
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

function mixerTrackForSlot(slot, fallbackType = 'hat') {
  return state.patterns.flatMap((pattern) => pattern.events).find((event) => event.slot === slot)?.trackId ?? trackIdForType(fallbackType);
}

function scheduleStep(step, when) {
  const hitTime = when + swingDelayForStep(step);
  const secondsPerStep = 60 / state.bpm / 4;
  for (const event of currentEvents().filter((item) => item.step === step)) {
    const trackIndex = TRACKS.findIndex((track) => track.id === event.trackId);
    if (trackIndex < 0 || !activeTrack(trackIndex)) continue;
    const eventTime = when + eventOffsetSteps(event) * secondsPerStep;
    const gain = event.velocity;
    const destination = engine.trackDestination(event.trackId);
    const recording = event.recorded ? recordedPads.get(event.slot) : null;
    if (recording && engine.playRecording(event.slot, { when: eventTime, gain, sample: recording, loop: false, destination })) continue;
    engine.play(event.type, { when: eventTime || hitTime, gain, destination });
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
  const padIndex = padElements.indexOf(pad);
  const fallbackType = BANKS[state.activeBank][padIndex]?.[1] ?? definition.type;
  const mixerTrackId = mixerTrackForSlot(definition.slot, fallbackType);
  const destination = engine.trackDestination(mixerTrackId);
  const recording = definition.recorded ? recordedPads.get(definition.slot) : null;
  const mode = recording ? sampleSettings(recording).mode : 'one-shot';
  if (activePadPlaybacks.has(definition.slot) && (mode === 'gate' || mode === 'loop')) return;
  const played = definition.recorded && engine.playRecording(definition.slot, {
    when: padTime,
    gain: velocity,
    sample: recording,
    destination,
    onEnded: () => activePadPlaybacks.delete(definition.slot),
  });
  if (played && (mode === 'gate' || mode === 'loop')) activePadPlaybacks.set(definition.slot, played);
  if (!played) engine.play(definition.type, { when: padTime, gain: velocity, destination });
  pad.classList.add('is-hit');
  window.setTimeout(() => pad.classList.remove('is-hit'), 120);
  if (isLoopRecording) {
    const timing = capturedOverdubTiming(padTime);
    const event = {
      ...timing,
      id: makeEventId('overdub'),
      trackId: mixerTrackId,
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
    persist();
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
    persist();
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
      trackId: event.trackId,
      time: eventLoopPosition(event) * secondsPerStep,
      gain: event.velocity,
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
    const buffer = await engine.renderLoop({
      bpm: state.bpm,
      events: collectLoopEvents(),
      bars: state.loopBars,
      channels: state.trackStates,
      master: state.masterMixer,
    });
    const wav = audioBufferToWav(buffer);
    const url = URL.createObjectURL(wav);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'beatbox-loop'}.wav`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${state.loopBars}-bar WAV exported with mixer effects`, 'success');
    announce('Loop export complete with mixer effects rendered');
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
  const linkedTrackId = mixerTrackForSlot(record.slot, BANKS[record.slot.split(':')[0]]?.[KEYS.indexOf(record.slot.split(':')[1])]?.[1] ?? 'hat');
  const linkedTrack = TRACKS.find((track) => track.id === linkedTrackId);
  const effectsLink = document.getElementById('edit-pad-effects');
  if (effectsLink) effectsLink.textContent = `Edit ${linkedTrack?.name ?? 'channel'} effects in Mix`;
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
  persist();
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
  persist();
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
    persist();
    renderPads();
    renderSampleEditor();
    toast('Recording replaced. Pad key and sequence hits were kept.', 'success');
  } catch {
    toast('This audio file could not be decoded.', 'error');
  }
}

function defaultProjectSettings(name = 'Untitled session') {
  return {
    activeBank: 'Bank A',
    bpm: 92,
    metronome: true,
    countIn: true,
    quantize: '1/16',
    projectName: cleanProjectName(name),
    trackStates: TRACKS.map((track, index) => normalizeChannelMixer({}, {
      id: track.id,
      volume: Number(trackElements[index]?.querySelector('.volume')?.defaultValue) || 75,
    })),
    masterMixer: normalizeMasterMixer(),
    studioView: 'sequence',
    selectedMixerTrackId: TRACKS[0].id,
    loopBars: 4,
    patterns: [{ id: 'pattern-1', name: 'Pattern 1', events: [] }],
    activePatternId: 'pattern-1',
  };
}

function renderStudioState() {
  bpmInput.value = String(state.bpm);
  metronomeButton.setAttribute('aria-pressed', String(state.metronome));
  countInButton.setAttribute('aria-pressed', String(state.countIn));
  countInButton.textContent = state.countIn ? 'Count-in · 1 bar' : 'Count-in · off';
  quantizeSelect.value = state.quantize;
  document.querySelector('.transport-right .readout-value').textContent = state.quantize;
  projectName.textContent = state.projectName;
  projectName.setAttribute('aria-label', `${state.projectName}. Open project library`);
  selectedEventIds.clear();
  history = [sequenceSnapshot()];
  historyIndex = 0;
  renderBankButtons();
  renderPads();
  renderTrackStates();
  renderSequencer();
  renderHistoryControls();
  renderMixer();
  setStudioView(state.studioView, { save: false });
}

function formatProjectAge(timestamp) {
  const elapsed = Math.max(0, Date.now() - Number(timestamp || 0));
  if (elapsed < 60_000) return 'saved just now';
  if (elapsed < 3_600_000) return `saved ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `saved ${Math.floor(elapsed / 3_600_000)}h ago`;
  return `saved ${Math.floor(elapsed / 86_400_000)}d ago`;
}

function projectDurationLabel(project) {
  const bpm = clamp(Number(project.settings?.bpm) || 92, 40, 240);
  const bars = Number(project.settings?.loopBars) || 4;
  const seconds = Math.round((bars * 4 * 60) / bpm);
  return `${seconds}s loop`;
}

function showProjectError(message = '') {
  projectError.textContent = message;
  projectError.classList.toggle('open', Boolean(message));
}

async function updateProjectRecovery() {
  const recovery = activeProjectId ? await loadProjectRecovery(activeProjectId) : null;
  projectRecovery.classList.toggle('open', Boolean(recovery));
}

function renderProjectLibrary() {
  const query = projectSearch.value.trim().toLocaleLowerCase();
  const visible = projectCache.filter((project) => project.name.toLocaleLowerCase().includes(query));
  projectCount.textContent = `${projectCache.length} ${projectCache.length === 1 ? 'SESSION' : 'SESSIONS'}`;
  projectList.replaceChildren();

  if (!projectCache.length) {
    const empty = document.createElement('div');
    empty.className = 'project-empty';
    const title = document.createElement('strong');
    title.textContent = 'No sessions on this device';
    empty.append(title, document.createTextNode('Create a session or import a .beatbox bundle to begin.'));
    projectList.append(empty);
    return;
  }
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'project-empty';
    const title = document.createElement('strong');
    title.textContent = 'No matching sessions';
    empty.append(title, document.createTextNode(`Nothing matches “${projectSearch.value.trim()}”.`));
    projectList.append(empty);
    return;
  }

  visible.forEach((project) => {
    const item = document.createElement('article');
    item.className = `project-item${project.id === activeProjectId ? ' active' : ''}`;
    item.dataset.projectId = project.id;

    const main = document.createElement('div');
    main.className = 'project-item-main';
    const title = document.createElement('div');
    title.className = 'project-item-title';
    const name = document.createElement('strong');
    name.textContent = project.name;
    title.append(name);
    if (project.id === activeProjectId) {
      const chip = document.createElement('span');
      chip.className = 'project-active-chip';
      chip.textContent = 'OPEN';
      title.append(chip);
    }
    const meta = document.createElement('div');
    meta.className = 'project-item-meta';
    meta.textContent = `${project.settings?.bpm || 92} BPM · ${project.settings?.loopBars || 4} bars · ${projectDurationLabel(project)} · ${formatProjectAge(project.updatedAt)}`;
    main.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'project-item-actions';
    const actionDefinitions = [
      ['open', project.id === activeProjectId ? 'Open' : 'Load'],
      ['rename', 'Rename'],
      ['duplicate', 'Copy'],
      ['delete', pendingDeleteProjectId === project.id ? 'Confirm delete' : 'Delete'],
    ];
    actionDefinitions.forEach(([action, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.projectAction = action;
      button.textContent = label;
      if (action === 'delete') button.className = pendingDeleteProjectId === project.id ? 'danger confirm' : 'danger';
      if (action === 'open' && project.id === activeProjectId) button.disabled = true;
      actions.append(button);
    });
    item.append(main, actions);
    projectList.append(item);
  });
}

async function refreshProjectCache() {
  projectCache = await listProjectSessions();
  renderProjectLibrary();
}

async function loadProjectIntoStudio(project) {
  stopTransport();
  if (sampleSheet?.classList.contains('open')) closeSampleEditor();
  [...recordedPads.keys()].forEach((slot) => engine.removeRecording(slot));
  recordedPads.clear();

  if (!project) {
    activeProjectId = null;
    activeProjectCreatedAt = Date.now();
    setActiveProjectId(null);
    lastProjectFingerprint = '';
    applyStoredSettings(defaultProjectSettings('No session'));
    state.projectName = 'No session';
    renderStudioState();
    setSaveLabel('No session open');
    renderProjectLibrary();
    await updateProjectRecovery();
    return;
  }

  applyStoredSettings({ ...project.settings, projectName: project.name });
  activeProjectId = project.id;
  activeProjectCreatedAt = Number(project.createdAt) || Date.now();
  setActiveProjectId(project.id);
  for (const record of project.recordings ?? []) {
    try {
      await engine.registerRecording(record.slot, record.blob);
      Object.assign(record, normalizeSampleSettings(record, record.duration));
      recordedPads.set(record.slot, record);
    } catch {
      toast(`${record.name || 'A recording'} could not be restored.`, 'error');
    }
  }
  saveSettings(currentSettings());
  lastProjectFingerprint = currentProjectFingerprint();
  renderStudioState();
  setSaveLabel('Saved just now · on this device');
  renderProjectLibrary();
  await updateProjectRecovery();
  announce(`${project.name} opened`);
}

async function initializeProjectSession() {
  projectCache = await listProjectSessions();
  if (!projectCache.length) {
    const legacyRecordings = await loadRecordedPads();
    const migrated = createProjectRecord({
      name: state.projectName,
      settings: currentSettings(),
      recordings: legacyRecordings,
    });
    await saveProjectSession(migrated, { createRecovery: false });
    projectCache = [migrated];
  }
  const requestedId = getActiveProjectId();
  const active = projectCache.find((project) => project.id === requestedId) ?? projectCache[0];
  await loadProjectIntoStudio(active);
}

async function openProjectLibrary() {
  projectReturnFocus = document.activeElement;
  let saveError = null;
  try {
    await flushProjectSave();
  } catch (error) {
    saveError = error;
  }
  await refreshProjectCache();
  await updateProjectRecovery();
  showProjectError(saveError
    ? 'The current edits are still open but have not been saved. You can export them or retry after making another change.'
    : '');
  projectSheet.classList.add('open');
  projectScrim.classList.add('open');
  projectSheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  projectSearch.focus();
}

function closeProjectLibrary() {
  projectSheet.classList.remove('open');
  projectScrim.classList.remove('open');
  projectSheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  newProjectForm.classList.remove('open');
  projectConflict.classList.remove('open');
  pendingImportedProject = null;
  projectReturnFocus?.focus?.();
}

async function createNewProject(name) {
  const safeName = uniqueProjectName(name, projectCache.map((project) => project.name));
  const project = createProjectRecord({ name: safeName, settings: defaultProjectSettings(safeName) });
  await saveProjectSession(project, { createRecovery: false });
  projectCache.unshift(project);
  await loadProjectIntoStudio(project);
  newProjectForm.classList.remove('open');
  toast(`${project.name} created`, 'success');
}

function beginLibraryRename(projectId) {
  const item = projectList.querySelector(`[data-project-id="${CSS.escape(projectId)}"]`);
  const project = projectCache.find((candidate) => candidate.id === projectId);
  const title = item?.querySelector('.project-item-title');
  if (!title || !project) return;
  title.replaceChildren();
  const input = document.createElement('input');
  input.className = 'project-rename-input';
  input.maxLength = 48;
  input.value = project.name;
  title.append(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    if (save) {
      const nextName = cleanProjectName(input.value, project.name);
      project.name = uniqueProjectName(nextName, projectCache.filter((candidate) => candidate.id !== project.id).map((candidate) => candidate.name));
      project.settings = { ...project.settings, projectName: project.name };
      project.updatedAt = Date.now();
      await saveProjectSession(project);
      if (project.id === activeProjectId) {
        state.projectName = project.name;
        projectName.textContent = project.name;
        projectName.setAttribute('aria-label', `${project.name}. Open project library`);
        lastProjectFingerprint = currentProjectFingerprint();
      }
    }
    renderProjectLibrary();
  };
  input.addEventListener('blur', () => finish(true), { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
}

async function duplicateLibraryProject(projectId) {
  const source = projectCache.find((project) => project.id === projectId);
  if (!source) return;
  const duplicate = duplicateProjectRecord(source, projectCache.map((project) => project.name));
  await saveProjectSession(duplicate, { createRecovery: false });
  projectCache.unshift(duplicate);
  renderProjectLibrary();
  toast(`${duplicate.name} created`, 'success');
}

async function requestDeleteLibraryProject(projectId) {
  if (pendingDeleteProjectId !== projectId) {
    pendingDeleteProjectId = projectId;
    clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = window.setTimeout(() => {
      pendingDeleteProjectId = null;
      renderProjectLibrary();
    }, 4200);
    renderProjectLibrary();
    announce('Press Confirm delete to remove this session');
    return;
  }
  clearTimeout(pendingDeleteTimer);
  pendingDeleteProjectId = null;
  await deleteProjectSession(projectId);
  projectCache = projectCache.filter((project) => project.id !== projectId);
  if (projectId === activeProjectId) await loadProjectIntoStudio(projectCache[0] ?? null);
  renderProjectLibrary();
  toast('Session deleted from this device');
}

async function exportCurrentProject() {
  if (!activeProjectId) return;
  showProjectError();
  try {
    const project = await flushProjectSave();
    const bundle = await serializeProjectBundle(project);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bundle], { type: 'application/json' }));
    link.download = projectFileName(project.name);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast(`${link.download} exported`, 'success');
  } catch (error) {
    showProjectError(error.message);
  }
}

async function saveImportedProject(project, { replace = null } = {}) {
  const imported = replace ? {
    ...project,
    id: replace.id,
    name: replace.name,
    createdAt: replace.createdAt,
    settings: { ...project.settings, projectName: replace.name },
  } : project;
  await saveProjectSession(imported, { createRecovery: Boolean(replace) });
  await refreshProjectCache();
  await loadProjectIntoStudio(imported);
  projectConflict.classList.remove('open');
  pendingImportedProject = null;
  toast(`${imported.name} imported`, 'success');
}

async function importProjectBundle(file) {
  showProjectError();
  try {
    const imported = parseProjectBundle(await file.text(), { existingNames: [] });
    const conflict = projectCache.find((project) => project.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase());
    if (conflict) {
      pendingImportedProject = { imported, conflict };
      document.getElementById('project-conflict-copy').textContent = `“${imported.name}” already exists. Keep a separate copy or replace the local session.`;
      projectConflict.classList.add('open');
      return;
    }
    await saveImportedProject(imported);
  } catch (error) {
    showProjectError(error.message);
  }
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
  studioViewButtons.forEach((button) => button.addEventListener('click', () => setStudioView(button.dataset.studioView)));

  mixerRail?.addEventListener('click', (event) => {
    const strip = event.target.closest('[data-mixer-track]');
    const action = event.target.closest('[data-mixer-action]')?.dataset.mixerAction;
    if (strip && action) {
      const channel = state.trackStates.find((track) => track.id === strip.dataset.mixerTrack);
      state.selectedMixerTrackId = channel.id;
      if (action === 'mute') channel.muted = !channel.muted;
      if (action === 'solo') channel.solo = !channel.solo;
      renderTrackStates();
      renderMixer();
      persist();
      announce(`${TRACKS.find((track) => track.id === channel.id)?.name} ${action === 'effects' ? 'effects selected' : `${action} ${channel[action === 'mute' ? 'muted' : 'solo'] ? 'on' : 'off'}`}`);
      return;
    }
    const limiter = event.target.closest('[data-master-limiter]');
    if (limiter) {
      state.masterMixer.limiter = !state.masterMixer.limiter;
      renderMixer();
      persist();
      announce(`Master limiter ${state.masterMixer.limiter ? 'on' : 'off'}`);
    }
  });
  mixerRail?.addEventListener('input', (event) => {
    const strip = event.target.closest('[data-mixer-track]');
    if (strip) {
      const channel = state.trackStates.find((track) => track.id === strip.dataset.mixerTrack);
      if (event.target.matches('[data-mixer-volume]')) {
        channel.volume = Number(event.target.value);
        strip.querySelector('[data-volume-output]').textContent = `${Math.round(channel.volume)}%`;
        const trackIndex = state.trackStates.indexOf(channel);
        trackElements[trackIndex].querySelector('.volume').value = String(channel.volume);
      }
      if (event.target.matches('[data-mixer-pan]')) {
        channel.pan = Number(event.target.value);
        strip.querySelector('[data-pan-output]').textContent = panLabel(channel.pan);
      }
    }
    if (event.target.matches('[data-master-volume]')) {
      state.masterMixer.volume = Number(event.target.value);
      mixerRail.querySelector('[data-master-volume-output]').textContent = `${Math.round(state.masterMixer.volume)}%`;
    }
    if (event.target.matches('[data-master-balance]')) {
      state.masterMixer.balance = Number(event.target.value);
      mixerRail.querySelector('[data-master-balance-output]').textContent = panLabel(state.masterMixer.balance);
    }
    engine.configureMixer(state.trackStates, state.masterMixer);
    persist();
  });
  effectsInspector?.addEventListener('input', (event) => {
    const key = event.target.dataset.effect;
    if (!key) return;
    const channel = state.trackStates.find((track) => track.id === state.selectedMixerTrackId);
    channel[key] = Number(event.target.value);
    const output = effectsInspector.querySelector(`[data-effect-output="${key}"]`);
    output.textContent = effectValueLabel(key, channel[key]);
    engine.configureMixer(state.trackStates, state.masterMixer);
    persist();
  });
  effectsBypass?.addEventListener('click', () => {
    const channel = state.trackStates.find((track) => track.id === state.selectedMixerTrackId);
    channel.bypass = !channel.bypass;
    renderMixer();
    persist();
    announce(`${effectsHeading.textContent} effects ${channel.bypass ? 'bypassed' : 'active'}`);
  });
  document.getElementById('effects-reset')?.addEventListener('click', () => {
    const index = state.trackStates.findIndex((track) => track.id === state.selectedMixerTrackId);
    state.trackStates[index] = resetChannelEffects(state.trackStates[index]);
    renderTrackStates();
    renderMixer();
    persist();
    toast(`${effectsHeading.textContent} effects reset to neutral`);
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
  projectName.addEventListener('click', openProjectLibrary);
  document.getElementById('close-project-sheet')?.addEventListener('click', closeProjectLibrary);
  projectScrim?.addEventListener('click', closeProjectLibrary);
  projectSearch?.addEventListener('input', renderProjectLibrary);
  document.getElementById('new-project')?.addEventListener('click', () => {
    newProjectForm.classList.add('open');
    newProjectName.value = '';
    newProjectName.focus();
  });
  document.getElementById('cancel-new-project')?.addEventListener('click', () => newProjectForm.classList.remove('open'));
  newProjectForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createNewProject(newProjectName.value);
  });
  document.getElementById('import-project')?.addEventListener('click', () => importProjectFile.click());
  document.getElementById('export-project')?.addEventListener('click', exportCurrentProject);
  importProjectFile?.addEventListener('change', async () => {
    if (importProjectFile.files[0]) await importProjectBundle(importProjectFile.files[0]);
    importProjectFile.value = '';
  });
  projectList?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-project-action]');
    const item = actionButton?.closest('[data-project-id]');
    if (!actionButton || !item) return;
    const projectId = item.dataset.projectId;
    if (actionButton.dataset.projectAction === 'open') {
      try {
        await flushProjectSave();
      } catch {
        showProjectError('This session is still open but has unsaved edits. Make another change to retry before switching sessions.');
        return;
      }
      await loadProjectIntoStudio(projectCache.find((project) => project.id === projectId));
      closeProjectLibrary();
    }
    if (actionButton.dataset.projectAction === 'rename') beginLibraryRename(projectId);
    if (actionButton.dataset.projectAction === 'duplicate') await duplicateLibraryProject(projectId);
    if (actionButton.dataset.projectAction === 'delete') await requestDeleteLibraryProject(projectId);
  });
  document.getElementById('restore-project')?.addEventListener('click', async () => {
    const recovery = await loadProjectRecovery(activeProjectId);
    if (!recovery) return;
    recovery.updatedAt = Date.now();
    await saveProjectSession(recovery, { createRecovery: true });
    await refreshProjectCache();
    await loadProjectIntoStudio(recovery);
    toast('Previous save restored. The newer save remains recoverable.', 'success');
  });
  document.getElementById('project-keep-both')?.addEventListener('click', async () => {
    if (!pendingImportedProject) return;
    pendingImportedProject.imported.name = uniqueProjectName(pendingImportedProject.imported.name, projectCache.map((project) => project.name));
    pendingImportedProject.imported.settings.projectName = pendingImportedProject.imported.name;
    await saveImportedProject(pendingImportedProject.imported);
  });
  document.getElementById('project-replace')?.addEventListener('click', async () => {
    if (pendingImportedProject) await saveImportedProject(pendingImportedProject.imported, { replace: pendingImportedProject.conflict });
  });
  document.getElementById('project-conflict-cancel')?.addEventListener('click', () => {
    pendingImportedProject = null;
    projectConflict.classList.remove('open');
  });
  clearOverdubsButton?.addEventListener('click', clearAllOverdubs);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);

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
      if (state.studioView === 'mix') renderMixer();
      persist();
    });
    solo.addEventListener('click', () => {
      state.trackStates[index].solo = !state.trackStates[index].solo;
      renderTrackStates();
      if (state.studioView === 'mix') renderMixer();
      persist();
    });
    volume.addEventListener('input', () => {
      state.trackStates[index].volume = Number(volume.value);
      engine.configureMixer(state.trackStates, state.masterMixer);
      const strip = mixerRail.querySelector(`[data-mixer-track="${state.trackStates[index].id}"]`);
      if (strip) {
        strip.querySelector('[data-mixer-volume]').value = volume.value;
        strip.querySelector('[data-volume-output]').textContent = `${volume.value}%`;
      }
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
      if (record) {
        await saveRecordedPad(record);
        persist();
      }
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
  document.getElementById('edit-pad-effects')?.addEventListener('click', () => {
    const record = recordedPads.get(activeSampleSlot);
    if (!record) return;
    const bank = record.slot.split(':')[0];
    const key = record.slot.split(':')[1];
    state.selectedMixerTrackId = mixerTrackForSlot(record.slot, BANKS[bank]?.[KEYS.indexOf(key)]?.[1] ?? 'hat');
    closeSampleEditor();
    setStudioView('mix');
  });
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
    if (event.key === 'Escape' && projectSheet?.classList.contains('open')) {
      event.preventDefault();
      closeProjectLibrary();
      return;
    }
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

async function initialize() {
  decoratePadShells();
  decorateTrackControls();
  await initializeProjectSession();
  wireEvents();
}

initialize().catch((error) => {
  console.error(error);
  renderStudioState();
  wireEvents();
  toast('Local project storage is unavailable. This session will remain open until you close the tab.', 'error', 6400);
});
