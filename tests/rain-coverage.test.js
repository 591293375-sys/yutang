import test from 'node:test';
import assert from 'node:assert/strict';
import {Atmosphere, rainPosition} from '../src/engine/atmosphere.js';
function seeded(){let s=2718;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296)}
for(const [w,h] of [[1357,897],[3840,2160],[390,844]])test(`rain reaches all screen edges at ${w} × ${h}`,()=>{
 const a=new Atmosphere({season:'autumn',weather:'rainy'},seeded()),cells=new Set();
 for(let frame=0;frame<600;frame++){
  a.update(.025,w,h);
  for(const d of a.drops){const p=rainPosition(d,w,h,a.options);if(p.x>=0&&p.x<w&&p.y>=0&&p.y<h)cells.add(`${Math.floor(p.x/w*6)},${Math.floor(p.y/h*6)}`)}
 }
 assert.equal(cells.size,36,'Rain must visit corners and outer rows, not just the center.');
 assert.ok(a.drops.length<=100);assert.ok(a.impacts.every(p=>p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h));
});
test('rain impact coincides with the visible end of its trajectory',()=>{
 const a=new Atmosphere({weather:'rainy'},()=>.5),d=a.drops[0];d.age=d.life;
 const end=rainPosition(d,1357,897,a.options);a.update(0,1357,897);
 assert.ok(a.impacts.some(p=>Math.abs(p.x-end.x)<.001&&Math.abs(p.y-end.y)<.001));
});
test('land receives rain streaks without water ripples',()=>{
 const a=new Atmosphere({weather:'rainy'},()=>.5);a.drops.forEach(d=>d.age=d.life);
 a.update(0,1200,800,[],{},()=>false);assert.equal(a.impacts.length,0);assert.ok(a.drops.length>0);
});
