const TAU = Math.PI * 2;

function createNoiseBuffer(context, seconds = 1) {
  const length = Math.ceil(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function safeExp(param, value, time) {
  param.exponentialRampToValueAtTime(Math.max(0.0001, value), time);
}

export function dbToGain(db = 0) {
  return 10 ** (Number(db) / 20);
}

export function pitchRate(semitones = 0) {
  return 2 ** (Number(semitones) / 12);
}

export function normalizeSampleSettings(settings = {}, duration = 0) {
  const safeDuration = Math.max(0.005, Number(duration) || 0.005);
  const trimStart = Math.min(safeDuration - 0.005, Math.max(0, Number(settings.trimStart) || 0));
  const trimEnd = Math.min(safeDuration, Math.max(trimStart + 0.005, Number(settings.trimEnd) || safeDuration));
  const selectionDuration = trimEnd - trimStart;
  return {
    trimStart,
    trimEnd,
    fadeIn: Math.min(selectionDuration, Math.max(0, Number(settings.fadeIn) || 0)),
    fadeOut: Math.min(selectionDuration, Math.max(0, Number(settings.fadeOut) || 0)),
    gainDb: Math.min(12, Math.max(-18, Number(settings.gainDb) || 0)),
    pitch: Math.min(12, Math.max(-12, Number(settings.pitch) || 0)),
    reverse: Boolean(settings.reverse),
    mode: ['one-shot', 'gate', 'loop'].includes(settings.mode) ? settings.mode : 'one-shot',
  };
}

export function samplePlaybackWindow(settings = {}, duration = 0) {
  const sample = normalizeSampleSettings(settings, duration);
  const rate = pitchRate(sample.pitch);
  const sourceDuration = sample.trimEnd - sample.trimStart;
  return {
    ...sample,
    rate,
    sourceDuration,
    playbackDuration: sourceDuration / rate,
    gain: dbToGain(sample.gainDb),
  };
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.monitorGain = null;
    this.analyser = null;
    this.streamSource = null;
    this.noiseBuffers = new WeakMap();
    this.recordedBuffers = new Map();
    this.reversedBuffers = new WeakMap();
  }

  async ensureReady({ resume = true } = {}) {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is not supported in this browser.');
      this.context = new Context({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.78;
      this.master.connect(this.context.destination);
      this.monitorGain = this.context.createGain();
      this.monitorGain.gain.value = 0;
      this.monitorGain.connect(this.master);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.76;
    }
    if (resume && this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  get currentTime() {
    return this.context?.currentTime ?? 0;
  }

  get outputLatency() {
    return this.context?.outputLatency ?? this.context?.baseLatency ?? 0;
  }

  setMasterVolume(value) {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.02);
  }

  setMonitoring(enabled) {
    if (!this.monitorGain || !this.context) return;
    this.monitorGain.gain.setTargetAtTime(enabled ? 0.72 : 0, this.context.currentTime, 0.03);
  }

  attachInputStream(stream) {
    if (!this.context) throw new Error('Audio engine is not ready.');
    this.streamSource?.disconnect();
    this.streamSource = this.context.createMediaStreamSource(stream);
    this.streamSource.connect(this.analyser);
    this.streamSource.connect(this.monitorGain);
  }

  detachInputStream() {
    this.streamSource?.disconnect();
    this.streamSource = null;
  }

  getInputLevel() {
    if (!this.analyser || !this.streamSource) return -60;
    const values = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(values);
    let sum = 0;
    for (const value of values) sum += value * value;
    const rms = Math.sqrt(sum / values.length);
    return Math.max(-60, 20 * Math.log10(Math.max(rms, 0.001)));
  }

  async registerRecording(slot, blob) {
    const context = await this.ensureReady({ resume: false });
    const data = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(data.slice(0));
    this.recordedBuffers.set(slot, decoded);
    return decoded.duration;
  }

  hasRecording(slot) {
    return this.recordedBuffers.has(slot);
  }

  getRecordingBuffer(slot) {
    return this.recordedBuffers.get(slot) ?? null;
  }

  removeRecording(slot) {
    this.recordedBuffers.delete(slot);
  }

  reversedBuffer(buffer, context = this.context) {
    if (this.reversedBuffers.has(buffer)) return this.reversedBuffers.get(buffer);
    const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const source = buffer.getChannelData(channel);
      const destination = reversed.getChannelData(channel);
      for (let index = 0; index < source.length; index += 1) destination[index] = source[source.length - index - 1];
    }
    this.reversedBuffers.set(buffer, reversed);
    return reversed;
  }

  playBuffer(context, destination, buffer, options = {}) {
    const sample = samplePlaybackWindow(options.sample, buffer.duration);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const when = Math.max(context.currentTime ?? 0, options.when ?? context.currentTime ?? 0);
    const playBuffer = sample.reverse ? this.reversedBuffer(buffer, context) : buffer;
    const offset = sample.reverse ? buffer.duration - sample.trimEnd : sample.trimStart;
    const shouldLoop = options.loop ?? sample.mode === 'loop';
    const targetGain = Math.max(0.0001, (options.gain ?? 1) * sample.gain);
    const playbackDuration = sample.playbackDuration;
    const fadeIn = Math.min(playbackDuration / 2, sample.fadeIn / sample.rate);
    const fadeOut = Math.min(playbackDuration / 2, sample.fadeOut / sample.rate);

    source.buffer = playBuffer;
    source.playbackRate.value = sample.rate;
    source.loop = shouldLoop;
    source.loopStart = offset;
    source.loopEnd = offset + sample.sourceDuration;
    source.connect(gain).connect(destination);

    gain.gain.setValueAtTime(fadeIn && !shouldLoop ? 0.0001 : targetGain, when);
    if (fadeIn && !shouldLoop) gain.gain.linearRampToValueAtTime(targetGain, when + fadeIn);
    if (fadeOut && !shouldLoop) {
      gain.gain.setValueAtTime(targetGain, Math.max(when + fadeIn, when + playbackDuration - fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, when + playbackDuration);
    }

    if (typeof options.onEnded === 'function') source.addEventListener('ended', options.onEnded, { once: true });
    if (shouldLoop) source.start(when, offset);
    else source.start(when, offset, sample.sourceDuration);

    let stopped = false;
    return {
      source,
      gain,
      duration: playbackDuration,
      stop: (stopTime = context.currentTime ?? 0) => {
        if (stopped) return;
        stopped = true;
        try { source.stop(stopTime); } catch {}
      },
    };
  }

  playRecording(slot, options = {}) {
    const buffer = this.recordedBuffers.get(slot);
    if (!buffer || !this.context) return false;
    return this.playBuffer(this.context, options.destination ?? this.master, buffer, options);
  }

  play(type, options = {}) {
    if (!this.context) return;
    this.trigger(this.context, options.destination ?? this.master, type, options.when ?? this.context.currentTime, options.gain ?? 1);
  }

  trigger(context, destination, type, when, gain = 1) {
    const noise = () => {
      if (!this.noiseBuffers.has(context)) this.noiseBuffers.set(context, createNoiseBuffer(context, 1));
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffers.get(context);
      return source;
    };
    const out = context.createGain();
    out.gain.value = Math.max(0.001, gain);
    out.connect(destination);

    if (type === 'kick' || type === 'kick-soft') {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'kick' ? 155 : 120, when);
      safeExp(osc.frequency, type === 'kick' ? 44 : 52, when + 0.24);
      amp.gain.setValueAtTime(0.001, when);
      amp.gain.linearRampToValueAtTime(type === 'kick' ? 1 : 0.72, when + 0.004);
      safeExp(amp.gain, 0.001, when + (type === 'kick' ? 0.42 : 0.3));
      osc.connect(amp).connect(out);
      osc.start(when);
      osc.stop(when + 0.46);
      return;
    }

    if (type === 'snare' || type === 'clap') {
      const bursts = type === 'clap' ? [0, 0.018, 0.037, 0.07] : [0];
      for (const offset of bursts) {
        const source = noise();
        const filter = context.createBiquadFilter();
        const amp = context.createGain();
        filter.type = type === 'clap' ? 'bandpass' : 'highpass';
        filter.frequency.value = type === 'clap' ? 1350 : 1100;
        filter.Q.value = type === 'clap' ? 0.75 : 0.45;
        amp.gain.setValueAtTime(type === 'clap' ? 0.45 : 0.82, when + offset);
        safeExp(amp.gain, 0.001, when + offset + (type === 'clap' ? 0.13 : 0.2));
        source.connect(filter).connect(amp).connect(out);
        source.start(when + offset);
        source.stop(when + offset + 0.22);
      }
      if (type === 'snare') {
        const osc = context.createOscillator();
        const amp = context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 180;
        amp.gain.setValueAtTime(0.28, when);
        safeExp(amp.gain, 0.001, when + 0.12);
        osc.connect(amp).connect(out);
        osc.start(when);
        osc.stop(when + 0.14);
      }
      return;
    }

    if (type === 'hat' || type === 'hat-open' || type === 'inward') {
      const source = noise();
      const filter = context.createBiquadFilter();
      const amp = context.createGain();
      filter.type = type === 'inward' ? 'bandpass' : 'highpass';
      filter.frequency.value = type === 'inward' ? 2100 : 6500;
      filter.Q.value = type === 'inward' ? 3.2 : 0.7;
      const duration = type === 'hat-open' ? 0.48 : type === 'inward' ? 0.25 : 0.08;
      amp.gain.setValueAtTime(type === 'inward' ? 0.72 : 0.5, when);
      safeExp(amp.gain, 0.001, when + duration);
      source.connect(filter).connect(amp).connect(out);
      source.start(when);
      source.stop(when + duration + 0.02);
      return;
    }

    if (type === 'bass' || type === 'hum') {
      const osc = context.createOscillator();
      const sub = context.createOscillator();
      const filter = context.createBiquadFilter();
      const amp = context.createGain();
      osc.type = type === 'bass' ? 'sawtooth' : 'sine';
      sub.type = 'sine';
      osc.frequency.setValueAtTime(type === 'bass' ? 71 : 92, when);
      sub.frequency.setValueAtTime(type === 'bass' ? 35.5 : 46, when);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(type === 'bass' ? 520 : 310, when);
      safeExp(filter.frequency, 95, when + 0.7);
      amp.gain.setValueAtTime(0.001, when);
      amp.gain.linearRampToValueAtTime(0.58, when + 0.015);
      safeExp(amp.gain, 0.001, when + 0.78);
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(amp).connect(out);
      osc.start(when);
      sub.start(when);
      osc.stop(when + 0.82);
      sub.stop(when + 0.82);
      return;
    }

    const osc = context.createOscillator();
    const amp = context.createGain();
    const frequency = type === 'rim' ? 920 : type === 'pop' ? 330 : type === 'shaker' ? 5200 : 1450;
    osc.type = type === 'pop' ? 'sine' : 'square';
    osc.frequency.setValueAtTime(frequency, when);
    if (type === 'pop') safeExp(osc.frequency, 105, when + 0.14);
    amp.gain.setValueAtTime(type === 'rim' ? 0.28 : 0.38, when);
    safeExp(amp.gain, 0.001, when + (type === 'pop' ? 0.18 : 0.07));
    osc.connect(amp).connect(out);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  async renderLoop({ bpm, events, bars = 4 }) {
    const sampleRate = 44100;
    const secondsPerBeat = 60 / bpm;
    const duration = bars * 4 * secondsPerBeat;
    const offline = new OfflineAudioContext(2, Math.ceil((duration + 0.5) * sampleRate), sampleRate);
    const master = offline.createGain();
    master.gain.value = 0.72;
    master.connect(offline.destination);
    for (const event of events) {
      if (event.buffer) {
        this.playBuffer(offline, master, event.buffer, {
          when: event.time,
          gain: event.gain ?? 1,
          sample: event.sample,
          loop: false,
        });
      } else {
        this.trigger(offline, master, event.type, event.time, event.gain ?? 1);
      }
    }
    return offline.startRendering();
  }
}

export function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels * 2 + 44;
  const output = new ArrayBuffer(length);
  const view = new DataView(output);
  const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, length - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length - 44, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: 'audio/wav' });
}
