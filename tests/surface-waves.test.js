import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceRipples} from '../src/engine/surface-waves.js';
test('breezes move finite surface ripples, with stronger waves in storm weather',()=>{
 const calm=surfaceRipples(12,1300,900,{season:'autumn',weather:'sunny'}),later=surfaceRipples(15,1300,900,{season:'autumn',weather:'sunny'}),storm=surfaceRipples(12,1300,900,{season:'autumn',weather:'stormy'});
 assert.ok(calm.length>=8&&calm.length<=24);assert.notDeepEqual(calm,later);
 assert.ok(calm.every(p=>Number.isFinite(p.x+p.y+p.alpha)&&p.alpha>=0&&p.alpha<=.3));
 assert.ok(storm.reduce((s,p)=>s+p.alpha,0)>calm.reduce((s,p)=>s+p.alpha,0));
});
test('ice and reduced motion suppress wind ripples; paused time and low quality stay bounded',()=>{
 for(const options of [{season:'winter'},{weather:'snowy'},{reducedMotion:true}])assert.equal(surfaceRipples(12,1200,800,options).length,0);
 assert.deepEqual(surfaceRipples(17,1200,800,{}),surfaceRipples(17,1200,800,{}));
 assert.ok(surfaceRipples(17,390,844,{quality:'low'}).length<surfaceRipples(17,390,844,{}).length);
});
