import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonGroundDetails,seasonParticles} from '../src/themes/cats/season-effects.js';
import {surfaceAt} from '../src/themes/cats/geometry.js';

test('fallen seasonal details reach the central paving without landing on facilities',()=>{
 for(const season of ['spring','autumn']){
  const env={season,particles:true};
  const details=seasonGroundDetails(env);
  assert.equal(details.length,14);
  assert.ok(details.filter(p=>p.x>.40&&p.x<.76&&p.y>.35&&p.y<.82).length>=6);
  for(const p of details)assert.equal(surfaceAt(p)?.id,'ground');
  assert.deepEqual(seasonGroundDetails(env,{quality:'low'}),details.slice(0,8));
  assert.deepEqual(seasonGroundDetails({...env,particles:false}),[]);
 }
 for(const season of ['summer','winter'])assert.deepEqual(seasonGroundDetails({season,particles:true}),[]);
});

test('wind carries petals through the courtyard center with bounded particle counts',()=>{
 const env={season:'spring',particles:true};
 const samples=Array.from({length:12},(_,i)=>seasonParticles(env,{},i*5)).flat();
 assert.ok(samples.some(p=>p.x>.48&&p.x<.70&&p.y>.42&&p.y<.76&&p.alpha>.5));
 assert.equal(seasonParticles(env,{},10).length,26);
});
