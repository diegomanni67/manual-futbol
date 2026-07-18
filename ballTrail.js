"use strict";

/** Partículas de spin L2/R1 en pases y tiros especiales (sin rastro de línea). */

const SPIN_PARTICLE_MAX = 18;
const SPIN_PARTICLE_SPAWN_INTERVAL = 0.038;
const SPIN_PARTICLE_DECAY = 7.5;
const IN_POSSESSION = 'in_possession';

export function clearBallTrail(b){
  if(!b) return;
  b.spinEffect = null;
  b.spinParticles = null;
  b.trailSpawnT = 0;
}

export function setBallSpinEffect(b, curve){
  clearBallTrail(b);
  if(!curve) return;
  b.spinEffect = curve > 0 ? 'R1' : 'L2';
  b.spinParticles = [];
  b.trailSpawnT = 0;
}

export function updateBallTrail(b, dt){
  if(!b?.spinEffect) return;
  if(b.state === IN_POSSESSION || b.owner){
    clearBallTrail(b);
    return;
  }

  const sp = Math.hypot(b.vx, b.vy);
  b.trailSpawnT = (b.trailSpawnT || 0) + dt;
  const parts = b.spinParticles || (b.spinParticles = []);
  if(sp > 0.35 && b.trailSpawnT >= SPIN_PARTICLE_SPAWN_INTERVAL){
    b.trailSpawnT = 0;
    const nx = b.vx / sp;
    const ny = b.vy / sp;
    const px = -ny;
    const py = nx;
    const spinSign = b.spinEffect === 'L2' ? 1 : -1;
    const spread = 0.10 + Math.random() * 0.14;
    parts.push({
      x: b.x + px * spinSign * spread,
      y: b.y + py * spinSign * spread,
      z: Math.max(0.08, (b.z || 0) * 0.7),
      life: 1,
    });
    while(parts.length > SPIN_PARTICLE_MAX) parts.shift();
  }

  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.life -= dt * SPIN_PARTICLE_DECAY;
    if(sp > 0.05){
      p.x -= b.vx * dt * 0.10;
      p.y -= b.vy * dt * 0.10;
    }
    if(p.life <= 0) parts.splice(i, 1);
  }
}

function drawSpinParticles(ctx, parts, projectFn){
  if(!parts?.length) return;
  for(const p of parts){
    const s = projectFn({ x: p.x, y: p.y, z: p.z || 0.1 });
    const r = Math.max(0.8, s.s * 0.07 * p.life);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.45 * p.life})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Feedback de rotación: solo partículas blancas breves. */
export function drawBallTrailCore(ctx, b, projectFn){
  if(!b?.spinEffect || !b.spinParticles?.length) return;
  ctx.save();
  drawSpinParticles(ctx, b.spinParticles, projectFn);
  ctx.restore();
}
