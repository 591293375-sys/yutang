import test from 'node:test';
import assert from 'node:assert/strict';
import {paintedLimbWeight,constrainPaintedStep} from '../src/themes/cats/painted-gait.js';
test('painted paw deformation pins the hip and preserves a full paw-width influence',()=>{
 const leg={hip:[.4,.7],paw:[.34,.95]};
 assert.equal(paintedLimbWeight({x:.4,y:.69},leg),0);
 assert.equal(paintedLimbWeight({x:.4,y:.7},leg),0);
 assert.equal(paintedLimbWeight({x:.32,y:.95},leg),1);
 assert.equal(paintedLimbWeight({x:.36,y:.95},leg),1);
 assert.equal(paintedLimbWeight({x:.7,y:.95},leg),0);
 assert.equal(paintedLimbWeight({x:.34,y:.95},{...leg,hidden:true}),0);
 for(let y=.65;y<1;y+=.003){const a=paintedLimbWeight({x:.35,y},leg),b=paintedLimbWeight({x:.35,y:y+.003},leg);assert.ok(Math.abs(a-b)<.04)}
});
test('even a footfall correction or turn cannot pull a painted leg beyond its short stride',()=>{
 for(const width of [40,80,140])for(const x of [-100,0,100])for(const y of [-100,0,100]){
  const step=constrainPaintedStep({x,y},width);assert.ok(Math.hypot(step.x,step.y)<=width*.065+1e-8);
  assert.ok(step.x*x>=0&&step.y*y>=0);
 }
 assert.deepEqual(constrainPaintedStep({x:1,y:-1},100),{x:1,y:-1});
});
