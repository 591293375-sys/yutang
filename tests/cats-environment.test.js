import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CAT_TIMES,normalizeEnvironment,resolveEnvironment} from '../src/themes/cats/environment.js';
import {normalizeCats} from '../src/themes/cats/storage.js';
import {seasonParticles,seasonParticleCount,courtyardFireflies} from '../src/themes/cats/season-effects.js';
import {CAT_SEASON_PAINTINGS,CAT_FOLIAGE_REGIONS} from '../src/themes/cats/background.js';

test('the only manual times are day and night, with precise local automatic boundaries',()=>{
 assert.deepEqual(CAT_TIMES,['day','night']);
 for(const [h,m,time] of [[0,0,'night'],[6,59,'night'],[7,0,'day'],[18,59,'day'],[19,0,'night'],[23,59,'night']])assert.equal(resolveEnvironment({time:'auto'},new Date(2026,3,1,h,m)).time,time);
 assert.equal(resolveEnvironment({time:'day'},new Date(2026,3,1,22)).time,'day');
 assert.equal(resolveEnvironment({time:'night'},new Date(2026,3,1,12)).time,'night');
});
test('legacy dawn and dusk saves migrate to daylight without losing season and effect preferences',()=>{
 for(const time of ['dawn','dusk']){
  const env={season:'winter',time,particles:false,fireflies:false};
  assert.deepEqual(normalizeEnvironment(env),{...env,time:'day'});
  const saved=normalizeCats({version:1,cats:[],props:[],nextId:1,environment:env});
  assert.deepEqual(saved.environment,{...env,time:'day'});
 }
 assert.equal(normalizeEnvironment({time:'unknown'}).time,'auto');
});
test('spring uses the new cherry blossom painting and every seasonal plate exists',async()=>{
 assert.match(CAT_SEASON_PAINTINGS.spring,/art-v3\/courtyard-sakura\.webp$/);
 assert.equal(new Set(Object.values(CAT_SEASON_PAINTINGS)).size,4);
 for(const file of Object.values(CAT_SEASON_PAINTINGS)){const b=await readFile(new URL('../public/'+file,import.meta.url));assert.equal(b.toString('ascii',8,12),'WEBP')}
 for(const poly of CAT_FOLIAGE_REGIONS)for(const p of poly)assert.ok(p.every(n=>n>=0&&n<=1));
});
test('season particles drift continuously with wind and respect disabled/reduced/low modes',()=>{
 for(const season of ['spring','autumn','winter']){
  const env=resolveEnvironment({season,time:'day',particles:true}),a=seasonParticles(env,{},10),b=seasonParticles(env,{},10.1);
  assert.ok(a.length>=18);assert.ok(a.length<=26);assert.ok(a.some((p,i)=>p.x!==b[i].x&&p.y!==b[i].y));
  for(const p of a)assert.ok(Object.values(p).every(Number.isFinite));
  assert.ok(seasonParticleCount(env,{reducedMotion:true})<=5);assert.ok(seasonParticleCount(env,{quality:'low'})<a.length);
  assert.equal(seasonParticles({...env,particles:false},{},10).length,0);
 }
 assert.equal(seasonParticleCount(resolveEnvironment({season:'summer'})),0,'summer remains restful and green');
});
test('fireflies glow only at night and obey the user switch and seasonal quietness',()=>{
 const night=resolveEnvironment({season:'spring',time:'night'});assert.equal(courtyardFireflies(night,{},10).length,9);
 assert.equal(courtyardFireflies({...night,time:'day'},{}).length,0);
 assert.equal(courtyardFireflies({...night,fireflies:false},{}).length,0);
 assert.equal(courtyardFireflies(resolveEnvironment({season:'winter',time:'night'}),{}).length,0);
 assert.equal(courtyardFireflies(night,{reducedMotion:true}).length,3);
 const a=courtyardFireflies(night,{},10),b=courtyardFireflies(night,{},10.01);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i].alpha-b[i].alpha)<.002,'no flashing');
});
