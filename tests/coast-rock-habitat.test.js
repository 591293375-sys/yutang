import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRockHabitat,fishRockRadius} from '../src/themes/coast/rock-habitat.js';
import {setRockHabitat,blockedAt,isHabitatValid,pathIsHabitatValid,rockBodyClear} from '../src/themes/coast/geometry.js';
import {CoastGame} from '../src/themes/coast/game.js';
import {SPECIES_BY_ID} from '../src/themes/coast/catalog.js';
import {surfaceDisplacement} from '../src/themes/coast/water.js';

const rgba=new Uint8ClampedArray(800*450*4);
for(let y=120;y<140;y++)for(let x=295;x<325;x++)rgba[(y*800+x)*4+3]=255;
// Dust and a soft shadow must not turn into gameplay obstacles.
rgba[(160*800+350)*4+3]=255;
for(let y=150;y<165;y++)for(let x=350;x<370;x++)rgba[(y*800+x)*4+3]=80;
const material=makeRockHabitat(rgba,800,450);

test('material collision follows solid visible rock, excludes dust, and keeps fallback geometry',()=>{
 setRockHabitat(null);assert.equal(blockedAt(610,260),false,'new rock is outside the old hull');
 try{setRockHabitat(material);assert.equal(blockedAt(610,260),true);assert.equal(blockedAt(710,315),false);assert.equal(blockedAt(700,320),false);
  for(const tide of [0,.5,1])assert.equal(isHabitatValid('fish_silver',610,260,tide),false);
 }finally{setRockHabitat(null)}
 assert.equal(blockedAt(610,260),false);
});

test('fish nose, tail and turning envelope cannot graze a rock although its center is clear',()=>{
 try{setRockHabitat(material);
  assert.equal(blockedAt(570,260),false);assert.equal(isHabitatValid('fish_silver',570,260,1,13),false,'an explicit old 13px radius cannot bypass body clearance');
  assert.equal(isHabitatValid('fish_silver',550,260,1),true);
  assert.equal(pathIsHabitatValid('fish_silver',550,260,690,260,1),false,'fast motion cannot tunnel through new material');
  assert.ok(fishRockRadius(SPECIES_BY_ID.fish_silver)>25);
 }finally{setRockHabitat(null)}
});

test('loading new rock material repairs the same saved fish once, with no rewards or population change',()=>{
 setRockHabitat(null);
 const entity={id:'saved-fish',species:'fish_silver',x:610,y:260,heading:0,phase:0,state:'scene',submerged:true,concealmentInitialized:true};
 const game=new CoastGame({version:1,epochMs:0,nextId:2,entities:[entity],catalog:{},shells:7,rescues:3},0,()=>.3);
 try{setRockHabitat(material);game.update(0,0);const fish=game.entities[0],at={x:fish.x,y:fish.y};
  assert.equal(fish.id,'saved-fish');assert.equal(game.entities.length,1);assert.equal(game.shells,7);assert.equal(game.rescues,3);
  assert.ok(Math.hypot(fish.x-610,fish.y-260)<80);assert.ok(isHabitatValid(fish.species,fish.x,fish.y,0));
  game.update(0,0);assert.deepEqual({x:fish.x,y:fish.y},at,'migration is not repeatedly reapplied');
  for(let frame=1;frame<=1200;frame++){game.update(1/60,frame*1000/60);assert.ok(rockBodyClear(fish.species,fish.x,fish.y),'whole body crossed a rock at '+frame);}
 }finally{setRockHabitat(null)}
});

test('surface swells travel continuously and stop under reduced motion',()=>{
 let changes=0;
 for(let y=0;y<=900;y+=25){
  assert.equal(surfaceDisplacement(y,100,true),0);
  if(Math.abs(surfaceDisplacement(y,0)-surfaceDisplacement(y,2))>2)changes++;
  for(let t=0;t<10;t+=.1){assert.ok(Math.abs(surfaceDisplacement(y,t))<=8.2+1e-9);assert.ok(Math.abs(surfaceDisplacement(y,t+1/60)-surfaceDisplacement(y,t))<.09);}
 }
 assert.ok(changes>20,'a visible, gentle displacement must occur across the water');
});

test('reentering an installed material restores repaired coordinates and clears stranded state without rewards',()=>{
 try{setRockHabitat(material);
  const game=new CoastGame({version:1,epochMs:0,nextId:2,entities:[{id:'old-stranded',species:'fish_silver',x:610,y:260,heading:0,phase:0,state:'scene',stranded:true,submerged:false,concealmentInitialized:true}],catalog:{},shells:8,rescues:4},0,()=>.3);
  const fish=game.entities[0];assert.equal(fish.id,'old-stranded');assert.equal(fish.stranded,false);assert.equal(game.rescues,4);assert.equal(game.shells,8);
  const restored=new CoastGame(game.snapshot(),0,()=>.3);assert.equal(restored.entities[0].id,fish.id);assert.equal(restored.entities[0].x,fish.x);assert.equal(restored.entities[0].y,fish.y);
  // Reloading the same art creates a new cache generation, but legal residents
  // remain in place; an unrelated renderer teardown must not remove its mask.
  setRockHabitat(makeRockHabitat(rgba,800,450));restored.update(0,0);
  assert.equal(restored.entities[0].x,fish.x);assert.equal(restored.entities[0].y,fish.y);assert.equal(restored.rescues,4);
 }finally{setRockHabitat(null)}
});

test('crevice discovery follows the new visible rock boundary',()=>{
 try{setRockHabitat(material);const game=new CoastGame({version:1,epochMs:0,nextId:1,entities:[]},0,()=>.3);
  const crevice=game.findCrevice({species:'fish_silver',x:550,y:260});assert.ok(crevice);
  assert.ok(blockedAt(crevice.anchor.x,crevice.anchor.y));assert.ok(isHabitatValid('fish_silver',crevice.x,crevice.y,0));
  assert.ok(pathIsHabitatValid('fish_silver',crevice.x,crevice.y,crevice.exit.x,crevice.exit.y,0));
 }finally{setRockHabitat(null)}
});
