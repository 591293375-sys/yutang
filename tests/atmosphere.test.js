import test from 'node:test';
import assert from 'node:assert/strict';
import {Atmosphere, rainPosition} from '../src/engine/atmosphere.js';
import {ambientMix} from '../src/audio/ambient.js';
import {mapWeatherCode} from '../src/lib/environment.js';

test('rain lands at its target and produces a ripple there',()=>{
 const a=new Atmosphere({weather:'rainy',season:'autumn'},()=>.5);
 const d=a.drops[0];d.age=d.life;const target=rainPosition(d,1000,700,a.options);d.age-=.01;
 a.update(.02,1000,700);
 const hit=a.impacts.find(p=>p.kind==='rain');
 assert.ok(hit);assert.equal(hit.x,target.x);assert.equal(hit.y,target.y);
});
test('fallen leaves land, ripple, drift, and stay bounded over a long session',()=>{
 const a=new Atmosphere({weather:'sunny',season:'autumn'},()=>.5);
 a.nextLeaf=0;a.update(.02,1000,700);
 const leaf=a.leaves.find(l=>l.phase==='fall');assert.ok(leaf);
 for(let i=0;i<200;i++)a.update(.025,1000,700);
 assert.equal(leaf.phase,'float');assert.ok(a.landings>0);
 const x=leaf.u;for(let i=0;i<12000;i++)a.update(.05,1000,700);
 assert.notEqual(leaf.u,x);assert.ok(a.leaves.length<=30);assert.ok(a.impacts.length<=160);
});
test('storm thunder is intermittent, cancelled by weather changes; reduced motion suppresses flash',()=>{
 const a=new Atmosphere({weather:'stormy',season:'autumn'},()=>.5);
 let count=0;
 for(let i=0;i<2400;i++)count+=a.update(.05,1000,700).length;
 assert.ok(count>=3&&count<=6);
 a.configure({weather:'sunny'});for(let i=0;i<1000;i++)assert.equal(a.update(.05,1000,700).length,0);
 assert.equal(a.drops.length,0);assert.equal(a.flash,0);
 a.configure({weather:'stormy',reducedMotion:true});a.nextThunder=0;
 assert.equal(a.update(.05,1000,700).length,1);assert.equal(a.flash,0);
});
test('reduced motion holds floating foliage and limits raindrops',()=>{
 const a=new Atmosphere({weather:'rainy',season:'autumn',reducedMotion:true},()=>.5);
 const u=a.leaves[0].u;for(let i=0;i<100;i++)a.update(.05,1000,700);
 assert.equal(a.leaves[0].u,u);assert.ok(a.drops.length<=12);
});
test('weather sound mixes change with season, use rain for rain, and remain within the volume budget',()=>{
 for(const season of ['spring','summer','autumn','winter']) for(const weather of ['sunny','cloudy','rainy','snowy','stormy','foggy']){
  const mix=ambientMix(weather,season,false);assert.ok(Object.values(mix).reduce((a,b)=>a+b,0)<=1.001);
  assert.ok(mix.stream>=0&&mix.wind>=0&&mix.rain>=0);
 }
 assert.ok(ambientMix('sunny','winter').wind>ambientMix('sunny','spring').wind);
 assert.ok(ambientMix('rainy','summer').rain>ambientMix('rainy','summer').stream);
 assert.equal(ambientMix('sunny','summer').rain,0);
 assert.equal(mapWeatherCode(95),'stormy');assert.equal(mapWeatherCode(45),'foggy');
});
