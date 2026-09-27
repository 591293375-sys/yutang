import test from 'node:test';
import assert from 'node:assert/strict';
import {shoreRipples} from '../src/engine/surface-waves.js';
test('shore ripples hug upper left and lower right banks, independently of the center',()=>{
 const waves=shoreRipples(10,1600,900,{season:'autumn',weather:'rainy'}),points=waves.flatMap(w=>w.points);
 assert.ok(points.some(p=>p.x<320&&p.y<195));
 assert.ok(points.some(p=>p.x>1100&&p.y>500));
 assert.ok(points.every(p=>Math.hypot(p.x-800,p.y-450)>220));
 assert.ok(waves.every(w=>w.alpha>=0&&w.alpha<=.3));
 assert.notDeepEqual(waves,shoreRipples(12,1600,900,{season:'autumn',weather:'rainy'}));
});
test('shore waves respect cover cropping, ice, reduced motion and quality',()=>{
 for(const o of [{season:'winter'},{weather:'snowy'},{reducedMotion:true}])assert.deepEqual(shoreRipples(10,1600,900,o),[]);
 assert.ok(shoreRipples(10,1600,900,{quality:'low'}).length<shoreRipples(10,1600,900,{}).length);
 for(const w of shoreRipples(10,390,844,{}))assert.ok(w.points.every(p=>Number.isFinite(p.x+p.y)));
 assert.deepEqual(shoreRipples(10,1600,900,{}),shoreRipples(10,1600,900,{}));
});
