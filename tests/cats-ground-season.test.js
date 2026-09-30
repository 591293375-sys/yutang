import test from 'node:test';
import assert from 'node:assert/strict';
import {CAT_FIXED_FACILITIES,groundPigment,groundBlend,groundDecorations,isSeasonGroundPoint} from '../src/themes/cats/ground-season.js';

test('seasonal ground includes central paving but excludes fixed facilities',()=>{
 for(const [x,y]of[[.50,.50],[.65,.70],[.43,.84],[.70,.40]])assert.equal(isSeasonGroundPoint(x,y),true);
 for(const [x,y]of CAT_FIXED_FACILITIES)assert.equal(isSeasonGroundPoint(x,y),false);
 for(const [x,y]of[[.04,.54],[.98,.58],[.72,.12],[-.1,.5]])assert.equal(isSeasonGroundPoint(x,y),false);
});
test('moss changes material by season while summer preserves the original image',()=>{
 const moss=[125,162,58],spring=groundPigment(...moss,'spring'),autumn=groundPigment(...moss,'autumn'),winter=groundPigment(...moss,'winter');
 assert.equal(groundPigment(...moss,'summer')[3],0);
 assert.ok(spring[1]>spring[0]&&spring[3]>40,'spring creates fresh green moss');
 assert.ok(autumn[0]>autumn[1]&&autumn[3]>100,'autumn replaces moss with warm dormant growth');
 assert.ok(winter[0]>210&&winter[1]>225&&winter[3]>150,'winter frost follows actual moss pixels');
 assert.ok(groundPigment(205,205,200,'spring')[3]<spring[3],'paving receives much less pigment than actual moss');
 assert.ok(groundPigment(205,205,200,'autumn')[3]<autumn[3],'stone retains more original texture than dormant moss');
 assert.ok(groundPigment(...moss,'winter',true)[0]<winter[0]*.6,'night frost accepts scene lighting');
});
test('ground petals and leaves have deterministic center coverage and avoid fixtures',()=>{
 for(const season of ['spring','autumn']){
  const marks=groundDecorations(season);assert.deepEqual(marks,groundDecorations(season));assert.ok(marks.length>=30&&marks.length<50);
  assert.ok(marks.filter(p=>p.x>.40&&p.x<.75&&p.y>.40&&p.y<.83).length>=9,'the center cannot remain seasonless');
  assert.ok(marks.every(p=>isSeasonGroundPoint(p.x,p.y)));
 }
 assert.deepEqual(groundDecorations('summer'),[]);assert.deepEqual(groundDecorations('winter'),[],'winter uses the original moss mask, not floating snow-dot decoration');
});
test('material masks preserve native fine-detail contrast and keep night highlights quiet',()=>{
 assert.deepEqual(groundBlend(150,190,210,'summer'),{multiply:[255,255,255],screen:[0,0,0]});
 for(const season of ['spring','autumn','winter']){
  const day=groundBlend(205,205,200,season),night=groundBlend(205,205,200,season,true);
  for(let k=0;k<3;k++){
   assert.ok(Number.isFinite(day.multiply[k])&&Number.isFinite(day.screen[k]));
   const contrast=day.multiply[k]/255*(1-day.screen[k]/255);
   assert.ok(contrast>.55,'small native stone features remain distinct beneath the material masks');
   assert.ok(night.screen[k]<=Math.ceil(day.screen[k]*.18),'night cannot reproduce noon-bright frost');
   assert.equal(night.multiply[k],day.multiply[k]);
  }
 }
});
