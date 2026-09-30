import test from 'node:test';
import assert from 'node:assert/strict';
import {rockContactSamples,rockContactStrength,wetRockMix} from '../src/themes/coast/rock-contact.js';
import {blockedAt,habitatAt} from '../src/themes/coast/geometry.js';

test('wet rock colour blends at the waterline without recolouring the dry rock face',()=>{
  assert.ok(wetRockMix(0)>.7&&wetRockMix(0)<1);
  assert.ok(wetRockMix(2)>wetRockMix(7));
  assert.ok(wetRockMix(7)>wetRockMix(11));
  assert.equal(wetRockMix(14),0);
  assert.equal(wetRockMix(30),0);
});

test('rock contact samples surround exposed rocks and exclude hidden inter-rock seams',()=>{
  const samples=rockContactSamples();
  assert.ok(samples.length>150&&samples.length<800);
  for(const s of samples){
    assert.equal(blockedAt(s.x-s.nx*2,s.y-s.ny*2),true,'sample hugs a solid rock');
    assert.equal(blockedAt(s.x+s.nx*3,s.y+s.ny*3),false,'no rim inside a neighbouring rock');
  }
});

test('contact ripples follow real water at low, intermediate and high tide',()=>{
  let newlyWet=0,dry=0;
  for(const s of rockContactSamples()){
    const x=s.x+s.nx*5,y=s.y+s.ny*5;
    for(const level of [0,.25,.5,.75,1]){
      const strength=rockContactStrength(s,level);
      assert.ok(strength>=0&&strength<=1);
      if(!habitatAt(x,y,level).water){assert.equal(strength,0);dry++}
    }
    if(rockContactStrength(s,0)===0&&rockContactStrength(s,1)>.5)newlyWet++;
  }
  assert.ok(newlyWet>40,'lower rocks gain a waterline when the tide comes in');
  assert.ok(dry>40,'dry sand never receives a turquoise halo or ripple');
});

test('low tide leaves the lower front rocks and right beach stone completely dry',()=>{
  // These particular faces sit below the low-water trace in the supplied art.
  // A global tide opacity would incorrectly give all of them a blue rim.
  for(const rock of [3,4,6]){
    const points=rockContactSamples().filter(s=>s.rock===rock);
    assert.ok(points.length>20,`rock ${rock} retains an exposed contact contour`);
    assert.ok(points.every(s=>rockContactStrength(s,0)===0),`rock ${rock} has no low-tide contact water`);
    assert.ok(points.every(s=>rockContactStrength(s,1)>.95),`high tide surrounds rock ${rock}`);
  }
  for(const rock of [0,5]){
    const points=rockContactSamples().filter(s=>s.rock===rock);
    assert.ok(points.some(s=>rockContactStrength(s,0)===0),`rock ${rock} meets dry sand at low tide`);
    assert.ok(points.some(s=>rockContactStrength(s,0)>.5),`rock ${rock} also meets the remaining sea`);
  }
});

test('the entire moving glint and its stroke stay outside touching rock faces',()=>{
  // Check the full swept curve, not just its centre: adjacent stones and sharp
  // corners must not receive a highlight from the outside-contact animation.
  for(const s of rockContactSamples())for(const pulse of [0,.25,.5,.75,1]){
    const d=2.8+pulse*1.3,x=s.x+s.nx*d,y=s.y+s.ny*d;
    for(let i=0;i<=10;i++){
      const t=i/10,u=1-t;
      const px=u*u*(x+s.ny*2.7)+2*u*t*(x+s.nx*.65)+t*t*(x-s.ny*2.7);
      const py=u*u*(y-s.nx*2.7)+2*u*t*(y+s.ny*.65)+t*t*(y+s.nx*2.7);
      for(const offset of [-.4,0,.4])assert.equal(blockedAt(px+s.nx*offset,py+s.ny*offset),false,
        `contact glint must not draw over rock ${s.rock} or a neighbour`);
    }
  }
});
