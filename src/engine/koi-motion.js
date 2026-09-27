const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const WAVE_DELAY = 3.6;

/** Update a few pose values once per fish, rather than per painted body section. */
export function updateSwimMotion(fish, dt, time, reducedMotion) {
  const activity = clamp(fish.velocity / Math.max(10, fish.speed), .15, 3.6);
  const individuality = .94 + Math.sin(fish.seed * 1.73) * .075;
  // Slow, individual recovery between strokes avoids a metronomic tail beat.
  const glide = .92 + Math.sin(time * .73 + fish.seed * 2.1) * .08;
  const goalRate = (2.05 + fish.velocity * .044) * individuality * (reducedMotion ? .62 : 1);
  const goalAmplitude = (.037 + activity * .019) * glide * (reducedMotion ? .7 : 1);
  const previousRate = fish.strokeRate ?? goalRate;
  fish.strokeRate = previousRate + (goalRate - previousRate) * (1 - Math.exp(-dt * 5));
  fish.swimAmplitude = (fish.swimAmplitude ?? goalAmplitude) +
    (goalAmplitude - (fish.swimAmplitude ?? goalAmplitude)) * (1 - Math.exp(-dt * 4));
  fish.phase += (previousRate + fish.strokeRate) * .5 * dt;
  fish.finPhase = (fish.finPhase ?? (fish.phase * .61 + fish.seed)) +
    dt * (1.35 + fish.velocity * .013) * (reducedMotion ? .6 : 1);
}

/** u runs tail → nose; increasing time sends a wave in the opposite direction. */
export function koiBodyPoint(fish, u) {
  const tailward = 1 - u, amplitude = fish.swimAmplitude ?? .056;
  const turn = fish.turn || 0;
  const wave = Math.sin(fish.phase - tailward * WAVE_DELAY);
  return {
    x: (u * .78 - .37) * fish.length,
    y: fish.length * tailward * tailward *
      (wave * amplitude + turn * .028 * (.45 + tailward * .55)),
    width: Math.sin(u * Math.PI) ** .8 * fish.length * fish.width * (.64 + u * .52) + .3,
  };
}

/** The tail fin leaves the flexible tail stalk tangentially, without a hinged kink. */
export function koiTailAngle(fish) {
  const phase = fish.phase - WAVE_DELAY, amplitude = fish.swimAmplitude ?? .056;
  const slope = amplitude * (Math.cos(phase) * WAVE_DELAY - Math.sin(phase) * 2) -
    (fish.turn || 0) * .028 * 2.55;
  return Math.atan2(slope, .78);
}

export function koiPectoralPose(fish, side) {
  const phase = fish.finPhase ?? (fish.phase * .61 + fish.seed);
  const steering = clamp((fish.turn || 0) * side, -.9, .9);
  const stroke = Math.sin(phase + side * .55);
  return {
    spread: 1 + stroke * .14 + steering * .21,
    sweep: Math.cos(phase + side * .55) * .012 - steering * .025,
  };
}
