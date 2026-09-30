import test from 'node:test';
import assert from 'node:assert/strict';
import {getPreset} from '../src/themes/cats/catalog.js';
import {normalizeCustomization} from '../src/themes/cats/customization.js';
import {catLandmarks,deformCatPoint,inverseCatPoint,customizationRenderKey} from '../src/themes/cats/morphology.js';
import {validateDesign,exportDesign,importDesign,saveCats,loadCats,CATS_STORAGE_KEY} from '../src/themes/cats/storage.js';
import {CatGame} from '../src/themes/cats/game.js';
import {CAT_ACTION_EYES} from '../src/themes/cats/action-eye-landmarks.js';

const appearance={version:1,strokes:[{color:'#d79c62',size:.04,region:'body',points:[{x:.5,y:.45}],erase:false,symmetric:false}]};
const customization={version:1,size:1.24,build:1.2,earSize:1.22,earShape:'pointed',eyeColor:'#799b70'};
test('old painted cats gain default controls without losing old fur or identity',()=>{
 const old={presetId:'ragdoll',name:'旧朋友',personality:'friendly',appearance};
 const cat=validateDesign(old);assert.deepEqual(cat.appearance,appearance);assert.deepEqual(cat.customization,normalizeCustomization());
 assert.deepEqual(importDesign(exportDesign(cat)),cat);
});
test('new cat controls and personality survive game edits, persistence and reload',()=>{
 const game=new CatGame(null,{random:()=>.5}),id=game.cats[0].id;
 assert.equal(game.editCat(id,{presetId:'ragdoll',name:'小月亮',personality:'curious',appearance,customization}).ok,true);
 const db=new Map(),storage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 assert.equal(saveCats(game.snapshot(),storage),true);assert.ok(db.has(CATS_STORAGE_KEY));
 const restored=new CatGame(loadCats(storage)),cat=restored.cats.find(c=>c.id===id);
 assert.deepEqual(cat.customization,customization);assert.equal(cat.personality,'curious');assert.deepEqual(cat.appearance,appearance);
});
test('invalid parameter imports cannot replace a saved cat design',()=>{
 const good={presetId:'ragdoll',name:'猫',personality:'playful',appearance,customization};
 for(const bad of [{...customization,version:99},{...customization,size:Infinity},{...customization,eyeColor:'url(x)'},{...customization,build:20}])assert.equal(validateDesign({...good,customization:bad}),null);
 assert.equal(validateDesign({...good,personality:'unknown'}),null);
});
test('body and ears deform locally and remain invertible, not a global sprite stretch',()=>{
 const landmarks=catLandmarks(getPreset('ragdoll')),config=normalizeCustomization(customization);
 for(const p of [{x:.40,y:.4},{x:.6,y:.5},{x:.8,y:.3},{x:.2,y:.44},{x:.35,y:.49}]){
  const q=deformCatPoint(p,landmarks,config),back=inverseCatPoint(q,landmarks,config);
  assert.ok(Math.hypot(back.x-p.x,back.y-p.y)<.002,'inverse mapping must preserve local pixels');
 }
 const tip=landmarks.ears[0].tip,moved=deformCatPoint(tip,landmarks,config);
 assert.ok(Math.hypot(moved.x-tip.x,moved.y-tip.y)>.004,'ear control moves the ear tip');
 const corner={x:.02,y:.98},still=deformCatPoint(corner,landmarks,config);assert.ok(Math.hypot(still.x-corner.x,still.y-corner.y)<.0001);
 assert.equal(customizationRenderKey(customization),customizationRenderKey({...customization,size:.8}),'size scales the scene only and reuses appearance texture');
});
test('action irises follow measured source pixels through crop mapping, never portrait head guesses',()=>{
 const preset=getPreset('british-shorthair'),sourceMapping={x:.08,y:.02,width:.80,height:.93};
 const frame={index:8,sourceMapping,parts:{head:[.1,.1,.3,.3],body:preset.regions.body}};
 const eyes=catLandmarks(preset,frame).eyes;
 assert.equal(eyes.length,2);
 eyes.forEach((e,i)=>{const source=CAT_ACTION_EYES[preset.id][8][i];assert.ok(Math.abs((e.x-sourceMapping.x)/sourceMapping.width-source.x)<1e-12);assert.ok(Math.abs((e.y-sourceMapping.y)/sourceMapping.height-source.y)<1e-12)});
 assert.deepEqual(catLandmarks(preset,{...frame,parts:{...frame.parts,head:[.5,.5,.1,.1]}}).eyes,eyes,'head deformation bounds cannot relocate original iris pixels');
 for(const index of [4,5,6,7,9,10,12,13,14])assert.deepEqual(catLandmarks(preset,{...frame,index}).eyes,[],'closed eyes or backs have no iris paint');
 assert.deepEqual(catLandmarks(preset,{...frame,sourceMapping:null}).eyes,[],'unmapped new pose must not paint arbitrary face areas');
});
