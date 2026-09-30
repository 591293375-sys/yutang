import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CAT_PRESETS} from '../src/themes/cats/catalog.js';
import {CAT_SOURCE_RECTS} from '../src/themes/cats/action-source-rects.js';
import {CAT_ACTION_EYES,CAT_ACTION_EYES_VERSION} from '../src/themes/cats/action-eye-landmarks.js';

const visible=[0,1,2,3,8,11,15],closed=[4,5,6,7,9,10,12,13,14];
test('every real cat atlas has calibrated visible irises and explicit closed-eye frames',()=>{
 assert.equal(CAT_ACTION_EYES_VERSION,1);
 assert.deepEqual(Object.keys(CAT_ACTION_EYES).sort(),CAT_PRESETS.map(p=>p.id).sort());
 let count=0;
 for(const preset of CAT_PRESETS){
  const frames=CAT_ACTION_EYES[preset.id];assert.equal(frames.length,16,preset.id);
  for(const index of visible){assert.equal(frames[index].length,2,`${preset.id} ${index}: visible eyes cannot lose color`);count+=frames[index].length;}
  for(const index of closed)assert.deepEqual(frames[index],[],`${preset.id} ${index}: closed lids and back fur must not be recolored`);
 }
 assert.equal(count,224);
});
test('iris ellipses fit the actual source rectangles, including the non-square Norwegian atlas',()=>{
 for(const[id,frames]of Object.entries(CAT_ACTION_EYES))for(let index=0;index<frames.length;index++){
  const [,,width,height]=CAT_SOURCE_RECTS[id].sourceRects[index];
  for(const eye of frames[index]){
   assert.ok(Object.values(eye).every(Number.isFinite));
   assert.ok(eye.x-eye.rx>0&&eye.x+eye.rx<1&&eye.y-eye.ry>0&&eye.y+eye.ry<1);
   assert.ok(eye.rx*width>=3&&eye.rx*width<=12,`${id} ${index}: radius excludes face fur`);
   assert.ok(eye.ry*height>=3&&eye.ry*height<=12,`${id} ${index}: radius excludes face fur`);
  }
 }
 assert.deepEqual(CAT_SOURCE_RECTS['norwegian-forest'].sourceSize,[1447,1087]);
});
test('replacement artwork requires reviewing its calibrated eye landmarks again',async()=>{
 const calibration=JSON.parse(await readFile(new URL('../docs/cat-art-v3/action-eyes-validation.json',import.meta.url),'utf8'));
 for(const id of Object.keys(CAT_ACTION_EYES)){
  assert.deepEqual(CAT_SOURCE_RECTS[id],calibration.sourceRects[id],`${id}: source crop changed; recalibrate iris mapping`);
  const pixels=await readFile(new URL('../public/assets/cats/actions-v2/'+id+'.webp',import.meta.url));
  assert.equal(createHash('sha256').update(pixels).digest('hex'),calibration.atlasSha256[id],`${id}: artwork changed; recalibrate iris centers`);
 }
});
