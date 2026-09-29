const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const WAVE_DELAY = 3.8;
const SEGMENTS = 32;
const spines = new WeakMap();

/** Smooth effort and steering once per fish; phase never resets during a speed change. */
export function updateSwimMotion(fish, dt, time, reducedMotion) {
  const activity = clamp(fish.velocity / Math.max(10, fish.speed), .15, 3.6);
  const individuality = .94 + Math.sin(fish.seed * 1.73) * .075;
  const glide = .82 + Math.sin(time * .73 + fish.seed * 2.1) * .18;
  const stride = fish.velocity / Math.max(35, fish.length);
  const goalRate = (2.7 + stride * 5) * individuality * (reducedMotion ? .62 : 1);
  const goalAmplitude = clamp((.052 + activity * .029) * glide, .025, .115) * (reducedMotion ? .7 : 1);
  const previousRate = fish.strokeRate ?? goalRate;
  fish.strokeRate = previousRate + (goalRate - previousRate) * (1 - Math.exp(-dt * 5));
  fish.swimAmplitude = (fish.swimAmplitude ?? goalAmplitude) +
    (goalAmplitude - (fish.swimAmplitude ?? goalAmplitude)) * (1 - Math.exp(-dt * 3.4));
  fish.phase += (previousRate + fish.strokeRate) * .5 * dt;
  fish.finPhase = (fish.finPhase ?? (fish.phase * .61 + fish.seed)) +
    dt * (1.35 + fish.velocity * .013) * (reducedMotion ? .6 : 1);
  // Curvature depends on distance travelled, not only on the rotation speed.
  // The rear body trails a turn, then gently straightens as steering releases.
  const bend = clamp((fish.turn || 0) * fish.length * .4 / Math.max(14, fish.velocity, fish.speed * .6), -.9, .9);
  fish.bodyBend = (fish.bodyBend ?? 0) + (bend - (fish.bodyBend ?? 0)) * (1 - Math.exp(-dt * 3.8));
}

function spine(fish) {
  const phase = fish.phase, amplitude = fish.swimAmplitude ?? .072;
  const bend = fish.bodyBend ?? clamp((fish.turn || 0) * .4, -.9, .9);
  let pose = spines.get(fish);
  if (!pose) {
    pose = {x:new Float64Array(SEGMENTS+1),y:new Float64Array(SEGMENTS+1),c:new Float64Array(SEGMENTS+1),s:new Float64Array(SEGMENTS+1)};
    spines.set(fish, pose);
  }
  if (pose.phase === phase && pose.amplitude === amplitude && pose.bend === bend && pose.length === fish.length) return pose;
  Object.assign(pose, {phase,amplitude,bend,length:fish.length});
  const tangent = u => {
    const v=1-u, wave=phase-v*WAVE_DELAY;
    const slope=amplitude*(v*v*Math.cos(wave)*WAVE_DELAY-2*v*Math.sin(wave));
    return Math.atan2(slope,.78)-bend*v*v;
  };
  const ds=fish.length*.78/SEGMENTS;
  pose.x[SEGMENTS]=fish.length*.41;pose.y[SEGMENTS]=0;
  for(let i=SEGMENTS;i>=0;i--){
    const a=tangent(i/SEGMENTS);pose.c[i]=Math.cos(a);pose.s[i]=Math.sin(a);
    if(i<SEGMENTS){
      const mid=tangent((i+.5)/SEGMENTS);
      pose.x[i]=pose.x[i+1]-Math.cos(mid)*ds;
      pose.y[i]=pose.y[i+1]-Math.sin(mid)*ds;
    }
  }
  return pose;
}

/** Arc-length spine with a continuous tangent; u runs tail stalk → nose. */
export function koiBodyPoint(fish, u) {
  u=clamp(u,0,1);
  const pose=spine(fish), index=Math.min(SEGMENTS-1,Math.floor(u*SEGMENTS)), t=u*SEGMENTS-index;
  const next=index+1, ds=fish.length*.78/SEGMENTS, t2=t*t, t3=t2*t;
  const h0=2*t3-3*t2+1,h1=t3-2*t2+t,h2=-2*t3+3*t2,h3=t3-t2;
  const d0=6*t2-6*t,d1=3*t2-4*t+1,d2=-d0,d3=3*t2-2*t;
  const x=h0*pose.x[index]+h1*ds*pose.c[index]+h2*pose.x[next]+h3*ds*pose.c[next];
  const y=h0*pose.y[index]+h1*ds*pose.s[index]+h2*pose.y[next]+h3*ds*pose.s[next];
  const dx=d0*pose.x[index]+d1*ds*pose.c[index]+d2*pose.x[next]+d3*ds*pose.c[next];
  const dy=d0*pose.y[index]+d1*ds*pose.s[index]+d2*pose.y[next]+d3*ds*pose.s[next];
  const magnitude=Math.hypot(dx,dy)||1, tx=dx/magnitude,ty=dy/magnitude;
  return {x,y,tx,ty,nx:-ty,ny:tx,angle:Math.atan2(dy,dx),
    width:Math.sin(u*Math.PI)**.8*fish.length*fish.width*(.64+u*.52)+.3};
}

export function koiTailAngle(fish) { return koiBodyPoint(fish,0).angle; }

export function koiPectoralPose(fish, side) {
  const phase = fish.finPhase ?? (fish.phase * .61 + fish.seed);
  const steering = clamp((fish.turn || 0) * side, -.9, .9);
  const stroke = Math.sin(phase + side * .55);
  return {
    spread: 1 + stroke * .14 + steering * .21,
    sweep: Math.cos(phase + side * .55) * .012 - steering * .025,
  };
}
