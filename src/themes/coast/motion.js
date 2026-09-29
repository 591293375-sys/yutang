import {isHabitatValid,pathIsHabitatValid} from './geometry.js';
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function angleDelta(from, to) { return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI; }
export function turnToward(from, to, dt, maxRate = 1.8, response = 4) {
  const delta = angleDelta(from, to), smooth = delta * (1 - Math.exp(-response * Math.max(0, dt)));
  return from + clamp(smooth, -maxRate * dt, maxRate * dt);
}
export function approachSpeed(current, desired, dt, acceleration = 24, braking = 34) {
  current = Number.isFinite(current) ? Math.max(0, current) : 0;
  return current + clamp(desired - current, -braking * dt, acceleration * dt);
}
/** Body orientation eases separately from a validated migration route. Crabs travel sideways. */
export function steerMotion(entity, travelAngle, desiredSpeed, dt, { crab = false, direct = false, acceleration, braking, turnRate, response = 4 } = {}) {
  dt = Math.max(0, Math.min(8, Number(dt) || 0));
  const side = entity.crabSide ?? (entity.phase > Math.PI ? -1 : 1);
  if (crab) entity.crabSide = side;
  const desiredBody = travelAngle - (crab ? side * Math.PI / 2 : 0), previous = entity.heading || 0;
  entity.heading = turnToward(previous, desiredBody, dt, turnRate ?? (crab ? 1.15 : 2.2), response);
  entity.turnRate = dt ? angleDelta(previous, entity.heading) / dt : 0;
  const alignment = Math.max(.12, (Math.cos(angleDelta(entity.heading, desiredBody)) + 1) / 2);
  entity.speed = approachSpeed(entity.speed, Math.max(0, desiredSpeed) * alignment, dt, acceleration ?? (crab ? 10 : 26), braking ?? (crab ? 14 : 36));
  entity.moveAngle = direct ? travelAngle : entity.heading + (crab ? side * Math.PI / 2 : 0);
  entity.motionState = entity.speed > .35 ? 'moving' : 'resting';
  return { angle: entity.moveAngle, speed: entity.speed };
}
export function crabCruiseSpeed(entity, dt, responding = false) {
  entity.motionTime = (entity.motionTime || 0) + dt;
  const period = 5.4 + (entity.phase || 0) * .16, phase = (entity.motionTime + (entity.phase || 0) * .8) % period;
  return responding || phase < 3.0 ? 5.5 * (.85 + .15 * Math.sin(phase * 2.2)) : 0;
}


// A rising tide can close the lower inlet completely. Plan through the shore
// band toward high-water refuges instead of repeatedly choosing a local dry spot.
const shoreStep=28,shoreNodes=new Map(),shoreGraphs=new Map(),shoreHeuristics=new Map(),shoreRefuges=new Map();
// A 2px route clearance above the physical body radius avoids grazing small
// rock corners between samples. Every connecting edge is checked as a path.
// Nodes and edge samples share a 7px lattice. Habitat calculations are
// reused across the small overlapping tide windows without retaining paths.
const latticeWidth=224,latticeHeight=124,shoreValidity=Array.from({length:51},()=>new Uint8Array(latticeWidth*latticeHeight));
function validShorePoint(x,y,levelIndex){
 const index=Math.round((y-24)/7)*latticeWidth+Math.round((x-24)/7),cache=shoreValidity[levelIndex];
 if(!cache[index])cache[index]=isHabitatValid('crab',x,y,levelIndex/50,10)?2:1;
 return cache[index]===2;
}
for(let y=24;y<=876;y+=shoreStep)for(let x=24;x<=1576;x+=shoreStep)shoreNodes.set(x+','+y,{x,y,key:x+','+y});
function shoreGraph(level,ahead){
 const low=Math.floor(Math.min(level,ahead)*50),high=Math.ceil(Math.max(level,ahead)*50),refuge=ahead<level?0:50,key=low+':'+high+':'+refuge;
 if(shoreGraphs.has(key))return shoreGraphs.get(key);
 if(!shoreRefuges.has(refuge))shoreRefuges.set(refuge,[...shoreNodes.values()].filter(n=>validShorePoint(n.x,n.y,refuge)));
 const refuges=shoreRefuges.get(refuge);
 const validity=new Map(),edges=new Map();
 const valid=n=>{if(!n)return false;if(!validity.has(n.key))validity.set(n.key,validShorePoint(n.x,n.y,low)&&validShorePoint(n.x,n.y,high));return validity.get(n.key)};
 const heuristic=n=>{const key=refuge+':'+n.key;if(!shoreHeuristics.has(key))shoreHeuristics.set(key,Math.min(...refuges.map(p=>Math.hypot(n.x-p.x,n.y-p.y))));return shoreHeuristics.get(key)};
 const neighbors=n=>{if(!edges.has(n.key))edges.set(n.key,[[shoreStep,0],[-shoreStep,0],[0,shoreStep],[0,-shoreStep]].map(([dx,dy])=>shoreNodes.get((n.x+dx)+','+(n.y+dy))).filter(p=>valid(p)&&[.25,.5,.75].every(t=>validShorePoint(n.x+(p.x-n.x)*t,n.y+(p.y-n.y)*t,low)&&validShorePoint(n.x+(p.x-n.x)*t,n.y+(p.y-n.y)*t,high))));return edges.get(n.key)};
 const result={valid,heuristic,neighbors};shoreGraphs.set(key,result);if(shoreGraphs.size>8)shoreGraphs.delete(shoreGraphs.keys().next().value);return result;
}
// The scene's existing RAF prewarms a few shared nodes while the tide is calm.
// No timer survives a theme switch, and a click never has to rasterise the
// entire first shore graph before its first route can begin.
const shoreNodeList=[...shoreNodes.values()];
export function warmShoreNavigation(level,ahead,count=16){
 const graph=shoreGraph(level,ahead);let cursor=graph.warmCursor||0;
 const end=Math.min(shoreNodeList.length,cursor+Math.max(0,Math.min(32,count)));
 for(;cursor<end;cursor++){const node=shoreNodeList[cursor];if(graph.valid(node)){graph.heuristic(node);graph.neighbors(node);}}
 graph.warmCursor=cursor;return cursor===shoreNodeList.length;
}
export function shoreEscapeRoute(entity,level,ahead,canReach){
 const graph=shoreGraph(level,ahead),starts=[...shoreNodes.values()].filter(p=>Math.hypot(p.x-entity.x,p.y-entity.y)<=60&&graph.valid(p)&&canReach(p.x,p.y));
 if(!starts.length)return null;
 const queue=[...starts],cost=new Map(starts.map(p=>[p.key,Math.hypot(p.x-entity.x,p.y-entity.y)])),previous=new Map(starts.map(p=>[p.key,null])),closed=new Set();let best=null,bestScore=Infinity;
 while(queue.length&&closed.size<700){
  queue.sort((a,b)=>cost.get(a.key)+graph.heuristic(a)-cost.get(b.key)-graph.heuristic(b));const node=queue.shift();if(closed.has(node.key))continue;closed.add(node.key);
  const score=graph.heuristic(node)+cost.get(node.key)*.025;if(score<bestScore){best=node;bestScore=score}if(graph.heuristic(node)<1)break;
  for(const next of graph.neighbors(node)){const nextCost=cost.get(node.key)+shoreStep;if(nextCost<(cost.get(next.key)??Infinity)){cost.set(next.key,nextCost);previous.set(next.key,node);queue.push(next)}}
 }
 if(!best||Math.hypot(best.x-entity.x,best.y-entity.y)<10)return null;
 const points=[];for(let node=best;node;node=previous.get(node.key))points.push({x:node.x,y:node.y});points.reverse();
 const route=[];let from={x:entity.x,y:entity.y},index=0;
 while(index<points.length){let next=points.length-1;while(next>index&&!(pathIsHabitatValid('crab',from.x,from.y,points[next].x,points[next].y,level,10)&&pathIsHabitatValid('crab',from.x,from.y,points[next].x,points[next].y,ahead,10)))next--;route.push(points[next]);from=points[next];index=next+1;}
 return route;
}
