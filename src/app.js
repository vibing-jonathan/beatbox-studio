import { AudioEngine, audioBufferToWav } from './audio-engine.js';
import { loadRecordedPads, loadSettings, saveRecordedPad, saveSettings } from './storage.js';

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
const addTrackButton = document.querySelector('[aria-label="Add track"]');
const undoButton = document.querySelector('[aria-label="Undo"]');
const redoButton = document.querySelector('[aria-label="Redo"]');
const micStatus = document.getElementById('mic-status');
const privacyLabel = document.getElementById('privacy-label');
const meter = document.getElementById('meter-fill');
const meterValue = document.getElementById('meter-value');
const meterRole = document.querySelector('[role="meter"]');

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
  { id: 'kicks', type: 'kick', steps: [0, 32], gain: 0.95 },
  { id: 'snares', type: 'snare', steps: [8, 40], gain: 0.82 },
  { id: 'hats', type: 'hat', steps: Array.from({ length: 32 }, (_, index) => index * 2), gain: 0.45 },
  { id: 'bass', type: 'bass', steps: [16, 48], gain: 0.62 },
];

const stored = loadSettings();
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
  })),
  customEvents: Array.isArray(stored.customEvents) ? stored.customEvents : [],
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
let history = [structuredClone(state.customEvents)];
let historyIndex = 0;
let saveTimer = null;
let toastStack = null;
const recordedPads = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slotFor(bank, key) {
  return `${bank}:${key}`;
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
      customEvents: state.customEvents,
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
    pad.classList.toggle('capture-target', definition.slot === recordingTargetSlot);
    pad.setAttribute('aria-label', empty
      ? `Empty pad, keyboard ${key.toUpperCase()}. Record or drop audio.`
      : `Play ${definition.name}, keyboard ${key.toUpperCase()}`);
    pad.querySelector('.pad-name').textContent = definition.name;
    pad.querySelector('.keycap').textContent = key.toUpperCase();
    pad.querySelector('.pad-meta').textContent = empty ? 'EMPTY' : `${definition.duration.toFixed(2)} s`;
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
    mute.setAttribute('aria-pressed', String(trackState.muted));
    solo.setAttribute('aria-pressed', String(trackState.solo));
    volume.value = String(trackState.volume);
    track.classList.toggle('is-muted', trackState.muted);
    track.classList.toggle('is-solo', trackState.solo);
  });
}

function renderOverdubMarkers() {
  document.querySelectorAll('.overdub-marker').forEach((marker) => marker.remove());
  const ruler = document.querySelector('.ruler');
  state.customEvents.forEach((event, index) => {
    const marker = document.createElement('button');
    marker.className = 'overdub-marker';
    marker.style.left = `${(event.step / 64) * 100}%`;
    marker.title = `${event.name} at ${formatPosition(event.step)}`;
    marker.setAttribute('aria-label', `${event.name} overdub at ${formatPosition(event.step)}. Click to remove.`);
    marker.addEventListener('click', () => {
      commitHistory(state.customEvents.filter((_, eventIndex) => eventIndex !== index));
      toast('Overdub hit removed');
    });
    ruler.append(marker);
  });
}

function renderHistoryControls() {
  undoButton.disabled = historyIndex === 0;
  redoButton.disabled = historyIndex >= history.length - 1;
}

function commitHistory(events) {
  state.customEvents = structuredClone(events);
  history = history.slice(0, historyIndex + 1);
  history.push(structuredClone(events));
  historyIndex = history.length - 1;
  renderOverdubMarkers();
  renderHistoryControls();
  persist();
}

function undo() {
  if (historyIndex === 0) return;
  historyIndex -= 1;
  state.customEvents = structuredClone(history[historyIndex]);
  renderOverdubMarkers();
  renderHistoryControls();
  persist();
  announce('Last overdub undone');
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  state.customEvents = structuredClone(history[historyIndex]);
  renderOverdubMarkers();
  renderHistoryControls();
  persist();
  announce('Overdub restored');
}

function formatPosition(step) {
  const normalized = ((step % 64) + 64) % 64;
  return `${Math.floor(normalized / 16) + 1}.${Math.floor((normalized % 16) / 4) + 1}.${(normalized % 4) + 1}`;
}

function activeTrack(index) {
  const anySolo = state.trackStates.some((track) => track.solo);
  const track = state.trackStates[index];
  return !track.muted && (!anySolo || track.solo);
}

function scheduleStep(step, when) {
  TRACKS.forEach((track, index) => {
    if (!activeTrack(index) || !track.steps.includes(step)) return;
    engine.play(track.type, { when, gain: track.gain * (state.trackStates[index].volume / 100) });
  });
  for (const event of state.customEvents.filter((item) => item.step === step)) {
    if (event.recorded && engine.playRecording(event.slot, { when, gain: 0.9 })) continue;
    engine.play(event.type, { when, gain: 0.8 });
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
    currentStep = (currentStep + 1) % 64;
    if (currentStep === 0) loopStartTime = nextNoteTime + secondsPerStep;
    nextNoteTime += secondsPerStep;
  }
}

function updatePlayhead() {
  if (!isPlaying || !engine.context) return;
  const loopDuration = (60 / state.bpm) * 16;
  const progress = clamp(((engine.currentTime - loopStartTime) % loopDuration) / loopDuration, 0, 1);
  const visualStep = Math.floor(progress * 64) % 64;
  playhead.style.left = `${progress * 100}%`;
  mobileLoopRail.style.setProperty('--loop-progress', `${progress * 100}%`);
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

function quantizedStep() {
  const quantum = state.quantize === '1/8' || state.quantize === '1/8 swing' ? 2 : 1;
  return Math.round(currentStep / quantum) * quantum % 64;
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
  const played = definition.recorded && engine.playRecording(definition.slot, { gain: velocity });
  if (!played) engine.play(definition.type, { gain: velocity });
  pad.classList.add('is-hit');
  window.setTimeout(() => pad.classList.remove('is-hit'), 120);
  if (isLoopRecording) {
    const event = {
      step: quantizedStep(),
      slot: definition.slot,
      name: definition.name,
      type: definition.type,
      recorded: definition.recorded,
    };
    const withoutDuplicate = state.customEvents.filter((item) => !(item.step === event.step && item.slot === event.slot));
    commitHistory([...withoutDuplicate, event].sort((a, b) => a.step - b.step));
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
      updatedAt: Date.now(),
    };
    recordedPads.set(record.slot, record);
    await saveRecordedPad(record);
    renderPads();
    micStatus.textContent = `${record.name} saved to pad ${key}`;
    privacyLabel.textContent = 'Saved locally';
    toast(`${record.name} saved`, 'success');
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
    const record = { slot, blob: file, duration, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Imported sound', updatedAt: Date.now() };
    recordedPads.set(slot, record);
    await saveRecordedPad(record);
    renderPads();
    toast(`${record.name} loaded`, 'success');
    announce(`${record.name} loaded onto pad ${pad.dataset.key.toUpperCase()}`);
  } catch {
    toast('This audio file could not be decoded.', 'error');
  }
}

function collectLoopEvents(includeRecorded = true) {
  const secondsPerStep = 60 / state.bpm / 4;
  const events = [];
  TRACKS.forEach((track, index) => {
    if (!activeTrack(index)) return;
    track.steps.forEach((step) => events.push({ type: track.type, time: step * secondsPerStep, gain: track.gain * (state.trackStates[index].volume / 100) }));
  });
  state.customEvents.forEach((event) => {
    const buffer = includeRecorded && event.recorded ? engine.getRecordingBuffer?.(event.slot) : null;
    events.push({ type: event.type, buffer, time: event.step * secondsPerStep, gain: 0.8 });
  });
  return events;
}

async function exportLoop() {
  exportButton.disabled = true;
  exportButton.setAttribute('aria-busy', 'true');
  exportButton.lastChild.textContent = 'Rendering…';
  try {
    await engine.ensureReady();
    const buffer = await engine.renderLoop({ bpm: state.bpm, events: collectLoopEvents(), bars: 4 });
    const wav = audioBufferToWav(buffer);
    const url = URL.createObjectURL(wav);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'beatbox-loop'}.wav`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast('Four-bar WAV exported', 'success');
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
    projectName.removeEventListener('blur', onBlur);
    persist();
  };
  const onBlur = () => finish(true);
  projectName.addEventListener('blur', onBlur, { once: true });
  projectName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); projectName.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  }, { once: true });
}

function wireEvents() {
  updateThemeToggle(document.documentElement.dataset.theme);
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('beatbox-studio-theme', next); } catch {}
    updateThemeToggle(next);
    announce(`${next === 'light' ? 'Light' : 'Dark'} theme active`);
  });

  padElements.forEach((pad) => {
    pad.addEventListener('click', () => triggerPad(pad));
    pad.addEventListener('dragover', (event) => { event.preventDefault(); pad.classList.add('is-drop-target'); });
    pad.addEventListener('dragleave', () => pad.classList.remove('is-drop-target'));
    pad.addEventListener('drop', (event) => {
      event.preventDefault();
      pad.classList.remove('is-drop-target');
      importAudioFile(event.dataTransfer.files[0], pad);
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
  addTrackButton.addEventListener('click', () => {
    toast('Overdub lane armed — press record, then play any pad.', 'success', 4400);
    recordButton.focus();
  });
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
  });

  document.getElementById('coach-dismiss').addEventListener('click', () => {
    document.getElementById('coach').remove();
    announce('Coaching dismissed');
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target.matches('input, select, textarea') || target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
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
  window.addEventListener('beforeunload', releaseInputStream);
}

async function restoreRecordings() {
  try {
    const records = await loadRecordedPads();
    for (const record of records) {
      try {
        await engine.registerRecording(record.slot, record.blob);
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
  state.customEvents = state.customEvents.filter((event) => Number.isInteger(event.step) && event.step >= 0 && event.step < 64);
  history = [structuredClone(state.customEvents)];
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
  renderOverdubMarkers();
  renderHistoryControls();
  wireEvents();
  restoreRecordings();
}

initialize();
