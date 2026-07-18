export const LOOP_STEPS = 64;
export const SWING_OFFSET_STEPS = 0.55;

export function normalizeLoopPosition(position, loopSteps = LOOP_STEPS) {
  return ((position % loopSteps) + loopSteps) % loopSteps;
}

export function loopPositionAtTime(audioTime, loopStartTime, secondsPerStep, loopSteps = LOOP_STEPS) {
  return normalizeLoopPosition((audioTime - loopStartTime) / secondsPerStep, loopSteps);
}

export function quantizeLoopPosition(position, mode, loopSteps = LOOP_STEPS) {
  const normalized = normalizeLoopPosition(position, loopSteps);

  if (mode === 'Off') {
    const step = Math.floor(normalized);
    return { step, offset: normalized - step };
  }

  if (mode === '1/8 swing') {
    let nearestStep = 0;
    let nearestDistance = Infinity;
    for (let step = 0; step < loopSteps; step += 2) {
      const audiblePosition = normalizeLoopPosition(step + (step % 4 === 2 ? SWING_OFFSET_STEPS : 0), loopSteps);
      const directDistance = Math.abs(normalized - audiblePosition);
      const circularDistance = Math.min(directDistance, loopSteps - directDistance);
      if (circularDistance < nearestDistance) {
        nearestDistance = circularDistance;
        nearestStep = step;
      }
    }
    return { step: nearestStep, offset: 0 };
  }

  const quantum = mode === '1/8' ? 2 : 1;
  return { step: normalizeLoopPosition(Math.round(normalized / quantum) * quantum, loopSteps), offset: 0 };
}
