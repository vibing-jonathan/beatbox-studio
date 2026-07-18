import { normalizeLoopPosition, quantizeLoopPosition } from './timing.js';

export const LOOP_BAR_OPTIONS = [1, 2, 4, 8];
export const STEPS_PER_BAR = 16;
export const MAX_LOOP_STEPS = 8 * STEPS_PER_BAR;

export function loopStepsForBars(bars) {
  const safeBars = LOOP_BAR_OPTIONS.includes(Number(bars)) ? Number(bars) : 4;
  return safeBars * STEPS_PER_BAR;
}

export function trackIdForType(type) {
  if (['kick', 'kick-soft'].includes(type)) return 'kicks';
  if (['snare', 'clap', 'rim'].includes(type)) return 'snares';
  if (['bass', 'hum'].includes(type)) return 'bass';
  return 'hats';
}

export function normalizeSequencerEvent(event, fallbackId = 'hit') {
  const rawStep = Number(event?.step);
  if (!Number.isInteger(rawStep) || rawStep < 0 || rawStep >= MAX_LOOP_STEPS) return null;
  const type = typeof event.type === 'string' && event.type ? event.type : 'click';
  return {
    id: typeof event.id === 'string' && event.id ? event.id : fallbackId,
    trackId: typeof event.trackId === 'string' && event.trackId ? event.trackId : trackIdForType(type),
    type,
    name: typeof event.name === 'string' && event.name ? event.name : type,
    step: rawStep,
    offset: Math.min(0.999999, Math.max(0, Number(event.offset) || 0)),
    velocity: Math.min(1, Math.max(0.1, Number(event.velocity) || 0.8)),
    origin: event.origin === 'overdub' ? 'overdub' : 'preset',
    recorded: Boolean(event.recorded),
    ...(typeof event.slot === 'string' && event.slot ? { slot: event.slot } : {}),
    ...(typeof event.quantize === 'string' && event.quantize ? { quantize: event.quantize } : {}),
  };
}

export function createDefaultEvents(tracks) {
  return tracks.flatMap((track) => track.steps.map((step, index) => normalizeSequencerEvent({
    id: `preset-${track.id}-${index}`,
    trackId: track.id,
    type: track.type,
    name: track.defaultName,
    step,
    velocity: track.gain,
    origin: 'preset',
  })));
}

export function createInitialPatterns(stored, tracks) {
  if (Array.isArray(stored.patterns) && stored.patterns.length) {
    const patterns = stored.patterns.map((pattern, patternIndex) => ({
      id: typeof pattern.id === 'string' && pattern.id ? pattern.id : `pattern-${patternIndex + 1}`,
      name: typeof pattern.name === 'string' && pattern.name ? pattern.name : `Pattern ${patternIndex + 1}`,
      events: (Array.isArray(pattern.events) ? pattern.events : [])
        .map((event, eventIndex) => normalizeSequencerEvent(event, `hit-${patternIndex}-${eventIndex}`))
        .filter(Boolean),
    }));
    const activePatternId = patterns.some((pattern) => pattern.id === stored.activePatternId)
      ? stored.activePatternId
      : patterns[0].id;
    return { patterns, activePatternId };
  }

  const legacy = (Array.isArray(stored.customEvents) ? stored.customEvents : [])
    .map((event, index) => normalizeSequencerEvent({ ...event, id: `overdub-legacy-${index}`, origin: 'overdub' }, `overdub-legacy-${index}`))
    .filter(Boolean);
  return {
    patterns: [{ id: 'pattern-a', name: 'Pattern A', events: [...createDefaultEvents(tracks), ...legacy] }],
    activePatternId: 'pattern-a',
  };
}

export function nudgeEvent(event, amount, loopSteps) {
  const position = normalizeLoopPosition(event.step + (Number(event.offset) || 0) + amount, loopSteps);
  const step = Math.floor(position);
  return { ...event, step, offset: position - step };
}

export function quantizeEvent(event, mode, loopSteps) {
  const timing = quantizeLoopPosition(event.step + (Number(event.offset) || 0), mode, loopSteps);
  return { ...event, ...timing, quantize: mode };
}

export function duplicateEvents(events, selectedIds, loopSteps, delta = STEPS_PER_BAR) {
  const selected = new Set(selectedIds);
  return events.filter((event) => selected.has(event.id)).map((event, index) => {
    const nudged = nudgeEvent(event, delta, loopSteps);
    return { ...nudged, id: `hit-${Date.now()}-${index}`, origin: 'overdub' };
  });
}
