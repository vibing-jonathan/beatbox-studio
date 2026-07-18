export function waveformPeaks(buffer, count = 84) {
  if (!buffer) return Array.from({ length: count }, (_, index) => 18 + ((index * 37) % 72));
  const channel = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(channel.length / count));
  const peaks = [];
  for (let index = 0; index < count; index += 1) {
    let peak = 0;
    const start = index * size;
    const end = Math.min(channel.length, start + size);
    for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]));
    peaks.push(Math.max(8, Math.round(peak * 100)));
  }
  return peaks;
}

export function normalizationGainDb(buffer, trimStart, trimEnd, targetPeak = 0.95) {
  if (!buffer) return 0;
  const channel = buffer.getChannelData(0);
  const start = Math.max(0, Math.floor(trimStart * buffer.sampleRate));
  const end = Math.min(channel.length, Math.ceil(trimEnd * buffer.sampleRate));
  let peak = 0;
  for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(channel[index]));
  if (!peak) return 0;
  return Math.min(12, Math.max(-18, Math.round(20 * Math.log10(targetPeak / peak))));
}

export function remapPatternEventSlots(patterns, from, to, swap = false) {
  patterns.forEach((pattern) => {
    pattern.events.forEach((event) => {
      if (event.slot === from) event.slot = '__moving__';
      else if (swap && event.slot === to) event.slot = from;
    });
    pattern.events.forEach((event) => { if (event.slot === '__moving__') event.slot = to; });
  });
  return patterns;
}

export function findNextEmptySlot(banks, keys, occupiedSlots, activeSlot = '') {
  const occupied = new Set(occupiedSlots);
  for (const [bank, definitions] of Object.entries(banks)) {
    for (let index = 0; index < keys.length; index += 1) {
      const slot = `${bank}:${keys[index]}`;
      if (slot !== activeSlot && !definitions[index] && !occupied.has(slot)) return slot;
    }
  }
  return null;
}
