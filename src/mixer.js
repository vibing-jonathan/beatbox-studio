export const CHANNEL_EFFECT_DEFAULTS = Object.freeze({
  pan: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compThreshold: -18,
  compRatio: 3,
  reverbSend: 0,
  delaySend: 0,
  bypass: false,
});

export const MASTER_MIXER_DEFAULTS = Object.freeze({
  volume: 82,
  balance: 0,
  limiter: true,
  ceiling: -1,
});

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
}

export function normalizeChannelMixer(channel = {}, { id = '', volume = 75 } = {}) {
  return {
    ...channel,
    id: channel.id || id,
    volume: clamp(channel.volume, 0, 100, volume),
    muted: Boolean(channel.muted),
    solo: Boolean(channel.solo),
    cleared: Boolean(channel.cleared),
    pan: clamp(channel.pan, -100, 100, CHANNEL_EFFECT_DEFAULTS.pan),
    eqLow: clamp(channel.eqLow, -12, 12, CHANNEL_EFFECT_DEFAULTS.eqLow),
    eqMid: clamp(channel.eqMid, -12, 12, CHANNEL_EFFECT_DEFAULTS.eqMid),
    eqHigh: clamp(channel.eqHigh, -12, 12, CHANNEL_EFFECT_DEFAULTS.eqHigh),
    compThreshold: clamp(channel.compThreshold, -60, 0, CHANNEL_EFFECT_DEFAULTS.compThreshold),
    compRatio: clamp(channel.compRatio, 1, 20, CHANNEL_EFFECT_DEFAULTS.compRatio),
    reverbSend: clamp(channel.reverbSend, 0, 100, CHANNEL_EFFECT_DEFAULTS.reverbSend),
    delaySend: clamp(channel.delaySend, 0, 100, CHANNEL_EFFECT_DEFAULTS.delaySend),
    bypass: Boolean(channel.bypass),
  };
}

export function normalizeMasterMixer(master = {}) {
  return {
    volume: clamp(master.volume, 0, 100, MASTER_MIXER_DEFAULTS.volume),
    balance: clamp(master.balance, -100, 100, MASTER_MIXER_DEFAULTS.balance),
    limiter: master.limiter ?? MASTER_MIXER_DEFAULTS.limiter,
    ceiling: clamp(master.ceiling, -12, 0, MASTER_MIXER_DEFAULTS.ceiling),
  };
}

export function resetChannelEffects(channel = {}) {
  return normalizeChannelMixer({
    ...channel,
    ...CHANNEL_EFFECT_DEFAULTS,
  }, { id: channel.id, volume: channel.volume });
}

export function channelIsAudible(channel, channels = []) {
  const anySolo = channels.some((candidate) => candidate.solo);
  return !channel.cleared && !channel.muted && (!anySolo || channel.solo);
}

export function panLabel(value) {
  const pan = Math.round(Number(value) || 0);
  if (pan === 0) return 'C';
  return pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`;
}
