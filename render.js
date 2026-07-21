"use strict";

import { AIR_SPAM_METER_MAX, BALL_RADIUS, Ball, CAM, CCIRCLE_R, CENTER, CORNER_ARC_R, CROSSBAR_Z, DEBUG_BOUNDARIES, FIELD_L, FIELD_W, GOAL_DEPTH, GOAL_HALF, GOAL_NET_COLS, GOAL_NET_DEPTH_SHRINK, GOAL_NET_ROWS, GOAL_ZONE_DEPTH, Game, KickoffManager, PBOX_D, PBOX_HALFW, PCAM, PENALTY_ARC_R, PENALTY_SPOT_DIST, SBOX_D, SBOX_HALFW, SET_PIECE, SET_PIECE_COUNTDOWN_URGENT, STADIUM_FLOOR_PAD, SetPieceManager, STATE_KICKOFF, TOUCH_KICK_REACH, allPlayers, angDiff, awayTeam, ball, canvas, clamp, controlledPlayer, controlledPlayer2, ctx, depthOf, dist2D, drawPlayerMeshDir8Prototype, facingFlip, fieldGrassEl, gameState, getLateralSignFromFacing, homeTeam, isAirSpamWindowActive, isFacingAwayFromCamera, isFrontal2DSceneActive, isFkPlacementVisualActive, isGkHandsPossession, isGoalKickReadyState, isPressureCursorPlayer, isTimeFinishFlashActive, BASE_FIELD_L, FCAM } from './state.js';
import { AI_RUPTURA, AI_RUPTURA_MANUAL } from './gameplay_constants.js';
import { GK_AUTO_DISTRIBUTE } from './gameplay_constants.js';
import { getModeTackleDistance } from './modePhysics.js';
import { toGameUnits } from './utils.js';

import { isCelebrationMode, isHumanTeam, isSetPieceAwaitingExecution, lastDt, lerp, movePlayer, paintDepth, physicsConfig, practiceGK, practicePlayer, project, projectPractice, setupPractice, touchKickCurve, updatePlayerMeshDir8, getAnimVisualSpeed } from './state.js';

import { BoundaryWalls, GOAL_FRAMES, OutZone, fieldBoundary, stadiumBounds } from './physics.js';

import { chargeLevel, getBufferKickType } from './input.js';

import { drawEntityShadow, litMaterial, flatMaterial, drawStadiumAtmosphere, drawSkyBackground, drawStadiumLights, drawHorizonHaze, drawFieldDepthHaze, fillWithOutline, strokeBone, teamOutlineColor, outlineWidth, CARTOON, BROADCAST } from './fx.js';
import { getBodyScale, resolveAppearancePalette, ensurePlayerAppearance, getPlayerShirtNumber } from './playerAppearance.js';

function getPracticeRenderPlayers(){ return allPlayers; }
function isPracticeOpenPlay(){ return gameState === 'practice'; }


/* ============================================================
   RENDER â€” CANCHA
   ============================================================ */
function pathFromWorldPts(pts, close){
  ctx.beginPath();
  pts.forEach((wp,i)=>{
    const s = project({x:wp.x,y:wp.y,z:0});
    if(i===0) ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y);
  });
  if(close) ctx.closePath();
}
function strokeWorldPts(pts, close, color, width){
  ctx.strokeStyle=color; ctx.lineWidth=width;
  pathFromWorldPts(pts, close); ctx.stroke();
}
function circleWorldPts(cx,cy,r,segments){
  const pts=[];
  for(let i=0;i<=segments;i++){
    const a = (i/segments)*Math.PI*2;
    pts.push({x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r});
  }
  return pts;
}

function arcWorldPts(cx, cy, r, a0, a1, segments){
  const pts = [];
  const n = Math.max(4, segments|0);
  for(let i = 0; i <= n; i++){
    const a = a0 + (a1 - a0) * (i / n);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Medialuna reglamentaria delante del área grande (radio desde el punto penal). */
function drawPenaltyArc(goalX){
  const LW = 2.7, col = BROADCAST.lineWhite;
  const dir = goalX === 0 ? 1 : -1;
  const spotX = goalX + dir * PENALTY_SPOT_DIST;
  const boxFront = goalX + dir * PBOX_D;
  const dx = Math.abs(boxFront - spotX);
  const halfAng = Math.acos(clamp(dx / Math.max(PENALTY_ARC_R, 0.01), 0, 1));
  const a0 = dir > 0 ? -halfAng : Math.PI - halfAng;
  const a1 = dir > 0 ? halfAng : Math.PI + halfAng;
  strokeWorldPts(arcWorldPts(spotX, CENTER.y, PENALTY_ARC_R, a0, a1, 28), false, col, LW);
}

/** Cuadrante de córner (radio 1 m) en las 4 esquinas. */
function drawCornerArcs(){
  const LW = 2.5, col = BROADCAST.lineWhite;
  const r = CORNER_ARC_R;
  const corners = [
    { x: 0, y: 0, a0: 0, a1: Math.PI * 0.5 },
    { x: FIELD_L, y: 0, a0: Math.PI * 0.5, a1: Math.PI },
    { x: FIELD_L, y: FIELD_W, a0: Math.PI, a1: Math.PI * 1.5 },
    { x: 0, y: FIELD_W, a0: Math.PI * 1.5, a1: Math.PI * 2 },
  ];
  for(const c of corners){
    strokeWorldPts(arcWorldPts(c.x, c.y, r, c.a0, c.a1, 12), false, col, LW);
  }
}

/** Banderín en el vértice de cada esquina (poste + trapecio). */
function drawCornerFlags(){
  const corners = [
    { x: 0, y: 0 },
    { x: FIELD_L, y: 0 },
    { x: FIELD_L, y: FIELD_W },
    { x: 0, y: FIELD_W },
  ];
  for(const c of corners){
    const base = project({ x: c.x, y: c.y, z: 0 });
    const top = project({ x: c.x, y: c.y, z: 1.55 });
    const mid = project({ x: c.x, y: c.y, z: 1.15 });
    const poleH = Math.hypot(top.x - base.x, top.y - base.y) || 12;
    const flagW = Math.max(6, poleH * 0.55);
    const flagH = Math.max(5, poleH * 0.42);
    const inwardX = c.x <= 0 ? 1 : -1;
    const inwardY = c.y <= 0 ? 1 : -1;
    const fx = (inwardX - inwardY * 0.15) * flagW;
    const fy = (inwardY * 0.35 + Math.abs(inwardX) * 0.2) * flagH;

    ctx.save();
    ctx.strokeStyle = 'rgba(245,245,245,0.95)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    ctx.fillStyle = '#e22b2b';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + fx, mid.y + fy * 0.35);
    ctx.lineTo(top.x + fx * 0.15, top.y + flagH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
}

function drawStadiumFloor(){
  const pad = STADIUM_FLOOR_PAD;
  const sb = stadiumBounds;
  const x0 = sb.xMin - pad, x1 = sb.xMax + pad;
  const y0 = sb.yMin - pad, y1 = sb.yMax + pad;
  ctx.fillStyle = BROADCAST.grassShadow;
  pathFromWorldPts([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], true);
  ctx.fill();
}

function drawGrassBands(xMin, xMax, yMin, yMax, bands){
  for(let i=0;i<bands;i++){
    const x0 = xMin + (xMax - xMin) * (i / bands);
    const x1 = xMin + (xMax - xMin) * ((i + 1) / bands);
    ctx.fillStyle = i % 2 === 0 ? BROADCAST.grassPrimary : BROADCAST.grassSecondary;
    pathFromWorldPts([
      {x:x0,y:yMin},{x:x1,y:yMin},{x:x1,y:yMax},{x:x0,y:yMax}
    ], true);
    ctx.fill();
  }
}

function drawOutZoneShade(){
  const pad = STADIUM_FLOOR_PAD;
  const sb = stadiumBounds;
  const x0 = sb.xMin - pad, x1 = sb.xMax + pad;
  const y0 = sb.yMin - pad, y1 = sb.yMax + pad;
  ctx.fillStyle = 'rgba(31, 163, 95, 0.18)';
  pathFromWorldPts([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], true);
  ctx.fill();
}

function drawField(){
  drawStadiumFloor();
  const sb = stadiumBounds;
  const grassBands = Math.max(12, Math.round(12 * (FIELD_L / BASE_FIELD_L)));
  // cesped con franjas (zona de juego + OutZone inmediata)
  drawGrassBands(sb.xMin, sb.xMax, sb.yMin, sb.yMax, grassBands);
  // look broadcast — lineas blancas nítidas
  const LW = 2.7, col = BROADCAST.lineWhite;
  ctx.globalAlpha = 1.0;
  strokeWorldPts([{x:0,y:0},{x:FIELD_L,y:0},{x:FIELD_L,y:FIELD_W},{x:0,y:FIELD_W}], true, col, LW);
  strokeWorldPts([{x:CENTER.x,y:0},{x:CENTER.x,y:FIELD_W}], false, col, LW);
  strokeWorldPts(circleWorldPts(CENTER.x,CENTER.y,CCIRCLE_R,40), true, col, LW);
  ctx.fillStyle=col;
  const cs=project({x:CENTER.x,y:CENTER.y,z:0}); ctx.beginPath(); ctx.arc(cs.x,cs.y,3,0,7); ctx.fill();

  // areas + medialunas + arcos de córner
  [0, FIELD_L].forEach(goalX=> drawGoalArea(goalX));
  [0, FIELD_L].forEach(goalX=> drawPenaltyArc(goalX));
  drawCornerArcs();
  ctx.globalAlpha = 1;

  // arcos (postes) — proporciones reales, tal como en arco_ok.html
  [0, FIELD_L].forEach(goalX=> drawGoal(goalX));
  drawCornerFlags();

  if(DEBUG_BOUNDARIES) drawDebugBoundaries();
}

function drawDebugBoundaries(){
  if(!DEBUG_BOUNDARIES) return;
  const fb = fieldBoundary;
  const oz = OutZone;
  ctx.save();
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = 'rgba(255, 180, 0, 0.12)';
  const outStrips = [
    [{x:oz.xMin,y:oz.yMin},{x:oz.xMax,y:oz.yMin},{x:oz.xMax,y:fb.yMin},{x:oz.xMin,y:fb.yMin}],
    [{x:oz.xMin,y:fb.yMax},{x:oz.xMax,y:fb.yMax},{x:oz.xMax,y:oz.yMax},{x:oz.xMin,y:oz.yMax}],
    [{x:oz.xMin,y:fb.yMin},{x:fb.xMin,y:fb.yMin},{x:fb.xMin,y:fb.yMax},{x:oz.xMin,y:fb.yMax}],
    [{x:fb.xMax,y:fb.yMin},{x:oz.xMax,y:fb.yMin},{x:oz.xMax,y:fb.yMax},{x:fb.xMax,y:fb.yMax}],
  ];
  for(const strip of outStrips){ pathFromWorldPts(strip, true); ctx.fill(); }

  ctx.strokeStyle = '#ff2222';
  ctx.lineWidth = 3;
  strokeWorldPts([
    {x: fb.xMin, y: fb.yMin}, {x: fb.xMax, y: fb.yMin},
    {x: fb.xMax, y: fb.yMax}, {x: fb.xMin, y: fb.yMax},
  ], true, '#ff2222', 3);

  ctx.strokeStyle = '#ff8800';
  ctx.lineWidth = 2.5;
  strokeWorldPts([
    {x: oz.xMin, y: oz.yMin}, {x: oz.xMax, y: oz.yMin},
    {x: oz.xMax, y: oz.yMax}, {x: oz.xMin, y: oz.yMax},
  ], true, '#ff8800', 2.5);

  for(const wall of BoundaryWalls){
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 4;
    if(wall.axis === 'y'){
      strokeWorldPts([{x: oz.xMin, y: wall.pos}, {x: oz.xMax, y: wall.pos}], false, '#00ccff', 4);
    } else {
      strokeWorldPts([{x: wall.pos, y: oz.yMin}, {x: wall.pos, y: oz.yMax}], false, '#00ccff', 4);
    }
  }

  for(const frame of GOAL_FRAMES){
    const gz = frame.GoalZone;
    const depth = gz.depth || GOAL_ZONE_DEPTH;
    const xFront = gz.planeX;
    const xBack = gz.inward < 0 ? gz.planeX - depth : gz.planeX + depth;
    ctx.lineWidth = 3;
    strokeWorldPts([
      {x: xFront, y: gz.yNear}, {x: xBack, y: gz.yNear},
      {x: xBack, y: gz.yFar}, {x: xFront, y: gz.yFar},
    ], true, '#00ff88', 3);
    ctx.lineWidth = 2;
    strokeWorldPts([
      {x: xFront, y: gz.yNear}, {x: xBack, y: gz.yNear},
      {x: xBack, y: gz.yFar}, {x: xFront, y: gz.yFar},
      {x: frame.backX, y: gz.yFar}, {x: frame.backX, y: gz.yNear},
    ], false, '#ff5555', 2);
    ctx.lineWidth = 2.5;
    strokeWorldPts([{x: frame.backX, y: gz.yNear}, {x: frame.backX, y: gz.yFar}], false, '#ff8888', 2.5);
    for(const solid of frame.structureSolids){
      if(solid.type === 'post'){
        const s0 = project({x: frame.goalLineX, y: solid.pos, z: 0});
        const s1 = project({x: frame.goalLineX, y: solid.pos, z: CROSSBAR_Z});
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.stroke();
      }
      if(solid.type === 'crossbar'){
        const a = project({x: frame.goalLineX, y: solid.yMin, z: solid.z});
        const b = project({x: frame.goalLineX, y: solid.yMax, z: solid.z});
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// area penal + area chica + punto de penal de UN arco (extraido de drawField para poder
// reutilizarlo tal cual desde la Arena de Practica, que solo necesita dibujar el arco objetivo)
function drawGoalArea(goalX){
  const LW = 2.8, col = BROADCAST.lineWhite;
  const dir = goalX===0?1:-1;
  strokeWorldPts([
    {x:goalX,y:CENTER.y-PBOX_HALFW},{x:goalX+dir*PBOX_D,y:CENTER.y-PBOX_HALFW},
    {x:goalX+dir*PBOX_D,y:CENTER.y+PBOX_HALFW},{x:goalX,y:CENTER.y+PBOX_HALFW}
  ], false, col, LW);
  strokeWorldPts([
    {x:goalX,y:CENTER.y-SBOX_HALFW},{x:goalX+dir*SBOX_D,y:CENTER.y-SBOX_HALFW},
    {x:goalX+dir*SBOX_D,y:CENTER.y+SBOX_HALFW},{x:goalX,y:CENTER.y+SBOX_HALFW}
  ], false, col, LW);
  ctx.fillStyle = col;
  const spot=project({x:goalX+dir*PENALTY_SPOT_DIST,y:CENTER.y,z:0});
  ctx.beginPath(); ctx.arc(spot.x,spot.y,2.6,0,7); ctx.fill();
}

// arco (postes + red) de UN lado â€” proporciones reales, tal como en arco_ok.html: sin escalado
// artificial ni flare en la base, postes rectos de punta a punta. La logica de gol evalua estos
// mismos GOAL_HALF/CROSSBAR_Z reales en checkGoalsAndBounds. Extraido de drawField para poder
// reutilizarlo desde la Arena de Practica (que solo dibuja el arco objetivo, el del fondo).
function drawGoal(goalX){
    const halfTop  = GOAL_HALF;   // ancho a la altura del travesano = ancho real del arco
    const halfBase = GOAL_HALF;   // sin flare: la base tiene el mismo ancho que el travesano
    const barZ     = CROSSBAR_Z;  // alto real del travesano

    const p1 = project({x:goalX, y:CENTER.y-halfBase, z:0});
    const p2 = project({x:goalX, y:CENTER.y-halfTop,  z:barZ});
    const p3 = project({x:goalX, y:CENTER.y+halfTop,  z:barZ});
    const p4 = project({x:goalX, y:CENTER.y+halfBase, z:0});

    // red: ya no es un panel plano pegado al fondo â€” es una "bolsa" 3D real armada con dos paredes
    // laterales (del poste delantero, inclinado, hasta el poste trasero, vertical, en el piso) mas
    // un fondo, todas proyectadas punto a punto con la misma project() de toda la cancha. Asi:
    //  - las horizontales de las paredes laterales van de frente a fondo y CONVERGEN en perspectiva
    //    real, con la misma fuga que las lineas del area (requisito 1)
    //  - las verticales no son rectas: se dibujan con una leve "panza" hacia atras (quadraticCurveTo)
    //    simulando la tension floja de una red real (requisito 2)
    const dirZ = goalX===0 ? -1 : 1;
    const netHalf = halfTop * GOAL_NET_DEPTH_SHRINK;
    const netBarZ = barZ * GOAL_NET_DEPTH_SHRINK;
    const NET_SIDE_BULGE = GOAL_DEPTH*0.16; // panza sutil de las paredes laterales (hacia atras)
    const NET_BACK_SAG   = GOAL_DEPTH*0.22; // panza sutil del fondo, mas floja a media altura

    // aristas verticales (en 3D, sin proyectar) que arman la "caja" de la red
    const frontEdge = (side,h)=>({x:goalX, y:CENTER.y+side*lerp(halfBase,halfTop,h), z:lerp(0,barZ,h)});
    const backEdge  = (side,h)=>({x:goalX+dirZ*GOAL_DEPTH, y:CENTER.y+side*netHalf, z:lerp(0,netBarZ,h)});

    // pared lateral (side=-1 izq, +1 der): interpola frente->fondo con una panza hacia atras que
    // crece a mitad de profundidad y de altura
    function sideWallPoint(side, td, h){
      const front = frontEdge(side,h), back = backEdge(side,h);
      const bulge = Math.sin(td*Math.PI) * Math.sin(h*Math.PI) * NET_SIDE_BULGE;
      return {x:lerp(front.x,back.x,td)+dirZ*bulge, y:lerp(front.y,back.y,td), z:lerp(front.z,back.z,td)};
    }
    // fondo de la red: mismo x nominal que el fondo, pero con una panza hacia atras a media altura
    function backWallPoint(tx, h){
      const sag = Math.sin(h*Math.PI) * NET_BACK_SAG;
      return {x:goalX+dirZ*(GOAL_DEPTH+sag), y:CENTER.y+lerp(-netHalf,netHalf,tx), z:lerp(0,netBarZ,h)};
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;

    // --- paredes laterales ---
    [-1,1].forEach(side=>{
      const SIDE_SEG = 4, SIDE_COLS = 4;
      for(let i=0;i<=GOAL_NET_ROWS;i++){ // horizontales: frente->fondo, convergen en perspectiva real
        const h=i/GOAL_NET_ROWS;
        ctx.beginPath();
        for(let j=0;j<=SIDE_SEG;j++){
          const w=project(sideWallPoint(side,j/SIDE_SEG,h));
          if(j===0) ctx.moveTo(w.x,w.y); else ctx.lineTo(w.x,w.y);
        }
        ctx.stroke();
      }
      for(let j=0;j<=SIDE_COLS;j++){ // verticales: arriba->abajo, curvas (panza hacia atras)
        const td=j/SIDE_COLS;
        const top=project(sideWallPoint(side,td,1)), mid=project(sideWallPoint(side,td,0.5)), bot=project(sideWallPoint(side,td,0));
        ctx.beginPath(); ctx.moveTo(top.x,top.y); ctx.quadraticCurveTo(mid.x,mid.y,bot.x,bot.y); ctx.stroke();
      }
    });

    // --- fondo de la red ---
    for(let i=0;i<=GOAL_NET_ROWS;i++){ // horizontales, paralelas al travesano
      const h=i/GOAL_NET_ROWS;
      ctx.beginPath();
      for(let j=0;j<=GOAL_NET_COLS;j++){
        const w=project(backWallPoint(j/GOAL_NET_COLS,h));
        if(j===0) ctx.moveTo(w.x,w.y); else ctx.lineTo(w.x,w.y);
      }
      ctx.stroke();
    }
    for(let j=0;j<=GOAL_NET_COLS;j++){ // verticales, curvas
      const tx=j/GOAL_NET_COLS;
      const top=project(backWallPoint(tx,1)), mid=project(backWallPoint(tx,0.5)), bot=project(backWallPoint(tx,0));
      ctx.beginPath(); ctx.moveTo(top.x,top.y); ctx.quadraticCurveTo(mid.x,mid.y,bot.x,bot.y); ctx.stroke();
    }

    // --- caÃ±os de sosten: delanteros (travesano+postes) y traseros (verticales en el piso) mas los
    // dos caÃ±os diagonales de techo â€” se dibujan DESPUES de toda la grilla de red de arriba, para
    // que la red quede siempre detras de la estructura del arco (requisito 3) ---
    const back1=project(backEdge(-1,0)), back2=project(backEdge(-1,1));
    const back3=project(backEdge(1,1)),  back4=project(backEdge(1,0));
    ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p2.x,p2.y); ctx.lineTo(back2.x,back2.y); ctx.stroke(); // caÃ±o de techo izq
    ctx.beginPath(); ctx.moveTo(p3.x,p3.y); ctx.lineTo(back3.x,back3.y); ctx.stroke(); // caÃ±o de techo der
    ctx.beginPath(); ctx.moveTo(back1.x,back1.y); ctx.lineTo(back2.x,back2.y); ctx.stroke(); // poste trasero izq
    ctx.beginPath(); ctx.moveTo(back4.x,back4.y); ctx.lineTo(back3.x,back3.y); ctx.stroke(); // poste trasero der
    // postes y travesano delanteros (por delante de todo)
    ctx.strokeStyle='#f5f5f5'; ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.stroke();
}

/* ============================================================
   CANCHA â€” ARENA DE PRACTICA: perspectiva longitudinal (regla 1). Solo se dibuja el arco del
   fondo (el objetivo), el tramo de cancha entre la camara y ese arco, y su area â€” las lineas
   laterales convergen naturalmente hacia el horizonte porque usan la misma project() de arriba,
   ahora con el eje de profundidad en X (ver projectPractice). El otro arco (detras de la camara)
   y el circulo central no se dibujan: quedan fuera de cuadro, como en una arena de entrenamiento.
   ============================================================ */
function drawFieldPractice(){
  drawStadiumFloor();
  const nearX = Math.max(stadiumBounds.xMin, PCAM.x - 3);
  const farX = FIELD_L + 3;

  drawGrassBands(nearX, farX, stadiumBounds.yMin, stadiumBounds.yMax, 10);

  const LW = 2.7, col = BROADCAST.lineWhite;
  ctx.globalAlpha = 1.0;
  strokeWorldPts([{x:nearX,y:0},{x:FIELD_L,y:0}], false, col, LW);
  strokeWorldPts([{x:nearX,y:FIELD_W},{x:FIELD_L,y:FIELD_W}], false, col, LW);
  strokeWorldPts([{x:FIELD_L,y:0},{x:FIELD_L,y:FIELD_W}], false, col, LW);
  drawGoalArea(FIELD_L);
  drawPenaltyArc(FIELD_L);
  drawCornerArcs();
  ctx.globalAlpha = 1;

  drawGoal(FIELD_L);
  drawCornerFlags();
}

/**
 * Escena 2D frontal dedicada (penales / tiros libres):
 * arco de frente, césped, área, y red. Jugadores/balón usan projectFrontal2D.
 */
function drawFieldFrontal2D(){
  const w = canvas.width;
  const h = canvas.height;
  const sc = Game.setPieceScene;
  const goalX = sc?.goalX ?? FCAM.goalX ?? FIELD_L;

  // Césped a pantalla completa (plano frontal)
  const grassTop = h * 0.22;
  const g = ctx.createLinearGradient(0, grassTop, 0, h);
  g.addColorStop(0, '#3d8f45');
  g.addColorStop(0.45, '#347a3c');
  g.addColorStop(1, '#2a6331');
  ctx.fillStyle = g;
  ctx.fillRect(0, grassTop, w, h - grassTop);

  // Bandas de césped
  ctx.save();
  ctx.globalAlpha = 0.12;
  for(let i = 0; i < 10; i++){
    const y0 = grassTop + (h - grassTop) * (i / 10);
    const y1 = grassTop + (h - grassTop) * ((i + 1) / 10);
    if(i % 2 === 0){
      ctx.fillStyle = '#1e4a24';
      ctx.fillRect(0, y0, w, y1 - y0);
    }
  }
  ctx.restore();

  // Cielo ya dibujado arriba; línea de horizonte suave
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, grassTop - 2, w, 4);

  // Área / líneas proyectadas con project() (ya en modo frontal)
  const boxDepth = Math.min(PBOX_D, 16.5);
  const dir = sc?.dir ?? FCAM.dir ?? 1;
  const boxFrontX = goalX - dir * boxDepth;
  strokeWorldPts([
    { x: goalX, y: CENTER.y - PBOX_HALFW },
    { x: boxFrontX, y: CENTER.y - PBOX_HALFW },
    { x: boxFrontX, y: CENTER.y + PBOX_HALFW },
    { x: goalX, y: CENTER.y + PBOX_HALFW },
  ], false, 'rgba(255,255,255,0.55)', 2.2);

  const sixDepth = Math.min(SBOX_D, 5.5);
  const sixFrontX = goalX - dir * sixDepth;
  strokeWorldPts([
    { x: goalX, y: CENTER.y - SBOX_HALFW },
    { x: sixFrontX, y: CENTER.y - SBOX_HALFW },
    { x: sixFrontX, y: CENTER.y + SBOX_HALFW },
    { x: goalX, y: CENTER.y + SBOX_HALFW },
  ], false, 'rgba(255,255,255,0.45)', 1.8);

  // Punto de penal
  const penX = goalX - dir * 11;
  const pen = project({ x: penX, y: CENTER.y, z: 0 });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(pen.x, pen.y, Math.max(3, pen.s * 0.12), 0, Math.PI * 2);
  ctx.fill();

  drawGoal(goalX);

  // Hint de modo
  if(sc?.phase === 'wall_edit'){
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Editar barrera (${sc.wallSize || 0}) · L1 cambiar · stick mover · ○ retirar · ▢ confirmar`,
      w / 2, 28,
    );
    ctx.restore();
  } else if(sc?.phase === 'aim'){
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    let label = 'Vista 2D · Stick = sector del arco · Potencia = fuerza';
    if(sc.mode === 'free_kick'){
      label = sc.hasWall
        ? `Vista 2D · Barrera ${sc.wallSize || 5} · Stick = sector · Potencia = fuerza`
        : 'Vista 2D · Sin barrera (>35 m) · Stick = sector · Potencia = fuerza';
    }
    ctx.fillText(label, w / 2, 28);
    if(sc.userIsGk || (sc.aiShooter && sc._cpuTakesKick)){
      ctx.fillStyle = 'rgba(180,220,255,0.9)';
      const aimHint = sc.gkManualAim
        ? `Estirada: ${sc.gkManualAim.id.replace('_', ' ')}`
        : 'Plantado (sin stick)';
      ctx.fillText(`IA pateando… ${aimHint}`, w / 2, 46);
    }
    ctx.restore();
  }
}

/* ============================================================
   RENDER â€” JUGADOR (figura articulada, no cilindro)
   ============================================================ */
function drawKitShorts(h, shorts, team){
  const ol = teamOutlineColor(team);
  const olW = outlineWidth(h);
  ctx.beginPath();
  ctx.moveTo(-h*0.15, -h*0.55);
  ctx.lineTo(h*0.15, -h*0.55);
  ctx.lineTo(h*0.13, -h*0.38);
  ctx.lineTo(-h*0.13, -h*0.38);
  ctx.closePath();
  fillWithOutline(flatMaterial(shorts), ol, olW * 0.85);
}

function drawKitTorso(h, shirt, team){
  const ol = teamOutlineColor(team);
  const olW = outlineWidth(h);
  ctx.beginPath();
  ctx.moveTo(-h*0.17, -h*0.8);
  ctx.quadraticCurveTo(-h*0.19, -h*0.58, -h*0.14, -h*0.53);
  ctx.lineTo(h*0.14, -h*0.53);
  ctx.quadraticCurveTo(h*0.19, -h*0.58, h*0.17, -h*0.8);
  ctx.quadraticCurveTo(0, -h*0.88, -h*0.17, -h*0.8);
  ctx.closePath();
  fillWithOutline(litMaterial(shirt, h), ol, olW);
}

function teamColors(p){
  let shirt, shorts, sock;
  if(p.role === 'GK'){
    shirt = p.team === 'home' ? BROADCAST.gkHome : BROADCAST.gkAway;
    shorts = '#1a1a28';
    sock = shirt;
  } else if(p.team === 'home'){
    shirt = BROADCAST.teamHome;
    shorts = BROADCAST.teamHomeShorts;
    sock = BROADCAST.teamHome;
  } else {
    shirt = BROADCAST.teamAway;
    shorts = BROADCAST.teamAwayShorts;
    sock = BROADCAST.teamAway;
  }
  return { shirt, shorts, sock };
}

/** Paleta visual del jugador (kit + capas de apariencia). */
function playerVisuals(p){
  ensurePlayerAppearance(p);
  return resolveAppearancePalette(p, teamColors(p));
}

/** Número de espalda: capa independiente centrada en el torso. */
function drawShirtBackNumber(p, h, x, y){
  const n = getPlayerShirtNumber(p);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(0.8, h * 0.018);
  ctx.font = `bold ${Math.max(8, h * 0.17)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(n);
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  ctx.restore();
}


function drawSpamDuelMeter(p, s, h){
  if(typeof isAirSpamWindowActive === 'undefined' || !isAirSpamWindowActive) return;
  const duel = Game.airDuel;
  if(!duel || !duel.active || duel.resolved) return;
  if(!Array.isArray(duel.contestants) || !duel.contestants.includes(p.id)) return;
  const spamEntry = duel.spamCounts && duel.spamCounts[p.id];
  const count = (spamEntry && spamEntry.count) || 0;
  const fill = clamp(count / AIR_SPAM_METER_MAX, 0, 1);
  const w = 30, barH = 3;
  ctx.save();
  ctx.translate(s.x - w / 2, s.y - h - 12);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, w, barH);
  if(fill > 0){
    ctx.fillStyle = 'rgba(255,220,110,0.82)';
    ctx.fillRect(0, 0, w * fill, barH);
  }
  ctx.restore();
}

/** Jugador al que iría el control con L1 (más cercano al balón, excluyendo el actual). */
function getSwitchAssistTarget(team, currentId){
  const list = team === 'home' ? homeTeam : awayTeam;
  if(!list?.length) return null;
  let best = null;
  let bestD = Infinity;
  for(const p of list){
    if(!p || p.id === currentId) continue;
    const d = dist2D(p, ball);
    if(d < bestD){
      bestD = d;
      best = p;
    }
  }
  return best;
}

function playerScreenMetrics(p){
  const s = project({ x: p.x, y: p.y, z: 0 });
  const body = getBodyScale(p.appearance);
  const h = 2.0 * s.s * body.heightScale;
  return { s, h };
}

/**
 * Cursor encima de la cabeza.
 * kind: 'primary' (opaco) | 'assist' | 'pressure' (gris + alpha reducido).
 * P1 activo = cian; P2 activo = rojo; asistencia/presión = gris transparente.
 */
function drawPlayerHeadCursor(s, h, kind, teamOrPad, playerId = null){
  const isPrimary = kind === 'primary';
  const isP2 = teamOrPad === 'away' || teamOrPad === 'p2';
  const tfFlash = isPrimary && isTimeFinishFlashActive(playerId);
  const baseColor = tfFlash
    ? (BROADCAST.cursorTimeFinish || '#00E676')
    : (isPrimary
      ? (isP2 ? BROADCAST.cursorP2 : BROADCAST.cursorP1)
      : (BROADCAST.cursorAssist || '#9E9E9E'));
  const alpha = isPrimary ? 1 : 0.32;
  const tipY = s.y - h - Math.max(8, h * 0.08);
  const halfW = Math.max(5.5, h * (isPrimary ? 0.11 : 0.10));
  const tall = Math.max(7, h * (isPrimary ? 0.13 : 0.12));

  ctx.save();
  ctx.globalAlpha = alpha;

  // Destello verde Time Finish: halo expansivo detrás del cursor.
  if(tfFlash){
    const flash = Game.timeFinishFlash;
    const pulse = flash ? clamp(flash.t / 0.55, 0, 1) : 1;
    const glowR = Math.max(14, h * 0.22) * (1.15 + (1 - pulse) * 0.85);
    const grd = ctx.createRadialGradient(s.x, tipY - tall * 0.35, 2, s.x, tipY - tall * 0.35, glowR);
    grd.addColorStop(0, `rgba(0, 230, 118, ${0.55 * pulse})`);
    grd.addColorStop(0.55, `rgba(0, 230, 118, ${0.22 * pulse})`);
    grd.addColorStop(1, 'rgba(0, 230, 118, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(s.x, tipY - tall * 0.35, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Triángulo invertido apuntando a la cabeza
  ctx.beginPath();
  ctx.moveTo(s.x, tipY + tall * 0.15);
  ctx.lineTo(s.x - halfW, tipY - tall);
  ctx.lineTo(s.x + halfW, tipY - tall);
  ctx.closePath();
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.strokeStyle = tfFlash ? 'rgba(0,80,40,0.65)' : (isPrimary ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.28)');
  ctx.lineWidth = isPrimary ? (tfFlash ? 2.1 : 1.6) : 1.15;
  ctx.stroke();

  // Disco sólido bajo el triángulo (ancla visual sobre la cabeza)
  const discR = Math.max(2.4, h * (isPrimary ? 0.045 : 0.038));
  ctx.beginPath();
  ctx.arc(s.x, tipY + tall * 0.28 + discR * 0.2, discR, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Destello verde alrededor del balón al acertar Time Finish. */
function drawTimeFinishBallFlash(){
  const flash = Game.timeFinishFlash;
  if(!flash || flash.t <= 0) return;
  const s = project({ x: ball.x, y: ball.y, z: ball.z });
  const pulse = clamp(flash.t / 0.55, 0, 1);
  const r = Math.max(10, s.s * 0.55) * (1.2 + (1 - pulse) * 1.1);
  ctx.save();
  const grd = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, r);
  grd.addColorStop(0, `rgba(0, 230, 118, ${0.45 * pulse})`);
  grd.addColorStop(0.5, `rgba(0, 230, 118, ${0.18 * pulse})`);
  grd.addColorStop(1, 'rgba(0, 230, 118, 0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Capa superior: cursores de selección / asistencia / presión (siempre por encima del sprite). */
function drawPlayerSelectionCursors(players){
  if(!players?.length) return;

  const softIds = new Set();

  const paint = (p, kind, pad) => {
    if(!p) return;
    const { s, h } = playerScreenMetrics(p);
    drawPlayerHeadCursor(s, h, kind, pad, p.id);
  };

  // 1) Asistencia L1 (semi-transparente)
  const cp = controlledPlayer();
  if(cp){
    const assist = getSwitchAssistTarget('home', cp.id);
    if(assist){
      softIds.add(assist.id);
      paint(assist, 'assist', 'home');
    }
  }
  if(Game.twoPlayerMode){
    const cp2 = controlledPlayer2();
    if(cp2){
      const assist2 = getSwitchAssistTarget('away', cp2.id);
      if(assist2){
        softIds.add(assist2.id);
        paint(assist2, 'assist', 'away');
      }
    }
  }

  // 2) Presión secundaria (mismo alpha; no duplicar si ya es asistencia)
  for(const p of players){
    if(!isPressureCursorPlayer(p) || softIds.has(p.id)) continue;
    if(cp && p.id === cp.id) continue;
    if(Game.twoPlayerMode){
      const cp2 = controlledPlayer2();
      if(cp2 && p.id === cp2.id) continue;
    }
    softIds.add(p.id);
    paint(p, 'pressure', p.team === 'away' ? 'away' : 'home');
  }

  // 3) Jugador activo (opaco, última capa)
  if(cp) paint(cp, 'primary', 'home');
  if(Game.twoPlayerMode){
    const cp2 = controlledPlayer2();
    if(cp2) paint(cp2, 'primary', 'away');
  }
}

function isPlayerInRunBreakPose(p){
  if(!p || ball.owner === p) return false;
  if(p.aiMode === 'throw_in_run') return false;
  if(p.isMakingManualRun && p.wallRun?.active) return true;
  if(p.aiMode === AI_RUPTURA_MANUAL || p.aiMode === AI_RUPTURA) return true;
  if(p.runTarget && ball.owner && ball.owner.team === p.team && ball.owner.id !== p.id) return true;
  return false;
}

function getRunBreakDirection(p){
  if(p.wallRun?.dir) return p.wallRun.dir;
  if(p.lockedRunVector) return p.lockedRunVector;
  if(p.runTarget){
    const dx = p.runTarget.x - p.x, dy = p.runTarget.y - p.y;
    const d = Math.hypot(dx, dy);
    if(d > 0.08) return { x: dx / d, y: dy / d };
  }
  const gdx = p.oppGoalX() - p.x, gdy = CENTER.y - p.y;
  const gd = Math.hypot(gdx, gdy);
  return gd > 0.01 ? { x: gdx / gd, y: gdy / gd } : { x: p.attackDir(), y: 0 };
}

function applyRunBreakArmOverlay(p, armA, armB){
  const dir = getRunBreakDirection(p);
  const runWorld = Math.atan2(dir.y, dir.x);
  const rel = angDiff(runWorld, p.facing);
  const pointShoulder = clamp(-rel * 0.95, -1.15, 1.15);
  const pointArm = { shoulder: pointShoulder, elbow: 0.12 };
  const headYaw = clamp(angDiff(runWorld, p.facing) * 0.62, -0.72, 0.72);
  if(rel <= 0) return { armA: pointArm, armB, headYaw, pointLeft: true };
  return { armA, armB: pointArm, headYaw, pointLeft: false };
}

function drawPlayer(p, isControlledFlag){
  const s = project({x:p.x,y:p.y,z:0});
  const scale = s.s;
  const body = getBodyScale(p.appearance);
  const h = 2.0 * scale * body.heightScale;
  p._drawWidthScale = body.widthScale;

  if(p.celebAnim) drawCelebAnim(p, s, h);
  else if(p.tackleAnim && p.tackleAnim.type==='slide') drawSlideTackle(p, s, h);
  else if(p.tackleAnim && p.tackleAnim.type==='stand') drawStandTackle(p, s, h);
  else if(p.diveAnim) drawGKDive(p, s, h);
  else if(p.gkKickAnim) drawGKKick(p, s, h);
  else if(p.airStrikeAnim) drawAirStrike(p, s, h);
  else drawNormalPose(p, s, h);

  drawSpamDuelMeter(p, s, h);
}

/* ============================================================
   FESTEJOS ICONICOS â€” dibujo. Gracias a que los jugadores son graficos geometricos/simples, los 4
   festejos se simulan modificando escala (X/Y), posicion, rotacion y "velocidad" (fase de animacion)
   del mismo modelo que ya se usa en drawNormalPose, en vez de necesitar sprites nuevos.
   ============================================================ */
function drawCelebAnim(p, s, h){
  const a = p.celebAnim;
  switch(a.type){
    case 'siuu':    drawCelebSiuu(p, s, h, a); break;
    case 'topo':    drawCelebTopo(p, s, h, a); break;
    case 'mbappe':  drawCelebMbappe(p, s, h, a); break;
    case 'robot':   drawCelebRobot(p, s, h, a); break;
    default:        drawNormalPose(p, s, h);
  }
}

// version generalizada de drawNormalPose: en vez de piernas/brazos calculados por velocidad real,
// recibe directamente los angulos de pose y una escala/rotacion extra por encima (para el salto,
// el achique de la barrida, el bamboleo, los pasos rigidos del robot, etc.)
function drawStylizedBody(p, h, opts){
  opts = opts||{};
  const legSwing = opts.legSwing||0;
  const armSwing = opts.armSwing||0;
  const scaleX = opts.scaleX!==undefined ? opts.scaleX : 1;
  const scaleY = opts.scaleY!==undefined ? opts.scaleY : 1;
  const rotate = opts.rotate||0;
  const flip = facingFlip(p);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock} = vis;
  const skin = vis.skin;
  const ol = teamOutlineColor(p.team);
  const olW = outlineWidth(h);
  const widthScale = p._drawWidthScale || 1;

  ctx.rotate(rotate);
  ctx.scale(flip*scaleX*widthScale, scaleY);

  const legW = Math.max(2, h*0.09);
  strokeBone(-h*0.05, -h*0.42, -h*0.05 + Math.sin(legSwing)*h*0.16, -h*0.02 + Math.abs(Math.cos(legSwing))*h*0.02, sock, legW, ol);
  strokeBone(h*0.05, -h*0.42, h*0.05 - Math.sin(legSwing)*h*0.16, -h*0.02 + Math.abs(Math.cos(legSwing))*h*0.02, sock, legW, ol);
  const bootSwingL = Math.sin(legSwing)*h*0.16;
  const bootSwingR = -Math.sin(legSwing)*h*0.16;
  ctx.beginPath();
  ctx.ellipse(-h*0.05 + bootSwingL, h*0.01, h*0.085, h*0.048, 0.12, 0, Math.PI * 2);
  fillWithOutline(vis.boot, ol, Math.max(0.35, olW * 0.2));
  ctx.beginPath();
  ctx.ellipse(h*0.05 + bootSwingR, h*0.01, h*0.085, h*0.048, -0.12, 0, Math.PI * 2);
  fillWithOutline(vis.boot, ol, Math.max(0.35, olW * 0.2));

  ctx.beginPath();
  ctx.moveTo(-h*0.15,-h*0.55); ctx.lineTo(h*0.15,-h*0.55); ctx.lineTo(h*0.13,-h*0.38); ctx.lineTo(-h*0.13,-h*0.38);
  ctx.closePath();
  fillWithOutline(flatMaterial(shorts), ol, olW * 0.85);

  if(!opts.hideArms){
    strokeBone(-h*0.15, -h*0.78, -h*0.15 + Math.sin(armSwing)*h*0.13, -h*0.62, skin, legW * 0.85, CARTOON.skinOutline);
    strokeBone(h*0.15, -h*0.78, h*0.15 - Math.sin(armSwing)*h*0.13, -h*0.62, skin, legW * 0.85, CARTOON.skinOutline);
  }

  ctx.beginPath();
  ctx.moveTo(-h*0.17,-h*0.8);
  ctx.quadraticCurveTo(-h*0.19,-h*0.58,-h*0.14,-h*0.53);
  ctx.lineTo(h*0.14,-h*0.53);
  ctx.quadraticCurveTo(h*0.19,-h*0.58,h*0.17,-h*0.8);
  ctx.quadraticCurveTo(0,-h*0.88,-h*0.17,-h*0.8);
  ctx.closePath();
  fillWithOutline(litMaterial(shirt, h), ol, olW);

  const backView = !!opts.backView;
  if(backView){
    drawShirtBackNumber(p, h, 0, -h * 0.655);
  }
  drawHeadHair(0, -h*0.92, h*0.09, h, backView, vis);
}

// fase comun a los 4 festejos (primeros 0.5s): corren unos metros hacia la mitad de la cancha
// antes de empezar el gesto especifico â€” nadie festeja parado en seco donde convirtio.
function drawCelebRunPhase(p, s, h, t){
  const legSwing = Math.sin(t*20) * 0.9;
  const armSwing = Math.sin(t*20+Math.PI) * 0.7;
  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 2, h*0.24, h*0.08, 0.38);
  drawStylizedBody(p, h, {legSwing, armSwing});
  ctx.restore();
}

// BOTON X ("Siuuuu" de Cristiano Ronaldo): corre de frente hacia la mitad de cancha, da un salto
// vertical (sin invertirse ni girar el cuerpo) y al caer queda DE ESPALDAS a la camara â€” unico
// festejo que termina asi â€” abriendo los dos brazos en diagonal hacia abajo y hacia atras, en la
// pose clasica, sostenida con camara lenta en el instante del impacto.
function drawCelebSiuu(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }

  let legSwing=0.15, armSwing=0.3, scaleX=1, scaleY=1, jumpPx=0, landed=false;

  if(t < 0.9){ // salto vertical puro: solo sube y baja en Y, el cuerpo se mantiene derecho
    const jp = clamp((t-0.5)/0.4, 0, 1);
    jumpPx = -Math.sin(jp*Math.PI) * h*0.55;
    scaleY = 1 + 0.18*Math.sin(jp*Math.PI);
    legSwing = 0.25; armSwing = 0.35;
  } else { // aterriza de pie, firme, y abre los brazos en diagonal hacia abajo/atras
    landed = true;
    const lp = clamp((t-0.9)/0.15, 0, 1);
    scaleX = 1 + 0.14*(1-lp);
    legSwing = 0.12;
  }

  ctx.save();
  ctx.translate(s.x, s.y + jumpPx);
  drawEntityShadow(0, h*0.02 - jumpPx*0.12, h*0.24, h*0.08, 0.30);
  drawStylizedBody(p, h, {legSwing, armSwing, scaleX, scaleY, hideArms:landed, backView:landed});

  if(landed){
    const skin=playerVisuals(p).skin;
    const legW = Math.max(2,h*0.09);
    ctx.strokeStyle = skin; ctx.lineWidth = legW*0.85; ctx.lineCap='round';
    // brazos abiertos en diagonal, hacia abajo y hacia atras (se abre angulo con el torso)
    ctx.beginPath(); ctx.moveTo(-h*0.15,-h*0.78); ctx.lineTo(-h*0.37,-h*0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.15,-h*0.78); ctx.lineTo(h*0.37,-h*0.5); ctx.stroke();
  }
  ctx.restore();
}

// BOTON CUADRADO ("No Escucho", el clasico de Messi/Riquelme llevandose las manos a las orejas):
// corre hacia la mitad de cancha, frena y ahi levanta los codos hasta la altura del hombro
// (brazo en angulo, no estirado) para llevar las manos, ahuecadas, justo pegadas a las orejas â€”
// como diciendo "no los escucho".
function drawCelebTopo(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }
  const t2 = t - 0.5;

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 2, h*0.24, h*0.08, 0.38);
  drawStylizedBody(p, h, {legSwing:0, hideArms:true});

  if(t2>0.08){
    const raise = clamp(t2/0.3, 0, 1); // el codo sube y se abre hacia afuera, y la mano se pega a la oreja
    const skin=playerVisuals(p).skin;
    const legW = Math.max(2,h*0.09);
    ctx.strokeStyle = skin; ctx.lineWidth = legW*0.85; ctx.lineCap='round';
    const elbowX = lerp(h*0.15, h*0.31, raise), elbowY = lerp(-h*0.78, -h*0.7, raise);
    const handX  = lerp(h*0.15, h*0.10, raise), handY  = lerp(-h*0.78, -h*0.91, raise);
    // brazo izquierdo: hombro -> codo (afuera, a la altura del hombro) -> mano (pegada a la oreja)
    ctx.beginPath(); ctx.moveTo(-h*0.15,-h*0.78); ctx.lineTo(-elbowX, elbowY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-elbowX, elbowY); ctx.lineTo(-handX, handY); ctx.stroke();
    // brazo derecho, simetrico
    ctx.beginPath(); ctx.moveTo(h*0.15,-h*0.78); ctx.lineTo(elbowX, elbowY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(handX, handY); ctx.stroke();

    if(raise>=1){
      // mano ahuecada detras/pegada a la oreja (no un circulo flotando lejos de la cabeza)
      const bounce = Math.sin(t2*6)*0.05 + 1;
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(-handX, handY, h*0.05*bounce, h*0.07*bounce, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(handX, handY, h*0.05*bounce, h*0.07*bounce, -0.4, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

// BOTON TRIANGULO ("Brazos Cruzados"): corre hacia la mitad de cancha y ahi cruza los dos brazos
// sobre el pecho en una pose serena y erguida â€” cada mano queda apoyada sobre el hombro/biceps
// opuesto (no solo dos lineas que se tocan en el medio), el brazo derecho cruza por encima.
function drawCelebMbappe(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }
  const t2 = t - 0.5;
  const scaleY = t2<0.15 ? lerp(1, 0.94, clamp(t2/0.15,0,1)) : (t2<0.3 ? lerp(0.94,1,clamp((t2-0.15)/0.15,0,1)) : 1);
  const chinUp = -0.025; // apenas erguido hacia atras, pose calma y firme

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 2, h*0.26, h*0.09, 0.38);
  drawStylizedBody(p, h, {legSwing:0.03, scaleY, rotate:chinUp, hideArms:true});

  if(t2 >= 0.1){
    const crossT = clamp((t2-0.1)/0.25, 0, 1); // los brazos se cruzan progresivamente sobre el pecho
    const skin=playerVisuals(p).skin;
    const legW = Math.max(2,h*0.09);
    ctx.strokeStyle = skin; ctx.lineWidth = legW*0.95; ctx.lineCap='round';
    // brazo derecho: cruza primero (queda por ENCIMA) y termina apoyado sobre el hombro/biceps izq
    ctx.beginPath();
    ctx.moveTo(h*0.15,-h*0.78);
    ctx.lineTo(lerp(h*0.15, -h*0.20, crossT), lerp(-h*0.7,-h*0.72,crossT));
    ctx.stroke();
    // brazo izquierdo: termina apoyado sobre el hombro/biceps derecho, por DEBAJO del otro
    ctx.beginPath();
    ctx.moveTo(-h*0.15,-h*0.78);
    ctx.lineTo(lerp(-h*0.15, h*0.19, crossT), lerp(-h*0.7,-h*0.64,crossT));
    ctx.stroke();
    if(crossT>=0.9){
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(-h*0.20,-h*0.72,h*0.045,0,Math.PI*2); ctx.fill(); // mano der sobre hombro izq
      ctx.beginPath(); ctx.arc(h*0.19,-h*0.64,h*0.045,0,Math.PI*2); ctx.fill();  // mano izq sobre brazo der
    }
  }
  ctx.restore();
}

// BOTON CIRCULO ("Baile", estilo robot de Peter Crouch): corre hacia la mitad de cancha y ahi la
// rotacion y la pose "saltan" a angulos rectos cada 150ms (stop-motion), mecanico y rigido
function drawCelebRobot(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }
  const t2 = t - 0.5;
  const stepIndex = Math.floor(t2*1000/150);
  const legSwing = (stepIndex%2===0) ? 0.55 : -0.55;
  const armSwing = (stepIndex%2===0) ? -0.9 : 0.9;
  const rotate = [-0.28, 0, 0.28, 0][stepIndex%4];

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 2, h*0.24, h*0.08, 0.38);
  drawStylizedBody(p, h, {legSwing, armSwing, rotate});
  ctx.restore();
}

/* ============================================================
   ESQUELETO JERARQUICO (Parent -> Child) implementado con transformaciones
   de Canvas: cada hueso se dibuja DESPUES de trasladar el origen al punto de
   union real con su padre (transform-origin) y rotar ahi mismo. La rotacion
   del hijo es SIEMPRE relativa al sistema de coordenadas ya rotado del padre
   (asi es como ctx.translate/ctx.rotate componen), que es exactamente lo que
   hace que la pantorrilla rote desde la rodilla y no desde la cadera, el
   antebrazo desde el codo y no desde el hombro, etc.
   Cadena: Torso (raiz)
             -> Cuello -> Cabeza
             -> Hombro Izq/Der -> Brazo -> Antebrazo -> MuÃ±eca/Mano
             -> Cadera Izq/Der -> Muslo -> Pantorrilla(rodilla) -> Pie(tobillo)
   Convencion de angulos: en esta funcion "positivo" siempre significa
   "hacia adelante" (misma semantica que el viejo legSwing/armSwing), por
   eso rotateBone() invierte el signo antes de llamar a ctx.rotate (canvas
   rota los +x hacia -x en sentido horario visual con y-hacia-abajo).
   ============================================================ */
function rotateBone(angle){ ctx.rotate(-angle); }
function easeOutQuad(x){ x = clamp(x,0,1); return 1-(1-x)*(1-x); }
// curva del latigazo: sube rapido (carga->impacto) y despues relaja (seguimiento del golpe)
function kickImpactCurve(t, dur){
  const u = clamp(t/dur, 0, 1);
  const RISE = 0.32;
  if(u < RISE) return u/RISE;
  return clamp(1 - (u-RISE)/(1-RISE), 0, 1);
}

// dibuja UNA pierna completa (cadera->muslo->rodilla->pantorrilla->tobillo->pie), pivotando cada
// articulacion desde su punto de union real. hipX/hipY = punto de union con la cadera (padre=torso).
function drawBootSprite(bootColor, outlineColor, footLen, legW){
  const ol = outlineColor || CARTOON.outlineDefault;
  const boot = bootColor || CARTOON.boot;
  // Botín proporcional al cuerpo: largo claro + suela apoyada en el césped (perspectiva 3/4).
  const rx = footLen * 0.58;
  const ry = footLen * 0.30;
  ctx.beginPath();
  ctx.ellipse(footLen * 0.36, footLen * 0.20, rx, ry, 0.18, 0, Math.PI * 2);
  fillWithOutline(boot, ol, Math.max(0.35, legW * 0.12));
  // Tope / puntera más definida para distinguir color
  ctx.beginPath();
  ctx.ellipse(footLen * 0.62, footLen * 0.14, footLen * 0.28, footLen * 0.18, 0.12, 0, Math.PI * 2);
  ctx.fillStyle = boot;
  ctx.fill();
}

function drawLegBone(hipX, hipY, thighLen, calfLen, thighAngle, kneeAngle, footAngle, sockColor, legW, outlineColor, bootColor){
  const ol = outlineColor || CARTOON.outlineDefault;
  ctx.save();
  ctx.translate(hipX, hipY);
  rotateBone(thighAngle);
  strokeBone(0, 0, 0, thighLen, sockColor, legW, ol);

  ctx.translate(0, thighLen);
  rotateBone(kneeAngle);
  strokeBone(0, 0, 0, calfLen, sockColor, legW, ol);

  ctx.translate(0, calfLen);
  rotateBone(footAngle);
  const footLen = calfLen * 0.78;
  drawBootSprite(bootColor, ol, footLen, legW);
  ctx.restore();
  return { footLen };
}

function drawArmBone(shX, shY, upperLen, foreLen, shoulderAngle, elbowAngle, wristAngle, skinColor, legW, outlineColor){
  const ol = outlineColor || CARTOON.skinOutline;
  ctx.save();
  ctx.translate(shX, shY);
  rotateBone(shoulderAngle);
  strokeBone(0, 0, 0, upperLen, skinColor, legW * 0.85, ol);

  ctx.translate(0, upperLen);
  rotateBone(elbowAngle);
  strokeBone(0, 0, 0, foreLen, skinColor, legW * 0.85, ol);

  ctx.translate(0, foreLen);
  rotateBone(wristAngle);
  ctx.beginPath();
  ctx.arc(0, foreLen * 0.16, legW * 0.4, 0, Math.PI * 2);
  fillWithOutline(skinColor, ol, Math.max(0.85, legW * 0.42));
  ctx.restore();
}

// Suaviza CUALQUIER pose (objeto plano o anidado un nivel, ej. {legA:{thigh,knee,foot}, neckTilt:n})
// hacia sus valores objetivo con una interpolacion exponencial independiente del framerate
// (k = 1 - rate^dt). El estado suavizado vive en p._pose y persiste entre frames, asi las
// articulaciones nunca "saltan" de golpe al cambiar de modo (idle -> correr -> preparar -> patear):
// siempre se desliza desde el angulo real que tenian un instante antes.
function smoothPose(p, target, rate){
  const k = clamp(1 - Math.pow(0.0001, (lastDt||0.016)*rate/6), 0, 1);
  if(!p._pose){
    p._pose = {
      legA: { ...target.legA },
      legB: { ...target.legB },
      armA: { ...target.armA },
      armB: { ...target.armB },
      wristA: target.wristA,
      wristB: target.wristB,
      neckTilt: target.neckTilt,
      headYaw: target.headYaw,
      bounceUp: target.bounceUp,
      squash: target.squash,
      torsoExtra: target.torsoExtra,
    };
  }
  const dst = p._pose;
  for(const key in target){
    const t = target[key];
    if(t && typeof t === 'object'){
      if(!dst[key]) dst[key] = { ...t };
      for(const kk in t) dst[key][kk] = lerp(dst[key][kk] ?? t[kk], t[kk], k);
    } else {
      dst[key] = lerp(dst[key] ?? t, t, k);
    }
  }
  return dst;
}

function drawNormalPose(p, s, h){
  const moveSpeed = Math.hypot(p.vx, p.vy);
  const speed = getAnimVisualSpeed(p) || moveSpeed;
  const runT = p.animPhase;
  const mass = p.weightFactor||1;
  const prepping = !!(p.charging || p.pendingKick);
  const buf = p.actionBuffer;
  const chargeLayer = !!(buf?.chargeStart > 0);
  const feinting = !!p.feint;
  const draggingBack = !!p.dragBack;
  const throwingIn = !!(p.isThrowingIn || p.throwInAnim);
  const kicking  = !!p.kickAnim;      // EL LATIGAZO: ventana de impacto del tiro/pase en curso
  const jockeying = !!(p.jockeyState && !prepping && !kicking && !feinting);
  const strideAmp = clamp(0.55+speed*0.06,0.15,1.05) * clamp(1.12-(mass-1)*0.45, 0.72, 1.2) * (p.legIdleBlend??1);

  // ============================================================
  // REGLA 1 â€” COORDINACION Y DESFASE: pierna A y pierna B corren en oposicion total de fase
  // (medio ciclo = PI de diferencia): cuando una va al frente, la otra va atras. El muslo oscila
  // con seno; la RODILLA (pivote real = rodilla, no la cadera) se flexiona solo durante la fase de
  // RECUPERACION de cada pierna (cuando el pie esta en el aire volviendo al frente) y se estira del
  // todo en los dos extremos del paso (apoyo/contacto y despegue) â€” antes estaba al reves (se
  // doblaba con la pierna de apoyo, plantada, lo que se veia como si la rodilla "cediera" bajo el
  // peso en vez de despegar el pie limpio). max(0,cos(phase)) da flexion maxima justo en el punto
  // medio de la recuperacion y CERO en los dos extremos del paso (thigh en su maximo), que es
  // exactamente donde una pierna real esta mas estirada.
  const phaseA = runT, phaseB = runT + Math.PI;
  function runLeg(phase){
    return { thigh: Math.sin(phase)*strideAmp, knee: Math.max(0,Math.cos(phase))*strideAmp*1.3, foot: 0.28 + Math.max(0,Math.sin(phase))*0.25 };
  }
  let legA = runLeg(phaseA), legB = runLeg(phaseB);

  // brazos: DESFASE CRUZADO respecto de la pierna del MISMO lado (brazo A comparte fase con pierna
  // A pero con un +PI extra), asi cuando la pierna A va al frente el brazo A va atras y el brazo B
  // (el del lado contrario) va al frente â€” coordinacion contralateral real, la que da equilibrio.
  const armAmp = (prepping||feinting||kicking||draggingBack||throwingIn) ? 0.15 : clamp(0.4+speed*0.05,0.1,0.9);
  function runArm(phase){
    const shoulder = Math.sin(phase+Math.PI)*armAmp;
    const elbow = 0.32 + Math.max(0,-shoulder)*0.55;
    return {shoulder, elbow};
  }
  let armA = runArm(phaseA), armB = runArm(phaseB);

  // BAMBOLEO RELAJADO DE MUÃ‘ECAS al correr a fondo (frecuencia distinta a la del brazo = se ve suelto)
  const sprintT = clamp((speed-5)/3.5, 0, 1);
  const wristA = Math.sin(phaseA*2.3 + 1.3) * 0.22 * sprintT;
  const wristB = Math.sin(phaseB*2.3 + 1.3) * 0.22 * sprintT;
  // cuello inclinado hacia adelante al esprintar a fondo
  let neckTilt = sprintT * 0.26 + Math.sin(runT*2)*0.03*sprintT;

  // ============================================================
  // REGLA 3 â€” EFECTO DE PESO (bounce con apoyo real): el torso sube en el punto medio de cada
  // recuperacion (cuando ninguna pierna esta del todo estirada, el "vuelo" entre pasos) y baja
  // justo en el contacto/despegue de cada paso (|cos(phase)| tiene sus DOS minimos exactamente ahi,
  // en fase con la extension maxima del muslo de arriba). Antes el offset no se multiplicaba por la
  // altura del jugador en pantalla (quedaba en un pixel o menos, invisible); ahora es proporcional a
  // "h" y ademas se acompaÃ±a de un sutil squash&stretch (se achica al pisar, se estira al despegar)
  // para que se note que apoya con peso real, no que flota.
  const bounceAmp = clamp(speed*0.11, 0,  0.9) * clamp(1.15-(mass-1)*0.5,0.65,1.3);
  const running = !prepping && !feinting && !kicking && !draggingBack && !throwingIn && !jockeying;
  const bounceN = running ? Math.abs(Math.cos(phaseA)) : 0; // 0=apoyo/pisada, 1=vuelo
  const bounceUp = bounceN * bounceAmp;               // fraccion de h que sube el torso
  const squash = running ? lerp(-1, 1, bounceN)*0.045*clamp(speed*0.25,0,1) : 0; // <0 al pisar, >0 al volar

  let torsoExtra = 0; // inclinacion extra del torso (independiente de leanFwd/leanSide fisico)

  // --- SAQUE LATERAL: torso hacia atras (200ms) y luego impulso hacia adelante ---
  if(throwingIn){
    if(p.throwInAnim){
      const anim = p.throwInAnim;
      if(anim.phase === 'windback'){
        const prog = clamp(anim.t / anim.windDur, 0, 1);
        torsoExtra = lerp(0, -0.38, easeOutQuad(prog));
        armA = { shoulder: -0.65*prog, elbow: 0.52 };
        armB = { shoulder: -0.55*prog, elbow: 0.58 };
      } else {
        const prog = clamp(anim.t / anim.releaseDur, 0, 1);
        torsoExtra = lerp(-0.38, 0.32, easeOutQuad(prog));
        armA = { shoulder: lerp(-0.65, 0.55, prog), elbow: lerp(0.52, 0.22, prog) };
        armB = { shoulder: lerp(-0.55, 0.48, prog), elbow: lerp(0.58, 0.28, prog) };
      }
    } else {
      torsoExtra = -0.08;
      armA = { shoulder: -0.4, elbow: 0.5 };
      armB = { shoulder: -0.35, elbow: 0.52 };
    }
    legA = { thigh: 0.32, knee: 0.36, foot: 0.3 };
    legB = { thigh: 0.38, knee: 0.34, foot: 0.3 };
    neckTilt = 0;
  }

  // --- JOCKEY_POSE: semi-flexionado, piernas y brazos abiertos (compensado por facingFlip) ---
  if(jockeying){
    const openSign = facingFlip(p);
    legA = { thigh: 0.58 * openSign, knee: 0.92, foot: 0.42 };
    legB = { thigh: -0.54 * openSign, knee: 0.88, foot: 0.40 };
    armA = { shoulder: 0.78 * openSign, elbow: 0.92 };
    armB = { shoulder: -0.74 * openSign, elbow: 0.88 };
    neckTilt = 0.1;
    torsoExtra = 0.2 + (p.jockeyRetreat ? 0.12 : 0);
  }

  // --- PREPARANDO_ACCION (pelota en pie): pierna de golpeo cargada â€” reemplaza la carrera ---
  if(prepping && !feinting && !throwingIn){
    const cl = chargeLevel(p);
    legA = { thigh: -0.95 - Math.sin(runT*0.6)*0.06, knee: 1.15*clamp(0.5+cl,0.5,1), foot: 0.25 };
    legB = { thigh: 0.55, knee: 0.32, foot: 0.3 };
    armA = { shoulder: -0.12, elbow: 0.4 }; armB = { shoulder: 0.12, elbow: 0.4 };
    neckTilt = 0;
    torsoExtra = -0.11*cl;
  }

  // --- CAPA DE CARGA sobre la carrera (sprint_chase / pelota suelta): piernas siguen corriendo ---
  if(chargeLayer && !prepping && !feinting && !kicking && !draggingBack && !throwingIn && speed > 0.25){
    const cl = chargeLevel(p);
    const kickLeg = { thigh: -0.95 - Math.sin(runT*0.6)*0.06, knee: 1.15*clamp(0.5+cl,0.5,1), foot: 0.25 };
    legA = {
      thigh: lerp(legA.thigh, kickLeg.thigh, cl * 0.55),
      knee: lerp(legA.knee, kickLeg.knee, cl * 0.55),
      foot: lerp(legA.foot, kickLeg.foot, cl * 0.45),
    };
    armA = { shoulder: lerp(armA.shoulder, -0.12, cl * 0.55), elbow: lerp(armA.elbow, 0.4, cl * 0.55) };
    armB = { shoulder: lerp(armB.shoulder, 0.12, cl * 0.55), elbow: lerp(armB.elbow, 0.4, cl * 0.55) };
    torsoExtra = lerp(torsoExtra, -0.11 * cl, cl * 0.35);
  }

  // --- ANIMACION DE TIRO â€” EL LATIGAZO ---
  if(kicking && !feinting && !throwingIn){
    const ka = p.kickAnim;
    const prog = clamp(ka.t/ka.dur, 0, 1);
    const sweep = easeOutQuad(Math.min(1, prog*1.6));
    const snap  = kickImpactCurve(ka.t, ka.dur);
    const intensity = ka.type==='shot' ? 1 : 0.75;
    legA = {
      thigh: lerp(-1.05, 1.3, sweep) * (0.85+0.15*intensity),
      knee:  lerp(1.15, 0.05, Math.min(1, prog*1.9)),
      foot:  0.3 + 1.05*snap*intensity,
    };
    legB = { thigh: 0.5, knee: 0.35, foot: 0.3 };
    armA = { shoulder: -0.5*sweep, elbow: 0.35 }; armB = { shoulder: 0.5*sweep, elbow: 0.35 };
    neckTilt = 0;
    torsoExtra = lerp(-0.13, 0.10, easeOutQuad(Math.min(1,prog*1.5))) * (1-Math.max(0,prog-0.75)/0.25);
  }

  // --- AMAGUE: YA NO es una tijera de piernas (eso se leia como una finta de cuerpo/recorte). Ahora
  // la pierna A (la misma que venia cargada atras por el windup de PREPARANDO_ACCION, de la rama de
  // arriba) completa un toque corto y seco -con la misma curva que el toque de conduccion normal,
  // touchKickCurve- en vez de terminar el latigazo completo del tiro. Como smoothPose() interpola
  // desde el angulo real del frame anterior, la transicion se ve como "iba a rematar... y en el
  // ultimo instante amaga y la empuja con la punta" en lugar de saltar a una pose nueva de golpe.
  if(feinting){
    const pokeT = touchKickCurve(p.feint.t, p.feint.dur);
    legA = { thigh: lerp(-0.95, 0.6, pokeT), knee: lerp(1.0, 0.3, pokeT), foot: 0.26 + pokeT*0.75 };
    legB = { thigh: 0.5, knee: 0.32, foot: 0.3 };
    armA = { shoulder: -0.12*(1-pokeT), elbow: 0.35 };
    armB = { shoulder: 0.12*(1-pokeT), elbow: 0.35 };
    neckTilt = 0;
  }

  // --- DRAGBACK: pisada + arrastre con la suela. Primera mitad del gesto: la pierna que "pisa" se
  // estira al frente por ARRIBA de la pelota (muslo adelantado, pie en punta hacia abajo, como
  // apoyando la suela) mientras el peso del cuerpo se va hacia atras. Segunda mitad: la pierna se
  // retira sin soltar la pelota (ya arrastrada un poco hacia atras por la fisica de startDragBack) y
  // el jugador queda plantado, listo para salir para cualquier lado con el proximo input.
  if(draggingBack){
    const dbt = clamp(p.dragBack.t/p.dragBack.dur, 0, 1);
    const reach = dbt < 0.55 ? easeOutQuad(dbt/0.55) : 1-easeOutQuad((dbt-0.55)/0.45);
    legA = { thigh: lerp(0.15, 1.05, reach), knee: lerp(0.3, 0.15, reach), foot: 0.3 + reach*0.55 };
    legB = { thigh: -0.25, knee: 0.35, foot: 0.3 };
    armA = { shoulder: 0.15*reach, elbow: 0.4 };
    armB = { shoulder: -0.15*reach, elbow: 0.4 };
    neckTilt = 0;
    torsoExtra = 0.12*reach; // el torso se va un poco hacia atras, acompaÃ±ando el arrastre
  }

  // --- CONDUCCION CON TOQUES / EFFORT TOUCH ---
  if(p.effortTouchAnim && !feinting && !kicking && !draggingBack){
    const eta = p.effortTouchAnim;
    const pokeT = touchKickCurve(eta.t, eta.dur);
    let touching, planted;
    if(eta.type === 'long'){
      // toque largo: extension amplia del muslo + inclinacion hacia adelante (postura distinta al corto)
      touching = { thigh: pokeT*1.55*TOUCH_KICK_REACH*0.72, knee: (1-pokeT)*0.75, foot: 0.24 + pokeT*1.08 };
      planted  = { thigh: legA.thigh*(1-pokeT*0.85), knee: 0.28, foot: 0.3 };
      torsoExtra = lerp(torsoExtra, 0.2*pokeT, pokeT);
      neckTilt = lerp(neckTilt, 0.12*pokeT, pokeT);
    } else {
      // toque corto: puntapie rapido y compacto, cuerpo mas erguido
      touching = { thigh: pokeT*0.85*TOUCH_KICK_REACH*0.42, knee: (1-pokeT)*0.62, foot: 0.28 + pokeT*0.58 };
      planted  = { thigh: legA.thigh*(1-pokeT*0.55), knee: 0.3, foot: 0.3 };
    }
    if(eta.leg===1){ legA = touching; legB = planted; } else { legB = touching; legA = planted; }
  } else if(p.touchAnim && !feinting && !kicking && !draggingBack){
    const ta = p.touchAnim;
    const pokeT = touchKickCurve(ta.t, ta.dur);
    const touching = { thigh: pokeT*1.15*TOUCH_KICK_REACH*0.55, knee: (1-pokeT)*0.9, foot: 0.28 + pokeT*0.85 };
    const planted  = { thigh: legA.thigh* (1-pokeT*0.7), knee: 0.3, foot: 0.3 };
    if(ta.leg===1){ legA = touching; legB = planted; } else { legB = touching; legA = planted; }
  }

  // --- DESMARQUE: brazo señalando la dirección de carrera (piernas siguen corriendo) ---
  let headYaw = 0;
  let pointWristA = wristA, pointWristB = wristB;
  if(isPlayerInRunBreakPose(p) && !prepping && !kicking && !feinting && !draggingBack && !throwingIn && !jockeying){
    const overlay = applyRunBreakArmOverlay(p, armA, armB);
    armA = overlay.armA;
    armB = overlay.armB;
    headYaw = overlay.headYaw;
    neckTilt = lerp(neckTilt, 0.1, 0.55);
    if(overlay.pointLeft) pointWristA = 0;
    else pointWristB = 0;
  }

  // ============================================================
  // REGLA 4 — SUAVIZADO DE TRANSICIONES: TODOS los angulos de arriba son el "objetivo" del frame
  // actual; nunca se dibujan directo. Se pasan por smoothPose(), que los interpola exponencialmente
  // desde el valor real del frame anterior (guardado en p._pose). Asi, pasar de idle a correr, o de
  // correr a la carga/patada, desliza los angulos en un puÃ±ado de frames en vez de saltar de golpe.
  // El tiro/amague usan un rate mas alto (mas rapido) para no perder la sensacion de latigazo.
  const smoothRate = kicking ? 30 : feinting ? 30 : draggingBack ? 18 : 20;
  const pose = smoothPose(p, {legA, legB, armA, armB, wristA: pointWristA, wristB: pointWristB, neckTilt, headYaw, bounceUp, squash, torsoExtra}, smoothRate);
  ({legA, legB, armA, armB, torsoExtra} = pose);
  const {wristA:wA, wristB:wB, neckTilt:nT, headYaw:hY, bounceUp:bU, squash:sq} = pose;

  const flip = facingFlip(p);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock} = vis;
  const skin = vis.skin;
  const ol = teamOutlineColor(p.team);
  const olW = outlineWidth(h);
  const legW = Math.max(2, h*0.09);
  const widthScale = p._drawWidthScale || 1;

  ctx.save();
  ctx.translate(s.x, s.y);

  drawEntityShadow(0, 2, h*0.24*widthScale, h*0.08, 0.44);

  ctx.translate(0, -bU*h*0.05); // REGLA 3: rebote de peso, ya proporcional a la altura real en pantalla

  // trastabille breve tras perder un duelo
  if(p.stumble){
    const st = clamp(p.stumble.t / p.stumble.dur, 0, 1);
    ctx.rotate(Math.sin(st*Math.PI*3.2) * 0.4 * (1-st));
  }
  // amague de tiro: apenas una leve inclinacion hacia adelante, la del gesto de dar un toque corto
  // (antes era un bandazo de cuerpo mas marcado, porque el jugador salia disparado con el recorte;
  // ahora el que se mueve fuerte es el toque de la pelota, no el cuerpo, asi que el giro es sutil)
  if(p.feint){
    const ft = clamp(p.feint.t / p.feint.dur, 0, 1);
    ctx.rotate(Math.sin(ft*Math.PI) * 0.08);
  }
  // effort touch largo: inclinacion extra del torso al empujar con fuerza
  if(p.effortTouchAnim && p.effortTouchAnim.type === 'long'){
    const pokeT = touchKickCurve(p.effortTouchAnim.t, p.effortTouchAnim.dur);
    ctx.rotate(Math.sin(pokeT*Math.PI) * 0.14);
  }
  // REGLA 2 â€” INERCIA: inclinacion extra de preparar/patear (ya suavizada arriba junto al resto)
  if(!p.stumble && !p.feint && !p.effortTouchAnim){
    ctx.rotate(torsoExtra);
  }
  // REGLA 2 â€” INERCIA DE MOVIMIENTO: p.leanFwd/p.leanSide ya vienen suavizados con LERP desde
  // movePlayer segun la aceleracion real (adelante al arrancar/correr, atras al frenar en seco,
  // al costado al girar) â€” el torso "acompaÃ±a" el cambio de direccion antes de estabilizarse.
  if(!p.stumble && !p.feint && !p.effortTouchAnim && !prepping && !kicking && !draggingBack && (p.leanFwd || p.leanSide)){
    ctx.rotate((p.leanFwd||0) + (p.leanSide||0));
  }

  ctx.scale(flip*widthScale,1);
  ctx.scale(1-sq, 1+sq); // REGLA 3: squash&stretch â€” se achica un poco al pisar, se estira al volar

  // ===================== CADENA: CADERA -> MUSLO -> PANTORRILLA(rodilla) -> PIE(tobillo) =====================
  const hipY = -h*0.42, thighLen = h*0.20, calfLen = h*0.20;
  drawLegBone(-h*0.05, hipY, thighLen, calfLen, legA.thigh, legA.knee, legA.foot, sock, legW, ol, vis.boot);
  drawLegBone( h*0.05, hipY, thighLen, calfLen, legB.thigh, legB.knee, legB.foot, sock, legW, ol, vis.boot);

  ctx.beginPath();
  ctx.moveTo(-h*0.15,-h*0.55); ctx.lineTo(h*0.15,-h*0.55); ctx.lineTo(h*0.13,-h*0.38); ctx.lineTo(-h*0.13,-h*0.38);
  ctx.closePath();
  fillWithOutline(flatMaterial(shorts), ol, olW * 0.85);

  const shY = -h*0.78, upperArmLen = h*0.09, foreArmLen = h*0.085;
  drawArmBone(-h*0.15, shY, upperArmLen, foreArmLen, armA.shoulder, armA.elbow, wA, skin, legW, CARTOON.skinOutline);
  drawArmBone( h*0.15, shY, upperArmLen, foreArmLen, armB.shoulder, armB.elbow, wB, skin, legW, CARTOON.skinOutline);

  drawPlayerMeshDir8Prototype(p, h, 'shoulders');

  ctx.beginPath();
  ctx.moveTo(-h*0.17,-h*0.8);
  ctx.quadraticCurveTo(-h*0.19,-h*0.58,-h*0.14,-h*0.53);
  ctx.lineTo(h*0.14,-h*0.53);
  ctx.quadraticCurveTo(h*0.19,-h*0.58,h*0.17,-h*0.8);
  ctx.quadraticCurveTo(0,-h*0.88,-h*0.17,-h*0.8);
  ctx.closePath();
  fillWithOutline(litMaterial(shirt, h), ol, olW);

  // Número de espalda centrado en el torso (capa editable appearance.layers.shirtNumber).
  const facingAway = isFacingAwayFromCamera(p);
  if(facingAway){
    drawShirtBackNumber(p, h, 0, -h * 0.655);
  }

  // ===================== CADENA: TORSO -> CUELLO -> CABEZA =====================
  ctx.save();
  ctx.translate(0, -h*0.80);
  rotateBone(nT);
  rotateBone(hY || 0);
  drawHeadHair(0, -h*0.115, h*0.09, h, facingAway, vis);
  ctx.restore();

  ctx.restore();
}

// cabeza (piel) + pelo diferenciado por estilo/color del jugador
function drawHeadHair(cx, cy, r, h, facingAway, vis){
  const skin = vis?.skin || CARTOON.skin;
  const hair = vis?.hair || CARTOON.hair;
  const style = vis?.hairStyle || 'short';
  const ol = CARTOON.skinOutline;
  const lw = Math.max(1.1, h * 0.038);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  fillWithOutline(skin, ol, lw);

  if(style === 'bald'){
    // solo piel
  } else if(facingAway){
    const hairR = style === 'afro' || style === 'curly' ? r * 1.45
      : style === 'long' ? r * 1.35
      : style === 'mohawk' ? r * 1.15
      : r * 1.22;
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.005, hairR, 0, Math.PI * 2);
    fillWithOutline(hair, ol, lw * 0.9);
    if(style === 'mohawk'){
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.9, r * 0.28, r * 0.55, 0, 0, Math.PI * 2);
      fillWithOutline(hair, ol, lw * 0.7);
    }
  } else {
    const topR = style === 'afro' || style === 'curly' ? r * 1.25
      : style === 'long' ? r * 1.15
      : style === 'buzz' || style === 'fade' ? r * 0.95
      : r * 1.06;
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.04, topR, Math.PI, 0);
    fillWithOutline(hair, ol, lw * 0.9);
    if(style === 'mohawk'){
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.85, r * 0.22, r * 0.5, 0, 0, Math.PI * 2);
      fillWithOutline(hair, ol, lw * 0.7);
    }
  }

  // Barba / vello facial
  const beard = vis?.beard || 'none';
  if(beard !== 'none' && !facingAway){
    ctx.beginPath();
    if(beard === 'stubble'){
      ctx.ellipse(cx, cy + r * 0.35, r * 0.7, r * 0.35, 0, 0, Math.PI);
    } else if(beard === 'goatee'){
      ctx.ellipse(cx, cy + r * 0.45, r * 0.28, r * 0.4, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(cx, cy + r * 0.4, r * 0.75, r * 0.5, 0, 0, Math.PI);
    }
    fillWithOutline(hair, ol, lw * 0.55);
  }

  // Accesorio cintillo
  if(vis?.accessory === 'headband'){
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.15, r * 1.05, r * 0.18, 0, 0, Math.PI * 2);
    fillWithOutline(vis.boot || '#ffffff', ol, lw * 0.5);
  }
}

/* ============================================================
   POSES ANIMADAS â€” entrada de pie y barrida
   ============================================================ */
function drawStandTackle(p, s, h){
  const a = p.tackleAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const lunge = Math.sin(prog*Math.PI); // 0 -> 1 -> 0, el impulso de la pierna
  const lungeBoost = 1 + lunge * 0.45;
  const flip = facingFlip(p);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock, skin, boot} = vis;
  const widthScale = p._drawWidthScale || 1;

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 2, h*0.24*widthScale, h*0.08, 0.38);
  ctx.scale(flip*widthScale,1);

  // Pierna activa (lado del balón) se estira al frente; la opuesta queda de apoyo
  const kickSide = a.kickSide ?? getLateralSignFromFacing(p, ball.x, ball.y);
  const kickHip = kickSide >= 0 ? h * 0.05 : -h * 0.05;
  const supportHip = -kickHip;
  const reach = h * 0.48 * lunge * lungeBoost;

  const legW = Math.max(2, h*0.09);
  const ol = teamOutlineColor(p.team);
  const olW = outlineWidth(h);
  // Apoyo: ligeramente atrás (local −X = opuesto al facing tras el flip)
  strokeBone(supportHip, -h*0.42, supportHip - h*0.05, -h*0.02, sock, legW, ol);
  ctx.beginPath();
  ctx.ellipse(supportHip - h*0.05, h*0.01, h*0.085, h*0.048, 0.1, 0, Math.PI * 2);
  fillWithOutline(boot, ol, Math.max(0.35, olW * 0.18));
  // Activa: estira hacia el frente (+X local ≡ dirección de mirada en pantalla)
  strokeBone(kickHip, -h*0.42, kickHip + h*0.05 + reach, -h*0.08 + lunge*h*0.02, sock, legW, ol);
  ctx.beginPath();
  ctx.ellipse(kickHip + h*0.05 + reach, -h*0.05 + lunge*h*0.02, h*0.09, h*0.05, 0.1, 0, Math.PI * 2);
  fillWithOutline(boot, ol, Math.max(0.35, olW * 0.18));

  ctx.rotate(-0.2*lunge);
  strokeBone(-h*0.15, -h*0.78, -h*0.28, -h*0.6, skin, legW*0.85, CARTOON.skinOutline);
  strokeBone(h*0.15, -h*0.78, h*0.32, -h*0.66, skin, legW*0.85, CARTOON.skinOutline);
  drawKitShorts(h, shorts, p.team);
  drawKitTorso(h, shirt, p.team);
  drawShirtBackNumber(p, h, 0, -h * 0.655);
  drawHeadHair(0, -h*0.92, h*0.09, h, false, vis);

  ctx.restore();
}

function drawSlideTackle(p, s, h){
  const a = p.tackleAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock, skin, boot, hair} = vis;
  const widthScale = p._drawWidthScale || 1;

  // estela de pasto/polvo detras del jugador, siguiendo la trayectoria del deslizamiento
  const slideDist = toGameUnits(getModeTackleDistance());
  const trailN = 5;
  for(let i=1;i<=trailN;i++){
    const tt = clamp(prog - i*0.07, 0, 1);
    const eased = 1-Math.pow(1-tt,2);
    const tx = a.startX + a.dirX*slideDist*eased;
    const ty = a.startY + a.dirY*slideDist*eased;
    const tp = project({x:tx,y:ty,z:0});
    ctx.beginPath();
    ctx.ellipse(tp.x, tp.y+2, h*0.16*(1-i/trailN*0.6), h*0.05, 0, 0, Math.PI*2);
    ctx.fillStyle = `rgba(225,225,190,${0.24*(1-i/trailN)})`;
    ctx.fill();
  }

  // Flip según dirección de deslizamiento en pantalla (no solo dirX mundo)
  const slideScreen = gameState === 'practice' ? a.dirY : a.dirX;
  const flip = slideScreen < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  // sombra alargada en el piso
  drawEntityShadow(0, 3, h*0.42, h*0.09, 0.35);
  ctx.scale(flip*widthScale,1);

  const ol = teamOutlineColor(p.team);
  const olW = outlineWidth(h);

  ctx.beginPath();
  ctx.ellipse(-h*0.02, -h*0.16, h*0.26, h*0.13, 0, 0, Math.PI * 2);
  fillWithOutline(litMaterial(shirt, h), ol, olW);
  ctx.beginPath();
  ctx.ellipse(h*0.14, -h*0.12, h*0.12, h*0.09, 0, 0, Math.PI * 2);
  fillWithOutline(flatMaterial(shorts), ol, olW * 0.85);
  strokeBone(h*0.2, -h*0.1, h*0.5, -h*0.03, sock, Math.max(2, h*0.1), ol);
  ctx.beginPath();
  ctx.ellipse(h*0.52, 0.0, h*0.095, h*0.055, 0.1, 0, Math.PI * 2);
  fillWithOutline(boot, ol, Math.max(0.35, olW * 0.18));
  strokeBone(-h*0.05, -h*0.08, h*0.02, -h*0.24, sock, Math.max(2, h*0.09), ol);
  strokeBone(-h*0.2, -h*0.22, -h*0.4, -h*0.06, skin, Math.max(2, h*0.08), CARTOON.skinOutline);
  ctx.beginPath();
  ctx.arc(-h*0.3, -h*0.22, h*0.085, 0, Math.PI * 2);
  fillWithOutline(skin, CARTOON.skinOutline, olW * 0.75);
  ctx.beginPath();
  ctx.arc(-h*0.32, -h*0.25, h*0.09, Math.PI * 0.8, Math.PI * 1.9);
  fillWithOutline(hair, ol, olW * 0.7);
  drawShirtBackNumber(p, h, -h*0.02, -h*0.16);

  ctx.restore();
}


function drawGKKick(p, s, h){
  const a = p.gkKickAnim;
  const prog = clamp(a.t / a.dur, 0, 1);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock, skin, boot} = vis;
  const flip = facingFlip(p);
  const widthScale = p._drawWidthScale || 1;

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 3, h*0.24, h*0.08, 0.32);

  if(a.type === 'dropkick'){
    const jump = Math.sin(prog * Math.PI);
    const offsetY = -jump * h * 0.4;
    const kickT = easeOutQuad(clamp((prog - 0.12) / 0.58, 0, 1));
    ctx.translate(0, offsetY);
    ctx.scale(flip*widthScale, 1);

    // pierna de apoyo
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2, h*0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h*0.06, -h*0.42); ctx.lineTo(-h*0.06, -h*0.04); ctx.stroke();
    ctx.fillStyle = boot;
    ctx.beginPath(); ctx.ellipse(-h*0.06, h*0.0, h*0.085, h*0.048, 0.1, 0, Math.PI*2); ctx.fill();

    // pierna de volea: muslo + pantorrilla estirados hacia adelante (lerp 300ms)
    const thighAngle = lerp(0.15, 1.55, kickT);
    const kneeAngle = lerp(0.35, 0.05, kickT);
    ctx.save();
    ctx.translate(h*0.06, -h*0.42);
    ctx.rotate(-thighAngle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h*0.24); ctx.stroke();
    ctx.translate(0, h*0.24);
    ctx.rotate(-kneeAngle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h*0.22); ctx.stroke();
    ctx.fillStyle = boot;
    ctx.beginPath(); ctx.ellipse(0, h*0.24, h*0.09, h*0.05, 0.12, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // torso inclinado hacia atras en el salto
    const lean = jump * 0.18;
    ctx.save();
    ctx.rotate(lean);
    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0, -h*0.48, h*0.14, h*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath(); ctx.ellipse(0, -h*0.66, h*0.16, h*0.17, 0, 0, Math.PI*2); ctx.fill();
    // brazos de equilibrio
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.085);
    ctx.beginPath(); ctx.moveTo(-h*0.1, -h*0.74); ctx.lineTo(-h*0.28, -h*0.58 - jump*h*0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.1, -h*0.74); ctx.lineTo(h*0.28, -h*0.58 - jump*h*0.12); ctx.stroke();
    // cabeza
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -h*0.84, h*0.09, 0, Math.PI*2); ctx.fill();
    drawHeadHair(0, -h*0.84, h*0.09, h, false, vis);
    drawShirtBackNumber(p, h, 0, -h * 0.655);
    ctx.restore();
  } else {
    // lanzamiento con la mano: brazo atras -> adelante (lerp 300ms)
    ctx.scale(flip*widthScale, 1);
    let throwShoulder, throwElbow;
    if(prog < 0.35){
      const t = prog / 0.35;
      throwShoulder = lerp(0.25, -1.15, t);
      throwElbow = lerp(0.45, 1.25, t);
    } else {
      const t = easeOutQuad((prog - 0.35) / 0.65);
      throwShoulder = lerp(-1.15, 1.45, t);
      throwElbow = lerp(1.25, 0.2, t);
    }

    // piernas quietas
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2, h*0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h*0.05, -h*0.42); ctx.lineTo(-h*0.05, -h*0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.05, -h*0.42); ctx.lineTo(h*0.05, -h*0.02); ctx.stroke();
    ctx.fillStyle = boot;
    ctx.beginPath(); ctx.ellipse(-h*0.05, h*0.01, h*0.085, h*0.048, 0.1, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.05, h*0.01, h*0.085, h*0.048, -0.1, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0, -h*0.48, h*0.14, h*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath(); ctx.ellipse(0, -h*0.66, h*0.16, h*0.17, 0, 0, Math.PI*2); ctx.fill();

    // brazo lanzador (derecho / delante segun flip)
    const shX = h*0.12, shY = -h*0.72;
    ctx.save();
    ctx.translate(shX, shY);
    ctx.rotate(-throwShoulder);
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.085); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h*0.18); ctx.stroke();
    ctx.translate(0, h*0.18);
    ctx.rotate(-throwElbow);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h*0.16); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, h*0.18, h*0.055, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // brazo de apoyo
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.08);
    ctx.beginPath(); ctx.moveTo(-h*0.12, -h*0.72); ctx.lineTo(-h*0.28, -h*0.52); ctx.stroke();

    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -h*0.84, h*0.09, 0, Math.PI*2); ctx.fill();
    drawHeadHair(0, -h*0.84, h*0.09, h, false, vis);
    drawShirtBackNumber(p, h, 0, -h * 0.655);
  }

  ctx.restore();
}

function gkDiveStretch(prog){
  const p = clamp(prog, 0, 1);
  const wind = clamp(p / 0.24, 0, 1);
  const windE = wind * wind * 0.14;
  const dive = clamp((p - 0.12) / 0.68, 0, 1);
  const diveE = 1 - Math.pow(1 - dive, 2.4);
  return windE + diveE * 0.86;
}

function gkDiveHold(prog){
  const p = clamp(prog, 0, 1);
  if(p < 0.78) return gkDiveStretch(p);
  return lerp(gkDiveStretch(0.78), gkDiveStretch(0.78) * 0.96, (p - 0.78) / 0.22);
}

function drawGKDive(p, s, h){
  const a = p.diveAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock, skin, boot} = vis;
  const flip = facingFlip(p);
  const widthScale = p._drawWidthScale || 1;
  const lateralSign = a.type === 'dive_left' ? -1
    : a.type === 'dive_right' ? 1
    : getLateralSignFromFacing(p, a.targetX ?? p.x, a.targetY ?? p.y, true);
  const sideSign = flip * lateralSign;

  if(a.type === 'catch' || a.animState === 'CATCH'){
    const eased = gkDiveStretch(prog) * 0.92;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(flip*widthScale, 1);
    drawEntityShadow(0, 3, h*0.28, h*0.08, 0.32);
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath();
    ctx.ellipse(0, -h*0.42 - eased*h*0.08, h*0.22, h*0.16, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = shorts;
    ctx.beginPath();
    ctx.ellipse(0, -h*0.24, h*0.18, h*0.11, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.09);
    ctx.beginPath(); ctx.moveTo(-h*0.18,-h*0.52); ctx.lineTo(-h*0.34,-h*0.72-eased*h*0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.18,-h*0.52); ctx.lineTo(h*0.34,-h*0.72-eased*h*0.12); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0,-h*0.58,h*0.09,0,Math.PI*2); ctx.fill();
    ctx.restore();
    return;
  }

  if(a.type === 'smother' || a.animState === 'SMOTHER'){
    const stretch = gkDiveStretch(prog);
    ctx.save();
    ctx.translate(s.x, s.y);
    drawEntityShadow(0, 3, h*0.22, h*0.07, 0.28);
    ctx.scale(flip*widthScale, 1);
    ctx.rotate(-0.42 * stretch);
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath();
    ctx.ellipse(h*0.12 * stretch, -h*0.14, h*0.34 * stretch, h*0.11, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shorts;
    ctx.beginPath();
    ctx.ellipse(-h*0.08, -h*0.06, h*0.13, h*0.08, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2, h*0.09); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h*0.14, -h*0.02); ctx.lineTo(-h*0.42, h*0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.02, -h*0.02); ctx.lineTo(h*0.28, h*0.06); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.08);
    ctx.beginPath(); ctx.moveTo(h*0.18, -h*0.22); ctx.lineTo(h*0.48 * stretch, -h*0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-h*0.12, -h*0.2); ctx.lineTo(-h*0.36 * stretch, -h*0.06); ctx.stroke();
    ctx.fillStyle = BROADCAST.gkHome;
    ctx.beginPath(); ctx.arc(h*0.48 * stretch, -h*0.08, h*0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(h*0.04, -h*0.24, h*0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  if(a.type === 'pounce' || a.type === 'low_dive' || a.animState === 'LOW_DIVE'){
    const stretch = gkDiveStretch(prog);
    ctx.save();
    ctx.translate(s.x, s.y);
    drawEntityShadow(0, 3, h*0.38 * stretch, h*0.08, 0.3);
    ctx.scale(sideSign*widthScale, 1);
    ctx.rotate(-0.58 * stretch);
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath();
    ctx.ellipse(h*0.14 * stretch, -h*0.08, h*0.32 * stretch, h*0.1, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shorts;
    ctx.beginPath();
    ctx.ellipse(-h*0.06, h*0.02, h*0.12, h*0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2, h*0.09); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h*0.12, h*0.04); ctx.lineTo(-h*0.46, h*0.1); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.08);
    ctx.beginPath(); ctx.moveTo(h*0.22, -h*0.12); ctx.lineTo(h*0.58 * stretch, -h*0.04); ctx.stroke();
    ctx.fillStyle = BROADCAST.gkHome;
    ctx.beginPath(); ctx.arc(h*0.58 * stretch, -h*0.04, h*0.065, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(h*0.06, -h*0.16, h*0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  if(a.type==='jump'){
    const scale = h/2;
    const jumpPhase = gkDiveStretch(prog);
    const airZ = jumpPhase * a.jumpHeight;
    const offsetY = -airZ*scale*1.65;
    const lean = jumpPhase;

    ctx.save();
    ctx.translate(s.x, s.y);
    // sombra en el piso (se queda abajo, no sube con el jugador)
    drawEntityShadow(0, 3, h*0.24*(1-lean*0.4), h*0.08, 0.32*(1-lean*0.35));

    ctx.translate(0, offsetY);
    ctx.scale(sideSign*widthScale,1);
    // piernas juntas, colgando/flexionadas
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.1); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-h*0.42); ctx.lineTo(h*0.06,-h*0.14+lean*h*0.05); ctx.stroke();
    // torso
    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath(); ctx.ellipse(0,-h*0.68,h*0.15,h*0.16,0,0,Math.PI*2); ctx.fill();
    // brazos bien arriba, estirados hacia la pelota
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.09);
    ctx.beginPath(); ctx.moveTo(-h*0.08,-h*0.8); ctx.lineTo(-h*0.22,-h*1.12*lean-h*0.75*(1-lean)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.08,-h*0.8); ctx.lineTo(h*0.22,-h*1.12*lean-h*0.75*(1-lean)); ctx.stroke();
    ctx.fillStyle = BROADCAST.gkHome;
    ctx.beginPath(); ctx.arc(-h*0.22,-h*1.12*lean-h*0.75*(1-lean), h*0.06,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(h*0.22,-h*1.12*lean-h*0.75*(1-lean), h*0.06,0,Math.PI*2); ctx.fill();
    // cabeza
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0,-h*0.9,h*0.09,0,Math.PI*2); ctx.fill();
    ctx.restore();
    return;
  }

  const stretch = gkDiveHold(prog);

  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 3, h*0.42, h*0.09, 0.32);

  ctx.save();
  ctx.scale(sideSign*widthScale, 1);
  ctx.rotate(-0.08 * stretch);
  ctx.fillStyle = litMaterial(shirt, h);
  ctx.beginPath();
  ctx.ellipse(h*0.08 * stretch, -h*0.22 * stretch - h*0.06, h*0.28 * stretch, h*0.13, -0.25, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.ellipse(-h*0.12, -h*0.12 * stretch, h*0.14, h*0.1, -0.15, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.1); ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-h*0.18, -h*0.08 * stretch); ctx.lineTo(-h*0.52, h*0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-h*0.08, -h*0.08 * stretch); ctx.lineTo(-h*0.38, h*0.06);
  ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.09);
  ctx.beginPath();
  ctx.moveTo(h*0.12, -h*0.38 * stretch - h*0.06); ctx.lineTo(h*0.52 * stretch, -h*0.58 * stretch - h*0.1);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(h*0.52 * stretch, -h*0.58 * stretch - h*0.1, h*0.07, 0, Math.PI*2);
  ctx.fillStyle = BROADCAST.gkHome; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(h*0.04, -h*0.34 * stretch - h*0.04); ctx.lineTo(h*0.38 * stretch, -h*0.48 * stretch - h*0.06);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(h*0.38 * stretch, -h*0.48 * stretch - h*0.06, h*0.065, 0, Math.PI*2);
  ctx.fillStyle = BROADCAST.gkHome; ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(h*0.02, -h*0.36 * stretch - h*0.08, h*0.09, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawAirStrike(p, s, h){
  const a = p.airStrikeAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const vis = playerVisuals(p);
  const {shirt, shorts, sock, skin, boot} = vis;
  const flip = facingFlip(p);
  const widthScale = p._drawWidthScale || 1;
  const scale = h/2;

  if(a.type==='header'){
    // salto de cabeza: se eleva, cuello estirado hacia la pelota
    const lean = Math.sin(clamp(prog,0,1)*Math.PI);
    const airZ = lean * physicsConfig.maxJumpHeight;
    const offsetY = -airZ*scale*1.7;
    ctx.save();
    ctx.translate(s.x, s.y);
    drawEntityShadow(0, 3, h*0.2*(1-lean*0.4), h*0.07, 0.30*(1-lean*0.35));
    ctx.translate(0, offsetY);
    ctx.scale(flip*widthScale,1);
    // piernas flexionadas
    ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.09); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-h*0.06,-h*0.4); ctx.lineTo(-h*0.14,-h*0.12+lean*h*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.06,-h*0.4); ctx.lineTo(h*0.16,-h*0.14+lean*h*0.06); ctx.stroke();
    // torso arqueado hacia atras
    ctx.fillStyle=shorts;
    ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.rotate(-0.22*lean);
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath(); ctx.ellipse(0,-h*0.7,h*0.16,h*0.18,0,0,Math.PI*2); ctx.fill();
    // brazos abiertos, para el equilibrio
    ctx.strokeStyle=skin; ctx.lineWidth=Math.max(2,h*0.08);
    ctx.beginPath(); ctx.moveTo(-h*0.12,-h*0.78); ctx.lineTo(-h*0.36,-h*0.68); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.12,-h*0.78); ctx.lineTo(h*0.36,-h*0.68); ctx.stroke();
    // cabeza, la parte protagonista, adelantada hacia la pelota
    ctx.fillStyle=skin;
    ctx.beginPath(); ctx.arc(0,-h*0.96,h*0.1,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.restore();
    return;
  }

  if(a.type==='volley' || a.type==='volley_power'){
    const powerShot = a.type === 'volley_power';
    // volea: pierna de pateo bien alta, cuerpo inclinado hacia atras para acompaÃ±ar
    const kick = Math.sin(clamp(prog,0,1)*Math.PI);
    const legLift = powerShot ? 0.58 : 0.44;
    const torsoLean = powerShot ? 0.38 : 0.28;
    ctx.save();
    ctx.translate(s.x, s.y);
    drawEntityShadow(0, 2, h*0.22, h*0.08, 0.35);
    ctx.scale(flip*widthScale,1);
    // pierna de apoyo
    ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.1); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-h*0.04,-h*0.4); ctx.lineTo(-h*0.09,-h*0.02); ctx.stroke();
    // pierna de volea, se eleva bien alto
    ctx.beginPath();
    ctx.moveTo(h*0.04,-h*0.42);
    ctx.lineTo(h*0.32, -h*0.42 - kick*h*legLift);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(h*0.32,-h*0.42-kick*h*legLift,h*0.06,h*0.035,0,0,Math.PI*2); ctx.fillStyle=boot; ctx.fill();
    // torso inclinado hacia atras acompaÃ±ando el gesto
    ctx.save();
    ctx.rotate(torsoLean*kick);
    ctx.fillStyle=shorts;
    ctx.beginPath(); ctx.ellipse(-h*0.02,-h*0.55,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = litMaterial(shirt, h);
    ctx.beginPath(); ctx.ellipse(-h*0.06,-h*0.76,h*0.15,h*0.17,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=skin; ctx.lineWidth=Math.max(2,h*0.08);
    ctx.beginPath(); ctx.moveTo(-h*0.18,-h*0.84); ctx.lineTo(-h*0.34,-h*0.62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.06,-h*0.84); ctx.lineTo(h*0.2,-h*0.98); ctx.stroke();
    ctx.fillStyle=skin;
    ctx.beginPath(); ctx.arc(-h*0.08,-h*0.98,h*0.09,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.restore();
    return;
  }

  // chilena (bicycle kick): cuerpo invertido, piernas en tijera hacia arriba
  const prog2 = clamp(prog,0,1);
  const flight = Math.sin(prog2*Math.PI); // sube y cae
  const rot = -0.55 - prog2*1.35; // el cuerpo gira hacia atras durante la chilena
  const airZ = flight*0.55;
  const offsetY = -airZ*scale*1.7;
  ctx.save();
  ctx.translate(s.x, s.y);
  drawEntityShadow(0, 3, h*0.22, h*0.07, 0.30);
  ctx.translate(0, offsetY);
  ctx.scale(flip*widthScale,1);
  ctx.save();
  ctx.rotate(rot);
  // torso, casi horizontal/invertido
  ctx.fillStyle = litMaterial(shirt, h);
  ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.17,h*0.14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=shorts;
  ctx.beginPath(); ctx.ellipse(-h*0.05,-h*0.32,h*0.12,h*0.09,0,0,Math.PI*2); ctx.fill();
  // piernas en tijera, una arriba pateando, otra abajo
  ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.1); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-h*0.1,-h*0.28); ctx.lineTo(-h*0.34,-h*0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h*0.12,-h*0.6); ctx.lineTo(h*0.4,-h*0.86); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(h*0.4,-h*0.86,h*0.06,h*0.035,0,0,Math.PI*2); ctx.fillStyle=boot; ctx.fill();
  // brazos, apoyo hacia el piso (cae de espaldas)
  ctx.strokeStyle=skin; ctx.lineWidth=Math.max(2,h*0.08);
  ctx.beginPath(); ctx.moveTo(-h*0.15,-h*0.42); ctx.lineTo(-h*0.4,-h*0.2); ctx.stroke();
  ctx.fillStyle=skin;
  ctx.beginPath(); ctx.arc(-h*0.2,-h*0.6,h*0.09,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBall(){
  const shadowS = project({x:ball.x, y:ball.y, z:0});
  const s = project({x:ball.x, y:ball.y, z:ball.z});
  const r = Math.max(3, s.s * BALL_RADIUS * 2.1);

  const heightAbove = Math.max(0, ball.z - BALL_RADIUS);
  const maxShadowHeight = 3.2;
  const heightT = clamp(heightAbove / maxShadowHeight, 0, 1);
  const shadowScale = 1.0 - heightT * 0.55;
  const shadowAlpha = 0.54 - heightT * 0.36;
  drawEntityShadow(
    shadowS.x,
    shadowS.y + 2,
    r * 0.92 * shadowScale,
    r * 0.36 * shadowScale,
    shadowAlpha,
  );

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ball.rollAngle);
  const olW = Math.max(1.4, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  fillWithOutline(CARTOON.ball, CARTOON.outlineDefault, olW);
  ctx.strokeStyle = CARTOON.ballPanel;
  ctx.lineWidth = Math.max(0.85, r * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  for(let i = 0; i < 5; i++){
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPowerBar(p){
  if(Game.isInputLocked) return;
  const setPieceWaiting = isSetPieceAwaitingExecution(p);
  const sceneAim = !!(Game.setPieceScene?.active && Game.setPieceScene.phase === 'aim'
    && (Game.setPieceScene.takerId === p.id || Game.setPieceScene.charging || SetPieceManager.isCharging));
  const gkCharging = !!(p.gkKickCharge?.isCharging);
  const gkHandsHold = isGkHandsPossession(p) && !p.gkKickAnim && !isGoalKickReadyState();
  const gkHandsSecs = gkHandsHold ? Math.max(0, (p.handsTimer || 0) / 1000) : 0;
  const gkHandsUrgent = gkHandsHold && gkHandsSecs > 0 && gkHandsSecs <= GK_AUTO_DISTRIBUTE.URGENT_SEC;
  const gkHandsBlink = gkHandsUrgent && Math.sin(performance.now() * 0.012) > 0;
  let level = 0;
  let pkType = null;
  if(gkCharging){
    level = p.gkKickCharge.powerBar ?? 0;
    pkType = p.gkKickCharge.kickType === 'dropkick' ? 'cross' : 'pass';
  } else if(sceneAim && (Game.setPieceScene.charging || SetPieceManager.isCharging || Game.setPieceScene.power > 0)){
    level = Game.setPieceScene.power || SetPieceManager.powerBar || 0;
    pkType = 'shot';
  } else if(setPieceWaiting && SetPieceManager.chargeType){
    level = SetPieceManager.powerBar;
    pkType = SetPieceManager.chargeType === 'short' ? 'pass'
      : (SetPieceManager.chargeType === 'medium' ? 'through' : 'cross');
  } else if(!setPieceWaiting){
    level = chargeLevel(p);
    const buf = p.actionBuffer;
    pkType = p.pendingKick ? p.pendingKick.type : (getBufferKickType(buf) || buf?.type || p.charging);
  }
  const chargingNow = !setPieceWaiting && !gkCharging && !sceneAim && (
    (p.charging && p.chargeStart > 0) ||
    (p.isChargingShot && p.chargeStart > 0) ||
    (p.actionBuffer?.chargeStart > 0)
  );
  const lockedBuffer = !setPieceWaiting && !sceneAim && !!(p.actionBuffer?.type && !p.actionBuffer?.chargeStart);
  const showGkHandsHud = gkHandsHold && gkHandsSecs > 0 && !setPieceWaiting;
  if(!setPieceWaiting && !gkCharging && !sceneAim && level <= 0 && !p.pendingKick && !chargingNow && !lockedBuffer && !showGkHandsHud) return;
  if(!setPieceWaiting && !gkCharging && !sceneAim && level <= 0 && !pkType && !chargingNow && !lockedBuffer && !p.isChargingShot && !showGkHandsHud) return;
  if(sceneAim && level <= 0 && !Game.setPieceScene.charging && !SetPieceManager.isCharging) return;
  const s = project({x:p.x,y:p.y,z:2.4});
  const w=54,h=8;
  ctx.save();
  ctx.translate(s.x-w/2, s.y);
  if(level > 0 || pkType){
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h);
    let col = pkType==='shot'? BROADCAST.powerShot : (pkType==='through'?BROADCAST.powerThrough:(pkType==='cross'?BROADCAST.powerCross:BROADCAST.powerPass));
    ctx.fillStyle=col; ctx.fillRect(2,2,(w-4)*level,h-4);
    ctx.strokeStyle=BROADCAST.lineWhite; ctx.lineWidth=1; ctx.strokeRect(0,0,w,h);
    if(gkHandsBlink){
      ctx.strokeStyle = 'rgba(255,82,82,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-1, -1, w + 2, h + 2);
    }
  } else if(showGkHandsHud){
    const frac = clamp(gkHandsSecs / GK_AUTO_DISTRIBUTE.TIME_SEC, 0, 1);
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = gkHandsUrgent ? BROADCAST.urgent : BROADCAST.powerPass;
    ctx.fillRect(2, 2, (w - 4) * frac, h - 4);
    ctx.strokeStyle = gkHandsBlink ? BROADCAST.urgent : BROADCAST.lineWhite;
    ctx.lineWidth = gkHandsBlink ? 2 : 1;
    ctx.strokeRect(0, 0, w, h);
  }
  if(setPieceWaiting && SetPieceManager.timer > 0){
    const urgent = SetPieceManager.timer <= SET_PIECE_COUNTDOWN_URGENT;
    const setBlink = urgent && Math.sin(performance.now() * 0.012) > 0;
    ctx.fillStyle = urgent ? BROADCAST.urgent : BROADCAST.lineWhite;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(SetPieceManager.timer).toString(), w / 2, level > 0 ? -5 : h + 12);
    if(setBlink && level > 0){
      ctx.strokeStyle = 'rgba(255,82,82,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-1, -1, w + 2, h + 2);
    }
  } else if(showGkHandsHud){
    ctx.fillStyle = gkHandsUrgent ? BROADCAST.urgent : BROADCAST.lineWhite;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(gkHandsSecs).toString(), w / 2, level > 0 ? -5 : h + 12);
  }
  ctx.restore();
}


/* ============================================================
   RADAR (minimapa) â€” vista cenital fija en una esquina, estilo TV/videojuego
   ============================================================ */
const RADAR_W = 190;
const RADAR_H = RADAR_W * (FIELD_W/FIELD_L); // mantiene la proporcion real de la cancha
const RADAR_MARGIN = 16;
const RADAR_PAD = 8; // padding interno para que los puntos no queden pegados al borde

function radarBox(){
  return {
    x: canvas.width/2 - RADAR_W/2,   // centrado abajo, como en cualquier juego de futbol
    y: canvas.height - RADAR_H - RADAR_MARGIN,
    w: RADAR_W, h: RADAR_H
  };
}
function radarPoint(box, wx, wy){
  return {
    x: box.x + RADAR_PAD + (wx/FIELD_L) * (box.w - RADAR_PAD*2),
    // OJO: el mundo tiene y=0 en la banda MAS CERCA de la camara (la que en la vista principal
    // queda abajo de la pantalla, ver project()/depthOf) y y=FIELD_W en la banda mas lejana
    // (la que en la vista principal queda arriba, cerca del horizonte). El radar tiene que
    // respetar ese mismo sentido: banda cercana ABAJO del radar, banda lejana ARRIBA. Antes
    // esto estaba sin invertir y quedaba al reves respecto de la vista principal.
    y: box.y + RADAR_PAD + (1 - wy/FIELD_W) * (box.h - RADAR_PAD*2)
  };
}

function drawRadar(){
  const box = radarBox();
  ctx.save();

  // --- fondo de cancha (muy sutil) ---
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = BROADCAST.radarBg;
  roundRectPath(box.x-6, box.y-6, box.w+12, box.h+12, 8);
  ctx.fill();
  ctx.fillStyle = BROADCAST.radarGrass;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // --- bordes y lineas de cancha ---
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = BROADCAST.lineWhite;
  ctx.lineWidth = 1.5;
  roundRectPath(box.x-6, box.y-6, box.w+12, box.h+12, 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  // linea media
  ctx.beginPath();
  ctx.moveTo(box.x + box.w/2, box.y); ctx.lineTo(box.x + box.w/2, box.y+box.h);
  ctx.stroke();
  // circulo central
  ctx.beginPath();
  ctx.ellipse(box.x+box.w/2, box.y+box.h/2, box.h*0.14, box.h*0.14, 0, 0, Math.PI*2);
  ctx.stroke();
  // areas chicas (a modo de referencia visual)
  const areaW = box.w * (SBOX_D/FIELD_L);
  const areaH = box.h * ((SBOX_HALFW*2)/FIELD_W);
  ctx.strokeRect(box.x, box.y+box.h/2-areaH/2, areaW, areaH);
  ctx.strokeRect(box.x+box.w-areaW, box.y+box.h/2-areaH/2, areaW, areaH);

  // --- jugadores y pelota ---
  ctx.globalAlpha = 0.65;
  for(const p of allPlayers){
    const isCtrl = isControlledByHuman(p);
    const isPressure = isPressureCursorPlayer(p);
    const rp = radarPoint(box, p.x, p.y);
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, isCtrl ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = p.team === 'home' ? BROADCAST.teamHome : BROADCAST.teamAway;
    ctx.fill();
    if(isCtrl){
      ctx.strokeStyle = p.id === Game.controlledId2 ? BROADCAST.cursorP2 : BROADCAST.cursorP1;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 4.6, 0, Math.PI * 2);
      ctx.stroke();
    } else if(isPressure){
      ctx.strokeStyle = 'rgba(148,148,148,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 3.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const rb = radarPoint(box, ball.x, ball.y);
  ctx.beginPath();
  ctx.arc(rb.x, rb.y, 2.4, 0, Math.PI*2);
  ctx.fillStyle = BROADCAST.lineWhite; ctx.fill();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 0.8; ctx.stroke();

  ctx.globalAlpha = 1.0;
  ctx.restore();
}
function roundRectPath(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// cruz amarilla en el pasto que marca donde picará una pelota aérea
function drawLandingCrossAt(wx, wy, fade){
  const pr = project({x: wx, y: wy, z: 0});
  const size = Math.max(6, pr.s * 0.55);
  const lw = Math.max(2, pr.s * 0.09);
  const olw = lw + Math.max(0.8, pr.s * 0.025);
  ctx.save();
  ctx.globalAlpha = 0.92 * fade;
  ctx.lineCap = 'round';
  const drawX = (stroke, width)=>{
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pr.x - size, pr.y - size * 0.42); ctx.lineTo(pr.x + size, pr.y + size * 0.42);
    ctx.moveTo(pr.x + size, pr.y - size * 0.42); ctx.lineTo(pr.x - size, pr.y + size * 0.42);
    ctx.stroke();
  };
  drawX('rgba(0,0,0,0.38)', olw);
  drawX('#F5C400', lw);
  ctx.restore();
}

function drawCrossMarker(){
  if(ball.owner || ball.lastKickType !== 'cross') return;

  if(Game.landingPoint){
    drawLandingCrossAt(Game.landingPoint.x, Game.landingPoint.y, 1);
    return;
  }
  const m = Game.crossMarker;
  if(!m) return;
  drawLandingCrossAt(m.x, m.y, clamp(m.t / 0.4, 0, 1));
}
function drawKickoffCountdownHud(){
  if(Game.matchState !== STATE_KICKOFF || Game.isBallInPlay || KickoffManager.executed || KickoffManager.timer <= 0) return;
  const urgent = KickoffManager.timer <= SET_PIECE_COUNTDOWN_URGENT;
  const secs = Math.ceil(KickoffManager.timer);
  ctx.save();
  ctx.textAlign = 'center';
  roundRectPath(canvas.width / 2 - 72, 72, 144, 52, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();
  ctx.strokeStyle = urgent ? 'rgba(255,82,82,0.85)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = urgent ? BROADCAST.urgent : BROADCAST.lineWhite;
  ctx.font = 'bold 26px Arial';
  ctx.fillText(String(secs), canvas.width / 2, 104);
  ctx.font = '11px Arial';
  ctx.fillStyle = urgent ? BROADCAST.urgentSoft : BROADCAST.textMuted;
  ctx.fillText('Saque de centro', canvas.width / 2, 118);
  ctx.restore();
}

function drawSetPieceCountdownHud(){
  if(!Game.setPieceMode || Game.isBallInPlay || SetPieceManager.executed || SetPieceManager.timer <= 0) return;
  const sp = Game.setPiece;
  if(!sp) return;
  const labels = {
    [SET_PIECE.GOAL_KICK]: 'Saque de arco',
    [SET_PIECE.CORNER]: 'Corner',
    [SET_PIECE.THROW_IN]: 'Saque lateral',
    [SET_PIECE.FREE_KICK]: 'Tiro libre',
    [SET_PIECE.PENALTY]: 'Penal',
  };
  const urgent = SetPieceManager.timer <= SET_PIECE_COUNTDOWN_URGENT;
  const secs = Math.ceil(SetPieceManager.timer);
  ctx.save();
  ctx.textAlign = 'center';
  roundRectPath(canvas.width / 2 - 72, 72, 144, 52, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();
  ctx.strokeStyle = urgent ? 'rgba(255,82,82,0.85)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = urgent ? BROADCAST.urgent : BROADCAST.lineWhite;
  ctx.font = 'bold 26px Arial';
  ctx.fillText(String(secs), canvas.width / 2, 104);
  ctx.font = '11px Arial';
  ctx.fillStyle = urgent ? BROADCAST.urgentSoft : BROADCAST.textMuted;
  ctx.fillText(labels[sp.type] || 'Pelota parada', canvas.width / 2, 118);
  ctx.restore();

  // Sin retícula: la dirección va por stick y la altura por potencia (HUD de escena en drawFieldFrontal2D).

  if(gameState === 'practice' && Game.practiceMode === 'fk_place'){
    // Hint ya dibujado en drawFkPlacementField; solo resaltar balón.
    const pr = project({ x: ball.x, y: ball.y, z: 0 });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,80,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, Math.max(10, pr.s * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Vista cenital táctica para ubicar el tiro libre (plano XY, no broadcast lateral).
 */
function drawFkPlacementField(){
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#2f6b36';
  ctx.fillRect(0, 0, w, h);

  // Cancha
  const tl = project({ x: 0, y: 0, z: 0 });
  const br = project({ x: FIELD_L, y: FIELD_W, z: 0 });
  const x0 = Math.min(tl.x, br.x);
  const y0 = Math.min(tl.y, br.y);
  const x1 = Math.max(tl.x, br.x);
  const y1 = Math.max(tl.y, br.y);
  ctx.fillStyle = '#3d8f45';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  // Mitad y áreas (aprox)
  const mid = project({ x: FIELD_L * 0.5, y: CENTER.y, z: 0 });
  ctx.beginPath();
  ctx.moveTo(mid.x, y0);
  ctx.lineTo(mid.x, y1);
  ctx.stroke();

  strokeWorldPts([
    { x: FIELD_L, y: CENTER.y - PBOX_HALFW },
    { x: FIELD_L - PBOX_D, y: CENTER.y - PBOX_HALFW },
    { x: FIELD_L - PBOX_D, y: CENTER.y + PBOX_HALFW },
    { x: FIELD_L, y: CENTER.y + PBOX_HALFW },
  ], false, 'rgba(255,255,255,0.65)', 1.8);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Vista cenital — mové el balón · confirmá con X', w / 2, 28);
  const dist = Math.hypot(FIELD_L - ball.x, CENTER.y - ball.y);
  ctx.fillStyle = dist <= 35 ? 'rgba(255,220,120,0.95)' : 'rgba(180,220,255,0.95)';
  ctx.fillText(dist <= 35 ? `Distancia ${dist.toFixed(0)} m · barrera 5` : `Distancia ${dist.toFixed(0)} m · sin barrera`, w / 2, 48);
  ctx.restore();
}

function render(){
  if(fieldGrassEl) fieldGrassEl.classList.toggle('practice', gameState === 'practice' && isPracticeOpenPlay());
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const useFkPlace = isFkPlacementVisualActive();
  const useFrontal2D = !useFkPlace && isFrontal2DSceneActive();
  const usePracticeCam = !useFrontal2D && !useFkPlace && gameState === 'practice' && isPracticeOpenPlay();
  const horizonFrac = useFrontal2D ? 0.18 : (useFkPlace ? 0.12 : (usePracticeCam ? PCAM.horizonFrac : CAM.horizonFrac));
  const groundFrac = useFrontal2D ? FCAM.groundFrac : (usePracticeCam ? PCAM.groundFrac : CAM.groundFrac);

  drawStadiumAtmosphere();
  drawSkyBackground(horizonFrac);
  if(!useFkPlace){
    drawStadiumLights(horizonFrac);
    drawHorizonHaze(horizonFrac);
  }

  if(useFkPlace) drawFkPlacementField();
  else if(useFrontal2D) drawFieldFrontal2D();
  else if(usePracticeCam) drawFieldPractice();
  else drawField();
  if(!useFrontal2D && !useFkPlace) drawFieldDepthHaze(horizonFrac, groundFrac);
  drawCrossMarker();

  // En menú no hay partido activo: saltear entidades, HUD y radar
  if(!Game.running) return;

  const renderPlayers = gameState === 'practice' ? getPracticeRenderPlayers() : allPlayers;
  for(const p of renderPlayers) updatePlayerMeshDir8(p);
  const drawable = [...renderPlayers, ball].sort((a,b)=> paintDepth(b)-paintDepth(a));
  for(const ent of drawable){
    if(ent instanceof Ball) drawBall();
    else drawPlayer(ent, isControlledByHuman(ent));
  }
  // Cursores en capa superior (nunca ocluidos por cuerpo/número)
  drawTimeFinishBallFlash();
  drawPlayerSelectionCursors(renderPlayers);
  const cp = controlledPlayer();
  if(cp) drawPowerBar(cp);
  if(Game.twoPlayerMode){
    const cp2 = controlledPlayer2();
    if(cp2) drawPowerBar(cp2);
  }
  drawSetPieceCountdownHud();
  if(gameState!=='practice') drawRadar();
}
function isControlledByHuman(p){
  return p.id===Game.controlledId || (Game.twoPlayerMode && p.id===Game.controlledId2);
}
function drawCelebrationPrompt(){
  // UI de festejo deshabilitada — la logica de gameplay se mantiene intacta.
}
export { pathFromWorldPts, strokeWorldPts, circleWorldPts, drawStadiumFloor, drawGrassBands, drawOutZoneShade, drawField, drawDebugBoundaries, drawGoalArea, drawGoal, drawFieldPractice, drawFieldFrontal2D, teamColors, drawSpamDuelMeter, drawPlayer, drawCelebAnim, drawStylizedBody, drawCelebRunPhase, drawCelebSiuu, drawCelebTopo, drawCelebMbappe, drawCelebRobot, rotateBone, easeOutQuad, kickImpactCurve, drawLegBone, drawArmBone, smoothPose, drawNormalPose, drawHeadHair, drawStandTackle, drawSlideTackle, drawGKKick, drawGKDive, drawAirStrike, drawBall, drawPowerBar, radarBox, radarPoint, drawRadar, roundRectPath, drawCrossMarker, drawSetPieceCountdownHud, render, isControlledByHuman, drawCelebrationPrompt };

