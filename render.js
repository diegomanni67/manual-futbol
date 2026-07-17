"use strict";

import { AIR_SPAM_METER_MAX, BALL_RADIUS, Ball, CAM, CCIRCLE_R, CENTER, CROSSBAR_Z, DEBUG_BOUNDARIES, FIELD_L, FIELD_W, GOAL_DEPTH, GOAL_HALF, GOAL_NET_COLS, GOAL_NET_DEPTH_SHRINK, GOAL_NET_ROWS, GOAL_ZONE_DEPTH, Game, KickoffManager, PBOX_D, PBOX_HALFW, PCAM, SBOX_D, SBOX_HALFW, SET_PIECE, SET_PIECE_COUNTDOWN_URGENT, SLIDE_DISTANCE, STADIUM_FLOOR_PAD, SetPieceManager, STATE_KICKOFF, TOUCH_KICK_REACH, allPlayers, ball, canvas, clamp, controlledPlayer, controlledPlayer2, ctx, depthOf, drawPlayerMeshDir8Prototype, facingFlip, fieldGrassEl, gameState, isAirSpamWindowActive, BASE_FIELD_L } from './state.js';

import { isCelebrationMode, isHumanTeam, isSetPieceAwaitingExecution, lastDt, lerp, movePlayer, paintDepth, physicsConfig, practiceGK, practicePlayer, project, projectPractice, setupPractice, touchKickCurve, updatePlayerMeshDir8, getAnimVisualSpeed } from './state.js';

import { BoundaryWalls, GOAL_FRAMES, OutZone, fieldBoundary, stadiumBounds } from './physics.js';

import { chargeLevel, getBufferKickType } from './input.js';

/* ============================================================
   RENDER — CANCHA
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

function drawStadiumFloor(){
  const pad = STADIUM_FLOOR_PAD;
  const sb = stadiumBounds;
  const x0 = sb.xMin - pad, x1 = sb.xMax + pad;
  const y0 = sb.yMin - pad, y1 = sb.yMax + pad;
  ctx.fillStyle = '#243828';
  pathFromWorldPts([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], true);
  ctx.fill();
}

function drawGrassBands(xMin, xMax, yMin, yMax, bands){
  for(let i=0;i<bands;i++){
    const x0 = xMin + (xMax - xMin) * (i / bands);
    const x1 = xMin + (xMax - xMin) * ((i + 1) / bands);
    ctx.fillStyle = i % 2 === 0 ? '#1c7a34' : '#1a7230';
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
  ctx.fillStyle = 'rgba(28, 48, 34, 0.38)';
  pathFromWorldPts([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], true);
  ctx.fill();
}

function drawField(){
  drawStadiumFloor();
  const sb = stadiumBounds;
  const grassBands = Math.max(12, Math.round(12 * (FIELD_L / BASE_FIELD_L)));
  // cesped con franjas (zona de juego + OutZone inmediata)
  drawGrassBands(sb.xMin, sb.xMax, sb.yMin, sb.yMax, grassBands);
  ctx.save();
  ctx.globalAlpha = 0.14;
  const shade = ctx.createLinearGradient(0, canvas.height * CAM.horizonFrac, 0, canvas.height * CAM.groundFrac);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  pathFromWorldPts([
    {x:sb.xMin,y:sb.yMin},{x:sb.xMax,y:sb.yMin},{x:sb.xMax,y:sb.yMax},{x:sb.xMin,y:sb.yMax}
  ], true);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();
  // lineas
  const LW = 2.2, col='#eaffea';
  ctx.globalAlpha = 0.96;
  strokeWorldPts([{x:0,y:0},{x:FIELD_L,y:0},{x:FIELD_L,y:FIELD_W},{x:0,y:FIELD_W}], true, col, LW);
  strokeWorldPts([{x:CENTER.x,y:0},{x:CENTER.x,y:FIELD_W}], false, col, LW);
  strokeWorldPts(circleWorldPts(CENTER.x,CENTER.y,CCIRCLE_R,40), true, col, LW);
  ctx.fillStyle=col;
  const cs=project({x:CENTER.x,y:CENTER.y,z:0}); ctx.beginPath(); ctx.arc(cs.x,cs.y,3,0,7); ctx.fill();

  // areas
  [0, FIELD_L].forEach(goalX=> drawGoalArea(goalX));
  ctx.globalAlpha = 1;

  // arcos (postes) — proporciones reales, tal como en arco_ok.html
  [0, FIELD_L].forEach(goalX=> drawGoal(goalX));

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
  const LW = 2.6, col='#ffffff';
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
  const spot=project({x:goalX+dir*11,y:CENTER.y,z:0});
  ctx.beginPath(); ctx.arc(spot.x,spot.y,2.6,0,7); ctx.fill();
}

// arco (postes + red) de UN lado — proporciones reales, tal como en arco_ok.html: sin escalado
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

    // red: ya no es un panel plano pegado al fondo — es una "bolsa" 3D real armada con dos paredes
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

    ctx.strokeStyle = 'rgba(187,187,187,0.5)'; ctx.lineWidth = 1; // #BBBBBB, opacidad liviana

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

    // --- caños de sosten: delanteros (travesano+postes) y traseros (verticales en el piso) mas los
    // dos caños diagonales de techo — se dibujan DESPUES de toda la grilla de red de arriba, para
    // que la red quede siempre detras de la estructura del arco (requisito 3) ---
    const back1=project(backEdge(-1,0)), back2=project(backEdge(-1,1));
    const back3=project(backEdge(1,1)),  back4=project(backEdge(1,0));
    ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p2.x,p2.y); ctx.lineTo(back2.x,back2.y); ctx.stroke(); // caño de techo izq
    ctx.beginPath(); ctx.moveTo(p3.x,p3.y); ctx.lineTo(back3.x,back3.y); ctx.stroke(); // caño de techo der
    ctx.beginPath(); ctx.moveTo(back1.x,back1.y); ctx.lineTo(back2.x,back2.y); ctx.stroke(); // poste trasero izq
    ctx.beginPath(); ctx.moveTo(back4.x,back4.y); ctx.lineTo(back3.x,back3.y); ctx.stroke(); // poste trasero der
    // postes y travesano delanteros (por delante de todo)
    ctx.strokeStyle='#f5f5f5'; ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.stroke();
}

/* ============================================================
   CANCHA — ARENA DE PRACTICA: perspectiva longitudinal (regla 1). Solo se dibuja el arco del
   fondo (el objetivo), el tramo de cancha entre la camara y ese arco, y su area — las lineas
   laterales convergen naturalmente hacia el horizonte porque usan la misma project() de arriba,
   ahora con el eje de profundidad en X (ver projectPractice). El otro arco (detras de la camara)
   y el circulo central no se dibujan: quedan fuera de cuadro, como en una arena de entrenamiento.
   ============================================================ */
function drawFieldPractice(){
  drawStadiumFloor();
  const nearX = Math.max(stadiumBounds.xMin, PCAM.x - 3);
  const farX = FIELD_L + 3;

  // cesped con franjas transversales (perpendiculares al eje de la camara, para reforzar la fuga)
  drawGrassBands(nearX, farX, stadiumBounds.yMin, stadiumBounds.yMax, 10);

  ctx.save();
  ctx.globalAlpha = 0.12;
  const shade = ctx.createLinearGradient(0, canvas.height * PCAM.horizonFrac, 0, canvas.height * PCAM.groundFrac);
  shade.addColorStop(0, 'rgba(0,0,0,0.5)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  pathFromWorldPts([
    {x:nearX,y:stadiumBounds.yMin},{x:farX,y:stadiumBounds.yMin},
    {x:farX,y:stadiumBounds.yMax},{x:nearX,y:stadiumBounds.yMax}
  ], true);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();
  const LW = 2.2, col='#eaffea';
  ctx.globalAlpha = 0.96;
  // lineas laterales (banda): van desde bien cerca de la camara hasta la linea de fondo del arco
  // objetivo, y convergen hacia un unico punto de fuga en el horizonte (requisito 1)
  strokeWorldPts([{x:nearX,y:0},{x:FIELD_L,y:0}], false, col, LW);
  strokeWorldPts([{x:nearX,y:FIELD_W},{x:FIELD_L,y:FIELD_W}], false, col, LW);
  // linea de fondo (linea de gol) del arco objetivo
  strokeWorldPts([{x:FIELD_L,y:0},{x:FIELD_L,y:FIELD_W}], false, col, LW);
  // area penal + area chica del arco objetivo (mismas lineas que en partido, con la misma fuga)
  drawGoalArea(FIELD_L);
  ctx.globalAlpha = 1;

  // arco del fondo, centrado arriba de la pantalla (requisito 1)
  drawGoal(FIELD_L);
}

/* ============================================================
   RENDER — JUGADOR (figura articulada, no cilindro)
   ============================================================ */
function teamColors(p){
  let shirt, shorts, sock;
  if(p.role==='GK'){ shirt = p.team==='home'?'#e8c400':'#26c281'; shorts='#222'; sock=shirt; }
  else if(p.team==='home'){ shirt='#2f6fe0'; shorts='#12234a'; sock='#2f6fe0'; }
  else { shirt='#d63b3b'; shorts='#1b1b1b'; sock='#d63b3b'; }
  return {shirt, shorts, sock};
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

function drawPlayer(p, isControlledFlag){
  const s = project({x:p.x,y:p.y,z:0});
  const scale = s.s;
  const h = 2.0*scale; // alto aproximado del jugador en px

  if(p.celebAnim) drawCelebAnim(p, s, h);
  else if(p.tackleAnim && p.tackleAnim.type==='slide') drawSlideTackle(p, s, h);
  else if(p.tackleAnim && p.tackleAnim.type==='stand') drawStandTackle(p, s, h);
  else if(p.diveAnim) drawGKDive(p, s, h);
  else if(p.gkKickAnim) drawGKKick(p, s, h);
  else if(p.airStrikeAnim) drawAirStrike(p, s, h);
  else drawNormalPose(p, s, h);

  drawSpamDuelMeter(p, s, h);

  // indicador de jugador controlado (amarillo = jugador 1, naranja = jugador 2 en modo 2P)
  if(isControlledFlag){
    const markColor = (Game.twoPlayerMode && p.id===Game.controlledId2) ? '#ff9d00' : '#fff700';
    ctx.save();
    ctx.strokeStyle=markColor; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y+2, h*0.27, h*0.09, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x-6, s.y-h-10); ctx.lineTo(s.x+6, s.y-h-10); ctx.lineTo(s.x, s.y-h-2); ctx.closePath();
    ctx.fillStyle=markColor; ctx.fill();
    ctx.restore();
  }
  if(ball.owner===p){
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(s.x,s.y+2,h*0.3,h*0.1,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

/* ============================================================
   FESTEJOS ICONICOS — dibujo. Gracias a que los jugadores son graficos geometricos/simples, los 4
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
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';

  ctx.rotate(rotate);
  ctx.scale(flip*scaleX, scaleY);

  const legW = Math.max(2, h*0.09);
  ctx.strokeStyle = sock; ctx.lineWidth = legW; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-h*0.05, -h*0.42);
  ctx.lineTo(-h*0.05 + Math.sin(legSwing)*h*0.16, -h*0.02 + Math.abs(Math.cos(legSwing))*h*0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h*0.05, -h*0.42);
  ctx.lineTo(h*0.05 - Math.sin(legSwing)*h*0.16, -h*0.02 + Math.abs(Math.cos(legSwing))*h*0.02);
  ctx.stroke();
  ctx.fillStyle='#111';
  ctx.beginPath();ctx.ellipse(-h*0.05 + Math.sin(legSwing)*h*0.16, -h*0.01, h*0.05,h*0.03,0,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(h*0.05 - Math.sin(legSwing)*h*0.16, -h*0.01, h*0.05,h*0.03,0,0,7);ctx.fill();

  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.moveTo(-h*0.15,-h*0.55); ctx.lineTo(h*0.15,-h*0.55); ctx.lineTo(h*0.13,-h*0.38); ctx.lineTo(-h*0.13,-h*0.38);
  ctx.closePath(); ctx.fill();

  if(!opts.hideArms){
    ctx.strokeStyle = skin; ctx.lineWidth = legW*0.85;
    ctx.beginPath();
    ctx.moveTo(-h*0.15,-h*0.78);
    ctx.lineTo(-h*0.15+Math.sin(armSwing)*h*0.13, -h*0.62);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h*0.15,-h*0.78);
    ctx.lineTo(h*0.15-Math.sin(armSwing)*h*0.13, -h*0.62);
    ctx.stroke();
  }

  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(-h*0.17,-h*0.8);
  ctx.quadraticCurveTo(-h*0.19,-h*0.58,-h*0.14,-h*0.53);
  ctx.lineTo(h*0.14,-h*0.53);
  ctx.quadraticCurveTo(h*0.19,-h*0.58,h*0.17,-h*0.8);
  ctx.quadraticCurveTo(0,-h*0.88,-h*0.17,-h*0.8);
  ctx.closePath(); ctx.fill();

  // el numero de camiseta va en la ESPALDA, no en el pecho: solo se dibuja cuando opts.backView
  // esta activo (festejo de espaldas a la camara), igual que en drawNormalPose. Con esto se
  // corrige que antes se viera siempre el numero aunque el festejo fuera de frente.
  const backView = !!opts.backView;
  if(backView){
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.font = Math.max(6,h*0.14)+'px Arial'; ctx.textAlign='center';
    ctx.fillText(String(p.number), 0, -h*0.62);
  }
  drawHeadHair(0, -h*0.92, h*0.09, h, backView);
}

// fase comun a los 4 festejos (primeros 0.5s): corren unos metros hacia la mitad de la cancha
// antes de empezar el gesto especifico — nadie festeja parado en seco donde convirtio.
function drawCelebRunPhase(p, s, h, t){
  const legSwing = Math.sin(t*20) * 0.9;
  const armSwing = Math.sin(t*20+Math.PI) * 0.7;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
  drawStylizedBody(p, h, {legSwing, armSwing});
  ctx.restore();
}

// BOTON X ("Siuuuu" de Cristiano Ronaldo): corre de frente hacia la mitad de cancha, da un salto
// vertical (sin invertirse ni girar el cuerpo) y al caer queda DE ESPALDAS a la camara — unico
// festejo que termina asi — abriendo los dos brazos en diagonal hacia abajo y hacia atras, en la
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
  ctx.beginPath();
  ctx.ellipse(0, h*0.02 - jumpPx*0.12, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
  drawStylizedBody(p, h, {legSwing, armSwing, scaleX, scaleY, hideArms:landed, backView:landed});

  if(landed){
    const skin='#e6b98c';
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
// (brazo en angulo, no estirado) para llevar las manos, ahuecadas, justo pegadas a las orejas —
// como diciendo "no los escucho".
function drawCelebTopo(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }
  const t2 = t - 0.5;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
  drawStylizedBody(p, h, {legSwing:0, hideArms:true});

  if(t2>0.08){
    const raise = clamp(t2/0.3, 0, 1); // el codo sube y se abre hacia afuera, y la mano se pega a la oreja
    const skin='#e6b98c';
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
// sobre el pecho en una pose serena y erguida — cada mano queda apoyada sobre el hombro/biceps
// opuesto (no solo dos lineas que se tocan en el medio), el brazo derecho cruza por encima.
function drawCelebMbappe(p, s, h, a){
  const t = a.t;
  if(t < 0.5){ drawCelebRunPhase(p, s, h, t); return; }
  const t2 = t - 0.5;
  const scaleY = t2<0.15 ? lerp(1, 0.94, clamp(t2/0.15,0,1)) : (t2<0.3 ? lerp(0.94,1,clamp((t2-0.15)/0.15,0,1)) : 1);
  const chinUp = -0.025; // apenas erguido hacia atras, pose calma y firme

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.26, h*0.09, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
  drawStylizedBody(p, h, {legSwing:0.03, scaleY, rotate:chinUp, hideArms:true});

  if(t2 >= 0.1){
    const crossT = clamp((t2-0.1)/0.25, 0, 1); // los brazos se cruzan progresivamente sobre el pecho
    const skin='#e6b98c';
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
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
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
             -> Hombro Izq/Der -> Brazo -> Antebrazo -> Muñeca/Mano
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
function drawLegBone(hipX, hipY, thighLen, calfLen, thighAngle, kneeAngle, footAngle, sockColor, legW){
  ctx.save();
  ctx.translate(hipX, hipY);          // PIVOTE: cadera
  rotateBone(thighAngle);
  ctx.strokeStyle = sockColor; ctx.lineWidth = legW; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, thighLen); ctx.stroke(); // muslo

  ctx.translate(0, thighLen);         // PIVOTE: rodilla (union muslo->pantorrilla)
  rotateBone(kneeAngle);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, calfLen); ctx.stroke(); // pantorrilla

  ctx.translate(0, calfLen);          // PIVOTE: tobillo (union pantorrilla->pie)
  rotateBone(footAngle);
  // pie: del tobillo hacia la punta. Con footAngle alto (plantiflexion) el pie queda "en punta",
  // exactamente el gesto que se pide para el instante del impacto del tiro.
  const footLen = calfLen*0.42;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(footLen*0.5, footLen*0.12, footLen*0.62, footLen*0.34, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  return {footLen}; // por si el llamador necesita saber donde quedo la punta (contacto con la pelota)
}

// dibuja UN brazo completo (hombro->brazo->codo->antebrazo->muñeca->mano)
function drawArmBone(shX, shY, upperLen, foreLen, shoulderAngle, elbowAngle, wristAngle, skinColor, legW){
  ctx.save();
  ctx.translate(shX, shY);            // PIVOTE: hombro
  rotateBone(shoulderAngle);
  ctx.strokeStyle = skinColor; ctx.lineWidth = legW*0.85; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, upperLen); ctx.stroke(); // brazo (humero)

  ctx.translate(0, upperLen);         // PIVOTE: codo
  rotateBone(elbowAngle);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, foreLen); ctx.stroke(); // antebrazo

  ctx.translate(0, foreLen);          // PIVOTE: muñeca (bamboleo relajado al esprintar)
  rotateBone(wristAngle);
  ctx.fillStyle = skinColor;
  ctx.beginPath(); ctx.arc(0, foreLen*0.16, legW*0.4, 0, Math.PI*2); ctx.fill(); // mano
  ctx.restore();
}

// Suaviza CUALQUIER pose (objeto plano o anidado un nivel, ej. {legA:{thigh,knee,foot}, neckTilt:n})
// hacia sus valores objetivo con una interpolacion exponencial independiente del framerate
// (k = 1 - rate^dt). El estado suavizado vive en p._pose y persiste entre frames, asi las
// articulaciones nunca "saltan" de golpe al cambiar de modo (idle -> correr -> preparar -> patear):
// siempre se desliza desde el angulo real que tenian un instante antes.
function smoothPose(p, target, rate){
  const k = clamp(1 - Math.pow(0.0001, (lastDt||0.016)*rate/6), 0, 1);
  if(!p._pose) p._pose = JSON.parse(JSON.stringify(target));
  const dst = p._pose;
  for(const key in target){
    const t = target[key];
    if(t && typeof t === 'object'){
      if(!dst[key]) dst[key] = {...t};
      for(const kk in t) dst[key][kk] = lerp(dst[key][kk]??t[kk], t[kk], k);
    } else {
      dst[key] = lerp(dst[key]??t, t, k);
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
  const strideAmp = clamp(0.55+speed*0.06,0.15,1.05) * clamp(1.12-(mass-1)*0.45, 0.72, 1.2) * (p.legIdleBlend??1);

  // ============================================================
  // REGLA 1 — COORDINACION Y DESFASE: pierna A y pierna B corren en oposicion total de fase
  // (medio ciclo = PI de diferencia): cuando una va al frente, la otra va atras. El muslo oscila
  // con seno; la RODILLA (pivote real = rodilla, no la cadera) se flexiona solo durante la fase de
  // RECUPERACION de cada pierna (cuando el pie esta en el aire volviendo al frente) y se estira del
  // todo en los dos extremos del paso (apoyo/contacto y despegue) — antes estaba al reves (se
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
  // (el del lado contrario) va al frente — coordinacion contralateral real, la que da equilibrio.
  const armAmp = (prepping||feinting||kicking||draggingBack||throwingIn) ? 0.15 : clamp(0.4+speed*0.05,0.1,0.9);
  function runArm(phase){
    const shoulder = Math.sin(phase+Math.PI)*armAmp;
    const elbow = 0.32 + Math.max(0,-shoulder)*0.55;
    return {shoulder, elbow};
  }
  let armA = runArm(phaseA), armB = runArm(phaseB);

  // BAMBOLEO RELAJADO DE MUÑECAS al correr a fondo (frecuencia distinta a la del brazo = se ve suelto)
  const sprintT = clamp((speed-5)/3.5, 0, 1);
  const wristA = Math.sin(phaseA*2.3 + 1.3) * 0.22 * sprintT;
  const wristB = Math.sin(phaseB*2.3 + 1.3) * 0.22 * sprintT;
  // cuello inclinado hacia adelante al esprintar a fondo
  let neckTilt = sprintT * 0.26 + Math.sin(runT*2)*0.03*sprintT;

  // ============================================================
  // REGLA 3 — EFECTO DE PESO (bounce con apoyo real): el torso sube en el punto medio de cada
  // recuperacion (cuando ninguna pierna esta del todo estirada, el "vuelo" entre pasos) y baja
  // justo en el contacto/despegue de cada paso (|cos(phase)| tiene sus DOS minimos exactamente ahi,
  // en fase con la extension maxima del muslo de arriba). Antes el offset no se multiplicaba por la
  // altura del jugador en pantalla (quedaba en un pixel o menos, invisible); ahora es proporcional a
  // "h" y ademas se acompaña de un sutil squash&stretch (se achica al pisar, se estira al despegar)
  // para que se note que apoya con peso real, no que flota.
  const bounceAmp = clamp(speed*0.11, 0, 0.9) * clamp(1.15-(mass-1)*0.5,0.65,1.3);
  const running = !prepping && !feinting && !kicking && !draggingBack && !throwingIn;
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

  // --- PREPARANDO_ACCION (pelota en pie): pierna de golpeo cargada — reemplaza la carrera ---
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

  // --- ANIMACION DE TIRO — EL LATIGAZO ---
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
    torsoExtra = 0.12*reach; // el torso se va un poco hacia atras, acompañando el arrastre
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

  // --- DESMARQUE MANUAL: capa de señal de pase sobre el ciclo de corrida (piernas intactas) ---
  let headYaw = 0;
  let pointWristA = wristA, pointWristB = wristB;
  if(p.isPointingForPass && p.isMakingManualRun && !prepping && !kicking && !feinting && !draggingBack && !throwingIn){
    const overlay = applyPassPointArmOverlay(p, armA, armB);
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
  // correr a la carga/patada, desliza los angulos en un puñado de frames en vez de saltar de golpe.
  // El tiro/amague usan un rate mas alto (mas rapido) para no perder la sensacion de latigazo.
  const smoothRate = kicking ? 30 : feinting ? 30 : draggingBack ? 18 : 20;
  const pose = smoothPose(p, {legA, legB, armA, armB, wristA: pointWristA, wristB: pointWristB, neckTilt, headYaw, bounceUp, squash, torsoExtra}, smoothRate);
  ({legA, legB, armA, armB, torsoExtra} = pose);
  const {wristA:wA, wristB:wB, neckTilt:nT, headYaw:hY, bounceUp:bU, squash:sq} = pose;

  const flip = facingFlip(p);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';
  const legW = Math.max(2, h*0.09);

  ctx.save();
  ctx.translate(s.x, s.y);

  // sombra
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();

  drawPlayerMeshDir8Prototype(p, h, 'arrow');

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
  // REGLA 2 — INERCIA: inclinacion extra de preparar/patear (ya suavizada arriba junto al resto)
  if(!p.stumble && !p.feint && !p.effortTouchAnim){
    ctx.rotate(torsoExtra);
  }
  // REGLA 2 — INERCIA DE MOVIMIENTO: p.leanFwd/p.leanSide ya vienen suavizados con LERP desde
  // movePlayer segun la aceleracion real (adelante al arrancar/correr, atras al frenar en seco,
  // al costado al girar) — el torso "acompaña" el cambio de direccion antes de estabilizarse.
  if(!p.stumble && !p.feint && !p.effortTouchAnim && !prepping && !kicking && !draggingBack && (p.leanFwd || p.leanSide)){
    ctx.rotate((p.leanFwd||0) + (p.leanSide||0));
  }

  ctx.scale(flip,1);
  ctx.scale(1-sq, 1+sq); // REGLA 3: squash&stretch — se achica un poco al pisar, se estira al volar

  // ===================== CADENA: CADERA -> MUSLO -> PANTORRILLA(rodilla) -> PIE(tobillo) =====================
  const hipY = -h*0.42, thighLen = h*0.20, calfLen = h*0.20;
  drawLegBone(-h*0.05, hipY, thighLen, calfLen, legA.thigh, legA.knee, legA.foot, sock, legW);
  drawLegBone( h*0.05, hipY, thighLen, calfLen, legB.thigh, legB.knee, legB.foot, sock, legW);

  // shorts (por encima de las piernas, cadera)
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.moveTo(-h*0.15,-h*0.55); ctx.lineTo(h*0.15,-h*0.55); ctx.lineTo(h*0.13,-h*0.38); ctx.lineTo(-h*0.13,-h*0.38);
  ctx.closePath(); ctx.fill();

  // ===================== CADENA: HOMBRO -> BRAZO -> ANTEBRAZO -> MUÑECA/MANO =====================
  const shY = -h*0.78, upperArmLen = h*0.09, foreArmLen = h*0.085;
  drawArmBone(-h*0.15, shY, upperArmLen, foreArmLen, armA.shoulder, armA.elbow, wA, skin, legW);
  drawArmBone( h*0.15, shY, upperArmLen, foreArmLen, armB.shoulder, armB.elbow, wB, skin, legW);

  drawPlayerMeshDir8Prototype(p, h, 'shoulders');

  // torso (padre principal de toda la jerarquia)
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(-h*0.17,-h*0.8);
  ctx.quadraticCurveTo(-h*0.19,-h*0.58,-h*0.14,-h*0.53);
  ctx.lineTo(h*0.14,-h*0.53);
  ctx.quadraticCurveTo(h*0.19,-h*0.58,h*0.17,-h*0.8);
  ctx.quadraticCurveTo(0,-h*0.88,-h*0.17,-h*0.8);
  ctx.closePath(); ctx.fill();

  // ===================== CADENA: TORSO -> CUELLO -> CABEZA =====================
  const facingAway = gameState==='practice' ? Math.cos(p.facing) > 0 : Math.sin(p.facing) > 0;
  ctx.save();
  ctx.translate(0, -h*0.80);
  rotateBone(nT);
  rotateBone(hY || 0);
  drawHeadHair(0, -h*0.115, h*0.09, h, facingAway);
  if(facingAway){
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.font = Math.max(6,h*0.14)+'px Arial'; ctx.textAlign='center';
    ctx.fillText(String(p.number), 0, h*0.06);
  }
  ctx.restore();

  ctx.restore();
}

// cabeza (piel) + pelo diferenciado: de FRENTE el pelo es solo el nacimiento (cara 100% descubierta);
// de ESPALDA el pelo es un bloque que cubre la nuca, la parte superior trasera y los laterales.
function drawHeadHair(cx, cy, r, h, facingAway){
  const skin = '#e6b98c';
  const hair = '#2b2117';
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = hair;
  if(facingAway){
    // bloque de pelo grande: cubre casi toda la cabeza vista desde atras, la cara no se ve
    ctx.beginPath(); ctx.arc(cx, cy-h*0.005, r*1.22, 0, Math.PI*2); ctx.fill();
  } else {
    // solo el nacimiento del pelo arriba: deja la cara (frente) 100% descubierta
    ctx.beginPath(); ctx.arc(cx, cy-h*0.04, r*1.06, Math.PI, 0); ctx.fill();
  }
}

/* ============================================================
   POSES ANIMADAS — entrada de pie y barrida
   ============================================================ */
function drawStandTackle(p, s, h){
  const a = p.tackleAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const lunge = Math.sin(prog*Math.PI); // 0 -> 1 -> 0, el impulso de la pierna
  const flip = facingFlip(p);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.beginPath();
  ctx.ellipse(0, 2, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
  ctx.scale(flip,1);

  const legW = Math.max(2, h*0.09);
  // pierna de apoyo
  ctx.strokeStyle = sock; ctx.lineWidth = legW; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-h*0.05,-h*0.42); ctx.lineTo(-h*0.1,-h*0.02); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-h*0.1,-h*0.01,h*0.05,h*0.03,0,0,7); ctx.fillStyle='#111'; ctx.fill();
  // pierna de entrada, se extiende hacia la pelota y vuelve
  const reach = h*0.34*lunge;
  ctx.strokeStyle = sock; ctx.lineWidth = legW;
  ctx.beginPath(); ctx.moveTo(h*0.05,-h*0.42); ctx.lineTo(h*0.1+reach, -h*0.08+lunge*h*0.02); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(h*0.1+reach, -h*0.07+lunge*h*0.02, h*0.055,h*0.032,0,0,7); ctx.fillStyle='#111'; ctx.fill();

  // torso inclinado hacia adelante, siguiendo el impulso
  ctx.rotate(-0.2*lunge);
  ctx.strokeStyle = skin; ctx.lineWidth = legW*0.85;
  ctx.beginPath(); ctx.moveTo(-h*0.15,-h*0.78); ctx.lineTo(-h*0.28,-h*0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h*0.15,-h*0.78); ctx.lineTo(h*0.32,-h*0.66); ctx.stroke();
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.moveTo(-h*0.15,-h*0.55); ctx.lineTo(h*0.15,-h*0.55); ctx.lineTo(h*0.13,-h*0.38); ctx.lineTo(-h*0.13,-h*0.38);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(-h*0.17,-h*0.8);
  ctx.quadraticCurveTo(-h*0.19,-h*0.58,-h*0.14,-h*0.53);
  ctx.lineTo(h*0.14,-h*0.53);
  ctx.quadraticCurveTo(h*0.19,-h*0.58,h*0.17,-h*0.8);
  ctx.quadraticCurveTo(0,-h*0.88,-h*0.17,-h*0.8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.font = Math.max(6,h*0.14)+'px Arial'; ctx.textAlign='center';
  ctx.fillText(String(p.number), 0, -h*0.62);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0,-h*0.92, h*0.09, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2b2117';
  ctx.beginPath(); ctx.arc(0,-h*0.96, h*0.095, Math.PI, 0); ctx.fill();

  ctx.restore();
}

function drawSlideTackle(p, s, h){
  const a = p.tackleAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';

  // estela de pasto/polvo detras del jugador, siguiendo la trayectoria del deslizamiento
  const trailN = 5;
  for(let i=1;i<=trailN;i++){
    const tt = clamp(prog - i*0.07, 0, 1);
    const eased = 1-Math.pow(1-tt,2);
    const tx = a.startX + a.dirX*SLIDE_DISTANCE*eased;
    const ty = a.startY + a.dirY*SLIDE_DISTANCE*eased;
    const tp = project({x:tx,y:ty,z:0});
    ctx.beginPath();
    ctx.ellipse(tp.x, tp.y+2, h*0.16*(1-i/trailN*0.6), h*0.05, 0, 0, Math.PI*2);
    ctx.fillStyle = `rgba(225,225,190,${0.24*(1-i/trailN)})`;
    ctx.fill();
  }

  const flip = a.dirX < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  // sombra alargada en el piso
  ctx.beginPath();
  ctx.ellipse(0, 3, h*0.42, h*0.09, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.scale(flip,1);

  // cuerpo tumbado, torso bajo y horizontal
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(-h*0.02, -h*0.16, h*0.26, h*0.13, 0, 0, Math.PI*2);
  ctx.fill();
  // shorts
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.ellipse(h*0.14, -h*0.12, h*0.12, h*0.09, 0, 0, Math.PI*2);
  ctx.fill();
  // pierna de barrida, extendida hacia adelante
  ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.1); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(h*0.2,-h*0.1); ctx.lineTo(h*0.5,-h*0.03); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(h*0.5,-h*0.03, h*0.06,h*0.04,0,0,7); ctx.fillStyle='#111'; ctx.fill();
  // pierna de apoyo, flexionada
  ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.09);
  ctx.beginPath(); ctx.moveTo(-h*0.05,-h*0.08); ctx.lineTo(h*0.02,-h*0.24); ctx.stroke();
  // brazo de apoyo contra el piso
  ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.08);
  ctx.beginPath(); ctx.moveTo(-h*0.2,-h*0.22); ctx.lineTo(-h*0.4,-h*0.06); ctx.stroke();
  // cabeza
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(-h*0.3,-h*0.22, h*0.085, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='#2b2117';
  ctx.beginPath(); ctx.arc(-h*0.32,-h*0.25, h*0.09, Math.PI*0.8, Math.PI*1.9); ctx.fill();
  // numero
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.font = Math.max(6,h*0.13)+'px Arial'; ctx.textAlign='center';
  ctx.fillText(String(p.number), -h*0.02, -h*0.14);

  ctx.restore();
}


function drawGKKick(p, s, h){
  const a = p.gkKickAnim;
  const prog = clamp(a.t / a.dur, 0, 1);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';
  const flip = facingFlip(p);

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.beginPath();
  ctx.ellipse(0, 3, h*0.24, h*0.08, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();

  if(a.type === 'dropkick'){
    const jump = Math.sin(prog * Math.PI);
    const offsetY = -jump * h * 0.4;
    const kickT = easeOutQuad(clamp((prog - 0.12) / 0.58, 0, 1));
    ctx.translate(0, offsetY);
    ctx.scale(flip, 1);

    // pierna de apoyo
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2, h*0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-h*0.06, -h*0.42); ctx.lineTo(-h*0.06, -h*0.04); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-h*0.06, -h*0.02, h*0.05, h*0.03, 0, 0, Math.PI*2); ctx.fill();

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
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(0, h*0.24, h*0.06, h*0.035, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // torso inclinado hacia atras en el salto
    const lean = jump * 0.18;
    ctx.save();
    ctx.rotate(lean);
    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0, -h*0.48, h*0.14, h*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, -h*0.66, h*0.16, h*0.17, 0, 0, Math.PI*2); ctx.fill();
    // brazos de equilibrio
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, h*0.085);
    ctx.beginPath(); ctx.moveTo(-h*0.1, -h*0.74); ctx.lineTo(-h*0.28, -h*0.58 - jump*h*0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.1, -h*0.74); ctx.lineTo(h*0.28, -h*0.58 - jump*h*0.12); ctx.stroke();
    // cabeza
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -h*0.84, h*0.09, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = Math.max(6, h*0.13) + 'px Arial'; ctx.textAlign = 'center';
    ctx.fillText(String(p.number), 0, -h*0.63);
    ctx.restore();
  } else {
    // lanzamiento con la mano: brazo atras -> adelante (lerp 300ms)
    ctx.scale(flip, 1);
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
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-h*0.05, -h*0.01, h*0.05, h*0.03, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.05, -h*0.01, h*0.05, h*0.03, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0, -h*0.48, h*0.14, h*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = shirt;
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
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = Math.max(6, h*0.13) + 'px Arial'; ctx.textAlign = 'center';
    ctx.fillText(String(p.number), 0, -h*0.63);
  }

  ctx.restore();
}

function drawGKDive(p, s, h){
  const a = p.diveAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';
  const sideSign = (a.targetY - a.startY) >= 0 ? 1 : -1; // hacia que lado va

  if(a.type==='jump'){
    // salto vertical: el cuerpo se eleva en pantalla siguiendo una curva de salto
    const scale = h/2;
    const airZ = Math.sin(clamp(prog,0,1)*Math.PI) * a.jumpHeight;
    const offsetY = -airZ*scale*1.7;
    const lean = Math.sin(clamp(prog,0,1)*Math.PI); // se estira mas en el punto alto

    ctx.save();
    ctx.translate(s.x, s.y);
    // sombra en el piso (se queda abajo, no sube con el jugador)
    ctx.beginPath();
    ctx.ellipse(0, 3, h*0.24*(1-lean*0.4), h*0.08, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();

    ctx.translate(0, offsetY);
    ctx.scale(sideSign,1);
    // piernas juntas, colgando/flexionadas
    ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.1); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-h*0.42); ctx.lineTo(h*0.06,-h*0.14+lean*h*0.05); ctx.stroke();
    // torso
    ctx.fillStyle = shorts;
    ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0,-h*0.68,h*0.15,h*0.16,0,0,Math.PI*2); ctx.fill();
    // brazos bien arriba, estirados hacia la pelota
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.09);
    ctx.beginPath(); ctx.moveTo(-h*0.08,-h*0.8); ctx.lineTo(-h*0.22,-h*1.12*lean-h*0.75*(1-lean)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.08,-h*0.8); ctx.lineTo(h*0.22,-h*1.12*lean-h*0.75*(1-lean)); ctx.stroke();
    ctx.fillStyle = '#e8c400';
    ctx.beginPath(); ctx.arc(-h*0.22,-h*1.12*lean-h*0.75*(1-lean), h*0.06,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(h*0.22,-h*1.12*lean-h*0.75*(1-lean), h*0.06,0,Math.PI*2); ctx.fill();
    // cabeza
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0,-h*0.9,h*0.09,0,Math.PI*2); ctx.fill();
    ctx.restore();
    return;
  }

  const eased = Math.sin(Math.min(prog,1)*Math.PI*0.85); // se extiende y llega estirado

  ctx.save();
  ctx.translate(s.x, s.y);
  // sombra
  ctx.beginPath();
  ctx.ellipse(0, 3, h*0.4, h*0.09, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();

  // cuerpo estirado horizontal, hacia el lado del salto
  ctx.save();
  ctx.scale(sideSign,1);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(0, -h*0.28*eased-h*0.06, h*0.24, h*0.14, -0.35*eased, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.ellipse(-h*0.16, -h*0.14*eased-h*0.04, h*0.13, h*0.09, -0.2*eased, 0, Math.PI*2);
  ctx.fill();
  // piernas juntas, extendidas hacia atras del salto
  ctx.strokeStyle = sock; ctx.lineWidth = Math.max(2,h*0.1); ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-h*0.2, -h*0.1*eased); ctx.lineTo(-h*0.48, h*0.02);
  ctx.stroke();
  // brazos extendidos hacia la pelota (arriba, direccion del salto)
  ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2,h*0.09);
  ctx.beginPath();
  ctx.moveTo(h*0.1, -h*0.42*eased-h*0.06); ctx.lineTo(h*0.4, -h*0.62*eased-h*0.08);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(h*0.4, -h*0.62*eased-h*0.08, h*0.06, 0, Math.PI*2);
  ctx.fillStyle = '#e8c400'; ctx.fill(); // guante
  // cabeza
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(h*0.06, -h*0.4*eased-h*0.08, h*0.085, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawAirStrike(p, s, h){
  const a = p.airStrikeAnim;
  const prog = clamp(a.t/a.dur, 0, 1);
  const {shirt, shorts, sock} = teamColors(p);
  const skin = '#e6b98c';
  const flip = facingFlip(p);
  const scale = h/2;

  if(a.type==='header'){
    // salto de cabeza: se eleva, cuello estirado hacia la pelota
    const lean = Math.sin(clamp(prog,0,1)*Math.PI);
    const airZ = lean * physicsConfig.maxJumpHeight;
    const offsetY = -airZ*scale*1.7;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.beginPath();
    ctx.ellipse(0,3,h*0.2*(1-lean*0.4),h*0.07,0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fill();
    ctx.translate(0, offsetY);
    ctx.scale(flip,1);
    // piernas flexionadas
    ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.09); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-h*0.06,-h*0.4); ctx.lineTo(-h*0.14,-h*0.12+lean*h*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h*0.06,-h*0.4); ctx.lineTo(h*0.16,-h*0.14+lean*h*0.06); ctx.stroke();
    // torso arqueado hacia atras
    ctx.fillStyle=shorts;
    ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.rotate(-0.22*lean);
    ctx.fillStyle=shirt;
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
    // volea: pierna de pateo bien alta, cuerpo inclinado hacia atras para acompañar
    const kick = Math.sin(clamp(prog,0,1)*Math.PI);
    const legLift = powerShot ? 0.58 : 0.44;
    const torsoLean = powerShot ? 0.38 : 0.28;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.beginPath();
    ctx.ellipse(0,2,h*0.22,h*0.08,0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
    ctx.scale(flip,1);
    // pierna de apoyo
    ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.1); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-h*0.04,-h*0.4); ctx.lineTo(-h*0.09,-h*0.02); ctx.stroke();
    // pierna de volea, se eleva bien alto
    ctx.beginPath();
    ctx.moveTo(h*0.04,-h*0.42);
    ctx.lineTo(h*0.32, -h*0.42 - kick*h*legLift);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(h*0.32,-h*0.42-kick*h*legLift,h*0.06,h*0.035,0,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill();
    // torso inclinado hacia atras acompañando el gesto
    ctx.save();
    ctx.rotate(torsoLean*kick);
    ctx.fillStyle=shorts;
    ctx.beginPath(); ctx.ellipse(-h*0.02,-h*0.55,h*0.13,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=shirt;
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
  ctx.beginPath();
  ctx.ellipse(0,3,h*0.22,h*0.07,0,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fill();
  ctx.translate(0, offsetY);
  ctx.scale(flip,1);
  ctx.save();
  ctx.rotate(rot);
  // torso, casi horizontal/invertido
  ctx.fillStyle=shirt;
  ctx.beginPath(); ctx.ellipse(0,-h*0.5,h*0.17,h*0.14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=shorts;
  ctx.beginPath(); ctx.ellipse(-h*0.05,-h*0.32,h*0.12,h*0.09,0,0,Math.PI*2); ctx.fill();
  // piernas en tijera, una arriba pateando, otra abajo
  ctx.strokeStyle=sock; ctx.lineWidth=Math.max(2,h*0.1); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-h*0.1,-h*0.28); ctx.lineTo(-h*0.34,-h*0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h*0.12,-h*0.6); ctx.lineTo(h*0.4,-h*0.86); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(h*0.4,-h*0.86,h*0.06,h*0.035,0,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill();
  // brazos, apoyo hacia el piso (cae de espaldas)
  ctx.strokeStyle=skin; ctx.lineWidth=Math.max(2,h*0.08);
  ctx.beginPath(); ctx.moveTo(-h*0.15,-h*0.42); ctx.lineTo(-h*0.4,-h*0.2); ctx.stroke();
  ctx.fillStyle=skin;
  ctx.beginPath(); ctx.arc(-h*0.2,-h*0.6,h*0.09,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBall(){
  const shadowS = project({x:ball.x,y:ball.y,z:0});
  const s = project({x:ball.x,y:ball.y,z:ball.z});
  const r = Math.max(3, s.s*BALL_RADIUS*2.1);
  ctx.beginPath();
  ctx.ellipse(shadowS.x, shadowS.y+2, r*0.9, r*0.35, 0,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fill();

  ctx.save();
  ctx.translate(s.x,s.y);
  ctx.rotate(ball.rollAngle);
  const grad = ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.1, 0,0,r);
  grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#cfcfcf');
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
  ctx.strokeStyle='#333'; ctx.lineWidth=Math.max(0.6,r*0.08);
  ctx.beginPath(); ctx.arc(0,0,r*0.42,0,Math.PI*2); ctx.stroke();
  for(let i=0;i<5;i++){
    const a = (i/5)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*r*0.42, Math.sin(a)*r*0.42);
    ctx.lineTo(Math.cos(a)*r*0.92, Math.sin(a)*r*0.92);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPowerBar(p){
  if(Game.isInputLocked) return;
  const setPieceWaiting = isSetPieceAwaitingExecution(p);
  let level = 0;
  let pkType = null;
  if(setPieceWaiting && SetPieceManager.chargeType){
    level = SetPieceManager.powerBar;
    pkType = SetPieceManager.chargeType === 'short' ? 'pass'
      : (SetPieceManager.chargeType === 'medium' ? 'through' : 'cross');
  } else if(!setPieceWaiting){
    level = chargeLevel(p);
    const buf = p.actionBuffer;
    pkType = p.pendingKick ? p.pendingKick.type : (getBufferKickType(buf) || buf?.type || p.charging);
  }
  const chargingNow = !setPieceWaiting && (
    (p.charging && p.chargeStart > 0) ||
    (p.isChargingShot && p.chargeStart > 0) ||
    (p.actionBuffer?.chargeStart > 0)
  );
  const lockedBuffer = !setPieceWaiting && !!(p.actionBuffer?.type && !p.actionBuffer?.chargeStart);
  if(!setPieceWaiting && level <= 0 && !p.pendingKick && !chargingNow && !lockedBuffer) return;
  if(!setPieceWaiting && level <= 0 && !pkType && !chargingNow && !lockedBuffer && !p.isChargingShot) return;
  const s = project({x:p.x,y:p.y,z:2.4});
  const w=54,h=8;
  ctx.save();
  ctx.translate(s.x-w/2, s.y);
  if(level > 0 || pkType){
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h);
    let col = pkType==='shot'? '#ff5252' : (pkType==='through'?'#ffd166':(pkType==='cross'?'#5fd0ff':'#7CFC00'));
    ctx.fillStyle=col; ctx.fillRect(2,2,(w-4)*level,h-4);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(0,0,w,h);
  }
  if(setPieceWaiting && SetPieceManager.timer > 0){
    const urgent = SetPieceManager.timer <= SET_PIECE_COUNTDOWN_URGENT;
    ctx.fillStyle = urgent ? '#ff5252' : '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(SetPieceManager.timer).toString(), w / 2, level > 0 ? -5 : h + 12);
  }
  ctx.restore();
}


/* ============================================================
   RADAR (minimapa) — vista cenital fija en una esquina, estilo TV/videojuego
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
  ctx.fillStyle = 'rgb(6,20,12)';
  roundRectPath(box.x-6, box.y-6, box.w+12, box.h+12, 8);
  ctx.fill();
  ctx.fillStyle = 'rgb(28,90,48)';
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // --- bordes y lineas de cancha ---
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#ffffff';
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
    const rp = radarPoint(box, p.x, p.y);
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, isCtrl?3.2:2.2, 0, Math.PI*2);
    ctx.fillStyle = p.team==='home' ? '#5aa4ff' : '#ff5a5a';
    ctx.fill();
    if(isCtrl){
      ctx.strokeStyle = p.id===Game.controlledId2 ? '#ff9d00' : '#fff700'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 4.6, 0, Math.PI*2); ctx.stroke();
    }
  }
  const rb = radarPoint(box, ball.x, ball.y);
  ctx.beginPath();
  ctx.arc(rb.x, rb.y, 2.4, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
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

// cruz amarilla en el pasto que marca donde va a picar el ultimo centro (boton circulo/○):
// ayuda a ubicarse para llegar a tiempo a un cabezazo o una volea.
function drawCrossMarker(){
  const m = Game.crossMarker;
  if(!m) return;
  const pr = project({x:m.x, y:m.y, z:0});
  const fade = clamp(m.t/0.4, 0, 1); // se desvanece en el ultimo tramo, no desaparece de golpe
  const size = Math.max(6, pr.s*0.55);
  ctx.save();
  ctx.globalAlpha = 0.85*fade;
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = Math.max(2, pr.s*0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pr.x-size, pr.y-size*0.42); ctx.lineTo(pr.x+size, pr.y+size*0.42);
  ctx.moveTo(pr.x+size, pr.y-size*0.42); ctx.lineTo(pr.x-size, pr.y+size*0.42);
  ctx.stroke();
  ctx.restore();
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
  ctx.fillStyle = urgent ? '#ff5252' : '#fff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(String(secs), canvas.width / 2, 104);
  ctx.font = '11px Arial';
  ctx.fillStyle = urgent ? '#ffb4b4' : '#cfe';
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
  ctx.fillStyle = urgent ? '#ff5252' : '#fff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(String(secs), canvas.width / 2, 104);
  ctx.font = '11px Arial';
  ctx.fillStyle = urgent ? '#ffb4b4' : '#cfe';
  ctx.fillText(labels[sp.type] || 'Pelota parada', canvas.width / 2, 118);
  ctx.restore();
}

function render(){
  if(fieldGrassEl) fieldGrassEl.classList.toggle('practice', gameState === 'practice');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // cielo/fondo estadio simple
  const horizonFrac = gameState==='practice' ? PCAM.horizonFrac : CAM.horizonFrac;
  const g = ctx.createLinearGradient(0,0,0,canvas.height*horizonFrac);
  g.addColorStop(0,'#0a2416'); g.addColorStop(1,'#123a22');
  ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height*horizonFrac+4);

  if(gameState==='practice') drawFieldPractice(); else drawField();

  // en la Arena de Practica solo participan el jugador humano y el arquero rival: el resto del
  // plantel queda aparcado fuera de cuadro (ver setupPractice) y no hace falta dibujarlo
  const renderPlayers = gameState==='practice' ? [practicePlayer, practiceGK].filter(Boolean) : allPlayers;
  for(const p of renderPlayers) updatePlayerMeshDir8(p);
  const drawable = [...renderPlayers, ball].sort((a,b)=> paintDepth(b)-paintDepth(a));
  for(const ent of drawable){
    if(ent instanceof Ball) drawBall();
    else drawPlayer(ent, isControlledByHuman(ent));
  }
  const cp = controlledPlayer();
  if(cp) drawPowerBar(cp);
  if(Game.twoPlayerMode){
    const cp2 = controlledPlayer2();
    if(cp2) drawPowerBar(cp2);
  }
  if(gameState!=='practice') drawRadar(); // el radar (minimapa cenital) no aplica a la camara de practica
  drawSetPieceCountdownHud();
  drawKickoffCountdownHud();
  drawCelebrationPrompt();
}
function isControlledByHuman(p){
  return p.id===Game.controlledId || (Game.twoPlayerMode && p.id===Game.controlledId2);
}
function drawCelebrationPrompt(){
  if(isCelebrationMode && gameState === 'celebration_run' && Game.celebrationRun){
    const cr = Game.celebrationRun;
    if(!isHumanTeam(cr.scoringTeam)) return;
    const kb = cr.scoringTeam === 'home' ? ['J','I','K','L'] : ['.','"',',','/'];
    ctx.save();
    ctx.textAlign = 'center';
    roundRectPath(canvas.width/2-260, canvas.height-96, 520, 64, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Arial';
    ctx.fillText('FESTEJO OPCIONAL — CORRÉ LIBRE', canvas.width/2, canvas.height-70);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#9be89b';
    ctx.fillText('A/'+kb[0]+' Siuuu   B/'+kb[1]+' Topogiggio   X/'+kb[2]+' Baile   Y/'+kb[3]+' Mbappe   · Start reanuda', canvas.width/2, canvas.height-48);
    ctx.restore();
    return;
  }
  const c = Game.celebration;
  if(!c || c.phase!=='choose' || !isHumanTeam(c.team)) return;
  ctx.save();
  ctx.textAlign = 'center';
  roundRectPath(canvas.width/2-235, canvas.height-96, 470, 64, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Arial';
  ctx.fillText('ELEGÍ EL FESTEJO', canvas.width/2, canvas.height-70);
  ctx.font = '12px Arial';
  ctx.fillStyle = '#9be89b';
  const kb = c.team==='home' ? ['J','K','L','I'] : ['.','/',',',"'"];
  ctx.fillText('✕/'+kb[0]+' Siuuuu   ▢/'+kb[1]+' No Escucho   △/'+kb[2]+' Brazos Cruzados   ○/'+kb[3]+' Baile', canvas.width/2, canvas.height-48);
  ctx.restore();
}
export { pathFromWorldPts, strokeWorldPts, circleWorldPts, drawStadiumFloor, drawGrassBands, drawOutZoneShade, drawField, drawDebugBoundaries, drawGoalArea, drawGoal, drawFieldPractice, teamColors, drawSpamDuelMeter, drawPlayer, drawCelebAnim, drawStylizedBody, drawCelebRunPhase, drawCelebSiuu, drawCelebTopo, drawCelebMbappe, drawCelebRobot, rotateBone, easeOutQuad, kickImpactCurve, drawLegBone, drawArmBone, smoothPose, drawNormalPose, drawHeadHair, drawStandTackle, drawSlideTackle, drawGKKick, drawGKDive, drawAirStrike, drawBall, drawPowerBar, radarBox, radarPoint, drawRadar, roundRectPath, drawCrossMarker, drawSetPieceCountdownHud, render, isControlledByHuman, drawCelebrationPrompt };

