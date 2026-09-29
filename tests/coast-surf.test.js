import test from 'node:test';
import assert from 'node:assert/strict';
import {SURF_PERIOD,surfState,surfRibbon,surfFootprint,surfCoverageAt} from '../src/themes/coast/surf.js';
import {shoreLine,pointInPolygon,blockedAt} from '../src/themes/coast/geometry.js';
test('each breaker advances to the shared shore and recedes with a bounded thin wash',()=>{
  const a=surfState(.8),b=surfState(2.5),c=surfState(5.4),d=surfState(7.6);
  assert.ok(a.distance>b.distance&&b.distance>c.distance);assert.ok(d.distance>c.distance);
  for(let t=0;t<24;t+=.1){const s=surfState(t,0,1);assert.ok(s.runup>=0&&s.runup<=9);assert.ok(s.opacity>=0&&s.opacity<=1);}
  const before=surfState(SURF_PERIOD-.00001),after=surfState(SURF_PERIOD);
  assert.ok(before.opacity<.001&&after.opacity===0,'reset occurs only when the breaker is invisible');
});
test('wave ribbons follow current curved shoreline at every tide and stay finite',()=>{
  for(const level of [0,.25,.5,.75,1]){const r=surfRibbon(level,5.46);assert.equal(r.line,shoreLine(level));assert.equal(r.front.length,r.line.length);assert.ok(r.front.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
  const low=surfRibbon(0,5.46).front,high=surfRibbon(1,5.46).front;
  assert.ok(Math.hypot(low[70].x-high[70].x,low[70].y-high[70].y)>100);
});
test('reduced motion holds a single stationary ripple state',()=>{
  assert.deepEqual(surfState(0,0,.5,true),surfState(9000,0,.5,true));
});
test('sand erosion only follows the same advancing wash polygons that are drawn',()=>{
  const f=surfFootprint(0,6.8);assert.equal(surfFootprint(0,6.8),f,'many sand samples share one footprint');
  let wet=0,dry=0;
  for(let i=8;i<f.line.length-8;i++){
    const p=f.line[i],n=f.ribbons[0].normals[i];
    for(const distance of [1,3,6,12]){
      const x=p.x-n.x*distance,y=p.y-n.y*distance;if(blockedAt(x,y)||pointInPolygon(x,y,f.boundary))continue;
      const drawn=f.quads.some(quads=>quads.some(q=>pointInPolygon(x,y,q)));
      const coverage=surfCoverageAt(x,y,0,6.8);
      if(coverage>0){assert.equal(drawn,true,'erasure cannot precede the visible wash');wet++;}
      if(!drawn){assert.equal(coverage,0);dry++;}
    }
  }
  assert.ok(wet>10&&dry>10,'exercise both washed and untouched sand');
});
