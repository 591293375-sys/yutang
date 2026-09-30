import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame,CAT_LIMITS,CAT_PERSONAL_SPACE} from '../src/themes/cats/game.js';
import {isWalkable,distance,FACILITIES} from '../src/themes/cats/geometry.js';
import {loadCats,saveCats,validateDesign,exportDesign,importDesign,CATS_STORAGE_KEY} from '../src/themes/cats/storage.js';
const seeded=()=>{let seed=4381;return()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);};
const make=()=>new CatGame(null,{random:seeded()});
const run=(game,seconds)=>{for(let i=0;i<seconds*30;i++)game.update(1/30,{time:'day'});};
const design=(name='小雪')=>({presetId:'ragdoll',name,personality:'friendly',appearance:{version:1,strokes:[{color:'#fcad84',size:.04,erase:false,points:[{x:.43,y:.55},{x:.47,y:.61}],region:'body',symmetric:true}]}});
test('first visit has the exact three defaults and collection can exceed active capacity',()=>{
 const game=make();assert.deepEqual(game.cats.map(c=>c.presetId),['ragdoll','british-shorthair','domestic-orange-white']);
 for(let i=0;i<12;i++)assert.ok(game.addCat(design(`猫${i}`)).ok);
 assert.equal(game.view().activeCount,CAT_LIMITS.active);assert.equal(game.cats.length,15);
 const inactive=game.cats.find(c=>!c.active);assert.equal(game.setActive(inactive.id,true).ok,false);
 game.archiveCat(game.cats[0].id);assert.ok(game.setActive(inactive.id,true).ok);assert.equal(game.view().activeCount,12);
});
test('manual commands use the named cat and atomically release its previous target',()=>{
 const game=make(),cat=game.cats[0],other=game.cats[1];
 const first=game.command('food',{x:.8,y:.7},cat.id);assert.ok(first.ok);assert.deepEqual(first.catIds,[cat.id]);assert.equal(other.task,null);
 const old=game.props.find(p=>p.id===first.propId);const next=game.command('pet',{x:.1,y:.1},cat.id);assert.ok(next.ok);
 assert.equal(old.catIds.length,0);assert.equal(cat.task.tool,'pet');assert.equal(cat.target,null);assert.equal(cat.state,'interact');
 for(let i=0;i<45;i++)game.command('yarn',{x:.5,y:.5},cat.id);
 assert.ok(game.props.filter(p=>!p.persistent).length<=CAT_LIMITS.temporaryProps);
 assert.ok(game.props.filter(p=>p.catIds.includes(cat.id)).length===1);
});
test('ground feeding assigns at most two reachable cats and refuses plants without side effects',()=>{
 const game=make(),food=game.command('food',{x:.56,y:.59});assert.ok(food.ok);assert.equal(food.catIds.length,2);
 const before=game.props.length,result=game.command('mouse',{x:.96,y:.54});assert.equal(result.ok,false);assert.equal(game.props.length,before);
 run(game,24);for(const cat of game.cats)assert.ok(isWalkable(cat));assert.ok(game.cats.filter(c=>c.interactions>0).length>=1);
});
test('each tool completes with feedback and cats stay on safe paving',()=>{
 for(const tool of ['food','yarn','scratch','mouse','pet']){
  const game=make(),cat=game.cats[0],old={x:cat.x,y:cat.y};assert.ok(game.command(tool,old,cat.id).ok);if(tool==='pet'){run(game,1);assert.equal(distance(old,cat),0,'petting must never teleport or move the cat');}run(game,25);
  assert.ok(cat.interactions>=1,`${tool} should complete`);assert.ok(isWalkable(cat));

 }
 const game=make();assert.ok(game.command('wand',{x:.54,y:.54},game.cats[0].id).ok);run(game,17);assert.equal(game.cats[0].task,null,'inactive wand auto ends');
});
test('persistent boards are capped, movable, removable, and snapshots omit transient tasks',()=>{
 const game=make();for(const p of [{x:.50,y:.5},{x:.65,y:.6},{x:.75,y:.7}])assert.ok(game.command('scratch',p,game.cats[0].id).ok);
 assert.equal(game.command('scratch',{x:.58,y:.55},game.cats[0].id).ok,false);
 const board=game.props.find(p=>p.persistent);assert.equal(game.moveProp(board.id,{x:.1,y:.1}).ok,false);assert.ok(game.moveProp(board.id,{x:.61,y:.64}).ok);
 game.command('pet',game.cats[1],game.cats[1].id);const snapshot=game.snapshot();assert.ok(snapshot.props.every(p=>p.tool==='scratch'));assert.ok(snapshot.cats.every(c=>!('task' in c)&&!('path' in c)));
 const restored=new CatGame(snapshot,{random:seeded()});assert.equal(restored.props.length,3);assert.ok(restored.cats.every(c=>c.task===null&&isWalkable(c)));
 game.clearTransient();assert.ok(game.cats.every(c=>!c.task));assert.ok(game.props.every(p=>p.persistent&&p.catIds.length===0));game.removeProp(board.id);assert.equal(game.props.length,2);
});
test('fur appearance survives export, save, reload and editing without shared object mutation',()=>{
 const game=make(),input=design(),added=game.addCat(input);assert.ok(added.ok);input.appearance.strokes[0].points[0].x=.9;assert.equal(added.cat.appearance.strokes[0].points[0].x,.43);
 const exported=exportDesign(added.cat);assert.deepEqual(importDesign(exported),validateDesign(added.cat));
 const map=new Map([['fusheng-fish','old koi'],['mofish-coast-v1','old coast']]),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
 assert.ok(saveCats(game.snapshot(),storage));const restored=new CatGame(loadCats(storage));assert.deepEqual(restored.cats.find(c=>c.id===added.cat.id).appearance,added.cat.appearance);
 assert.equal(map.get('fusheng-fish'),'old koi');assert.equal(map.get('mofish-coast-v1'),'old coast');assert.ok(map.has(CATS_STORAGE_KEY));
 const edit=design('新名字');assert.ok(game.editCat(added.cat.id,edit).ok);edit.appearance.strokes=[];assert.equal(added.cat.appearance.strokes.length,1);
});
test('malformed imports are rejected without changing existing cats',()=>{
 assert.equal(importDesign('{no}'),null);assert.equal(importDesign({format:'mofish-cat',version:9,design:design()}),null);
 const invalid=design();invalid.appearance.strokes[0].points[0].x=Infinity;assert.equal(validateDesign(invalid),null);
 const wrong=design();wrong.presetId='__proto__';assert.equal(validateDesign(wrong),null);
 const game=make(),before=JSON.stringify(game.snapshot());assert.equal(game.editCat(game.cats[0].id,invalid).ok,false);assert.equal(JSON.stringify(game.snapshot()),before);
});

test('scratch boards can be reused and moved without retaining old reservations',()=>{
 const game=make(),first=game.command('scratch',game.cats[0],game.cats[0].id);run(game,15);
 const board=game.props.find(p=>p.id===first.propId);assert.ok(board.persistent);assert.equal(board.catIds.length,0);
 assert.ok(game.useProp(board.id,game.cats[1].id).ok);assert.equal(game.props.length,1);assert.deepEqual(board.catIds,[game.cats[1].id]);
 assert.ok(game.useProp(board.id,game.cats[0].id).ok);assert.equal(game.cats[1].task,null);assert.deepEqual(board.catIds,[game.cats[0].id]);
 assert.ok(game.moveProp(board.id,{x:.6,y:.65}).ok);assert.ok(game.cats.every(c=>!c.task));
});
test('playing toys roll instead of teleporting and a new named wand target replaces the old one',()=>{
 const game=make(),result=game.command('yarn',game.cats[0],game.cats[0].id);const prop=game.props.find(p=>p.id===result.propId);
 let old={x:prop.x,y:prop.y},moved=false;for(let i=0;i<400;i++){game.update(1/30,{});const delta=distance(prop,old);assert.ok(delta<=.023/30+.00001,'rolling displacement obeys physical speed');if(delta>0)moved=true;old={x:prop.x,y:prop.y};}
 assert.ok(moved);
 game.command('wand',game.cats[0],game.cats[0].id);const first=game.cats[0].task?.propId;assert.ok(first);
 assert.ok(game.command('wand',game.cats[1],game.cats[1].id).ok);assert.equal(game.cats[0].task,null);assert.equal(game.cats[1].task.tool,'wand');assert.equal(game.props.filter(p=>p.tool==='wand').length,1);
});
test('existing painted facilities have reachable anchors without creating duplicate facility props',()=>{
 const game=make();assert.ok(game.visitFacility('bed',game.cats[0].id).ok);assert.equal(game.props.length,0);assert.ok(game.cats[0].path.length);
 assert.ok(game.visitFacility('climbing',game.cats[1].id).ok);assert.equal(game.props.length,0);assert.equal(game.cats[1].climbAction,'up');
});
test('long-running autonomous behavior keeps all active cats legal and reserves no unlimited objects',()=>{
 const game=make();for(let i=0;i<9;i++)game.addCat(design(`朋友${i}`));
 for(let tick=0;tick<5400;tick++){game.update(1/30,{night:tick>2700});if(tick%30===0)for(const c of game.cats)assert.ok(isWalkable(c),`${c.name} left the walkable garden`);}
 assert.equal(game.props.length,0);assert.equal(game.cats.length,12);assert.ok(game.cats.every(c=>!c.task));
});

test('wand idle timeout starts after arrival instead of expiring while the cat walks across the garden',()=>{
 const game=make(),cat=game.cats[0];cat.x=.31;cat.y=.74;
 const result=game.command('wand',{x:.8,y:.35});assert.ok(result.ok);
 const chosen=game.cats.find(c=>c.id===result.catIds[0]);
 // Force a long valid approach while preserving its assigned task.
 chosen.x=.31;chosen.y=.74;
 let arrival=-1;for(let tick=0;tick<2000;tick++){game.update(1/30,{});if(chosen.task?.phase==='interact'){arrival=game.time;break;}}
 assert.ok(arrival>12,'fixture reaches the toy after its former command-time timeout');
 assert.ok(chosen.task);run(game,3);assert.equal(chosen.task?.tool,'wand','the cat can watch and play after walking over');
});

test('a detailed valid design can be exported and imported within the file size budget',()=>{
 const detailed=design();detailed.appearance.strokes=Array.from({length:25},()=>({...design().appearance.strokes[0],points:Array.from({length:1600},(_,i)=>({x:(i+.1345567890123456)/1601,y:(1600-i+.3245678901234567)/1601}))}));
 const encoded=exportDesign(detailed);assert.ok(encoded.length<2500000);const restored=importDesign(encoded);assert.ok(restored);assert.equal(restored.appearance.strokes.length,25);assert.equal(restored.appearance.strokes[0].points.length,1600);
});

test('twelve cats rest across the night garden with reserved personal space, not a pile by the bed',()=>{
 let seed=3345;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),game=new CatGame(null,{random});
 for(let i=0;i<9;i++)game.addCat({...design(`夜猫${i}`),personality:'relaxed'});
 const slept=new Set();let minSpacing=1,minRestSpacing=1,maxByBed=0;
 for(let tick=0;tick<10800;tick++){game.update(1/30,{night:true});if(tick%30)continue;
  const cats=game.cats;for(let a=0;a<cats.length;a++)for(let b=a+1;b<cats.length;b++){const d=distance(cats[a],cats[b]);minSpacing=Math.min(minSpacing,d);if(['rest','sleep'].includes(cats[a].state)&&['rest','sleep'].includes(cats[b].state))minRestSpacing=Math.min(minRestSpacing,d);}
  const restingNearBed=cats.filter(c=>['rest','sleep'].includes(c.state)&&distance(c,FACILITIES.bed.approach)<.145).length;maxByBed=Math.max(maxByBed,restingNearBed);
  assert.ok(cats.filter(c=>c.restZone==='bed').length<=3,'bed rest reservations stay bounded');
  for(const cat of cats){assert.ok(isWalkable(cat));if(cat.state==='sleep')slept.add(cat.id);}
 }
 assert.ok(minSpacing>=.0449,`moving cats squeezed to ${minSpacing}`);assert.ok(minRestSpacing>=.05,`resting cats squeezed to ${minRestSpacing}`);assert.ok(maxByBed<=3,`bed attracted ${maxByBed} resting cats`);assert.equal(slept.size,12,'all cats can reach a resting spot rather than jamming on arrival');
});
test('old overlapping saves and returning cats restore into separated safe spots',()=>{
 const game=make(),saved=game.snapshot();saved.cats.forEach(c=>{c.x=.682;c.y=.204});
 const restored=new CatGame(saved,{random:seeded()});
 for(let i=0;i<restored.cats.length;i++)for(let j=i+1;j<restored.cats.length;j++)assert.ok(distance(restored.cats[i],restored.cats[j])>=CAT_PERSONAL_SPACE);
 const cat=restored.cats[0];restored.archiveCat(cat.id);cat.x=restored.cats[1].x;cat.y=restored.cats[1].y;assert.ok(restored.setActive(cat.id,true).ok);assert.ok(distance(cat,restored.cats[1])>=CAT_PERSONAL_SPACE);
});
test('two cats share food with distinct, comfortably spaced destinations',()=>{
 const game=make(),result=game.command('food',{x:.55,y:.59});assert.equal(result.catIds.length,2);
 const [a,b]=result.catIds.map(id=>game.cats.find(c=>c.id===id));assert.ok(distance(a.target,b.target)>=CAT_PERSONAL_SPACE);run(game,30);assert.ok(a.interactions>=1&&b.interactions>=1);
});


test('locomotion eases speed, turns continuously and places the final foot at its destination',()=>{
 const game=make(),cat=game.cats[0];game.cats.slice(1).forEach(c=>game.archiveCat(c.id));
 const target={x:.73,y:.68};cat.motionHeading=cat.heading=Math.PI;cat.facing=-1;assert.ok(game._route(cat,target));
 let previous={x:cat.x,y:cat.y},lastSpeed=cat.speed,lastHeading=cat.heading,maxSpeed=0,arrivingSpeed=0,frames=0;
 for(;frames<3000&&cat.path.length;frames++){
  game.update(1/60,{});const travelled=distance(previous,cat),delta=Math.atan2(Math.sin(cat.heading-lastHeading),Math.cos(cat.heading-lastHeading));
  assert.ok(isWalkable(cat));assert.ok(Math.abs(delta)<=5.6/60+1e-8,'body facing has a bounded angular velocity');
  assert.ok(cat.speed-lastSpeed<=.065/60+1e-8,'no sudden acceleration');assert.ok(travelled<.001,'no waypoint teleport');
  if(cat.path.length)arrivingSpeed=cat.speed;maxSpeed=Math.max(maxSpeed,cat.speed);previous={x:cat.x,y:cat.y};lastSpeed=cat.speed;lastHeading=cat.heading;
 }
 assert.ok(frames<3000);assert.ok(maxSpeed>.02);assert.ok(arrivingSpeed<.006,'cat slows down before planting the final paw');assert.ok(distance(cat,target)<1e-8);assert.equal(cat.speed,0);
});
test('near-vertical paths do not mirror the cat for tiny lateral corrections',()=>{
 const game=make(),cat=game.cats[0];game.cats.slice(1).forEach(c=>game.archiveCat(c.id));cat.heading=cat.motionHeading=Math.PI/2;cat.facing=1;
 assert.ok(game._route(cat,{x:cat.x+.0002,y:.74}));let flips=0,previous=cat.facing;
 for(let i=0;i<600&&cat.path.length;i++){game.update(1/60,{});if(cat.facing!==previous)flips++;previous=cat.facing;}
 assert.equal(flips,0);
});
test('size changes scale physical stride and reserved personal space without breaking tool commands',()=>{
 const game=make();for(const cat of game.cats)cat.customization={version:1,size:1.35};
 const result=game.command('food',{x:.56,y:.59});assert.ok(result.ok);assert.equal(result.catIds.length,2);
 const cats=result.catIds.map(id=>game.cats.find(c=>c.id===id));assert.ok(distance(cats[0].target,cats[1].target)>=.054*1.35,'larger cats reserve larger food stations');
 run(game,35);assert.ok(cats.every(cat=>cat.interactions>0));assert.ok(game.cats.every(cat=>isWalkable(cat)));
});


test('growing a sleeping cat reserves a larger legal resting place and walks there without teleporting',()=>{
 const game=make();game.archiveCat(game.cats[2].id);const [a,b]=game.cats;
 for(const cat of [a,b])game.setActive(cat.id,false);run(game,120);
 assert.equal(a.state,'sleep');assert.equal(b.state,'sleep');assert.ok(distance(a,b)<.045*1.35);
 const original=[a,b].map(c=>({x:c.x,y:c.y,slot:c.restIntent.slotId}));
 assert.ok(game.editCat(a.id,{...a,customization:{version:1,size:1.35}}).ok);
 assert.ok(game.editCat(b.id,{...b,customization:{version:1,size:1.35}}).ok);
 for(const [i,c]of[a,b].entries())assert.deepEqual({x:c.x,y:c.y},{x:original[i].x,y:original[i].y},'changing appearance never teleports the physical cat');
 const moving=[a,b].find((c,i)=>c.restIntent.slotId!==original[i].slot);assert.ok(moving?.path.length,'a resting cat takes the available exit');assert.equal(moving.restIntent.kind,'sleep');
 run(game,180);assert.equal(a.state,'sleep');assert.equal(b.state,'sleep');assert.ok(distance(a,b)>=.045*1.35);
 const restored=new CatGame(game.snapshot());assert.equal(restored.cats[1].state,'sleep');assert.equal(restored.cats[1].restIntent.slotId,b.restIntent.slotId);
});
test('growing an approaching cat repairs its target without duplicating props or losing the manual task',()=>{
 const game=make(),[a,b]=game.cats;game.archiveCat(game.cats[2].id);
 const result=game.command('food',{x:.56,y:.59});assert.equal(result.catIds.length,2);
 const original={x:a.x,y:a.y},propId=a.task.propId;
 assert.ok(game.editCat(a.id,{...a,customization:{version:1,size:1.35}}).ok);
 assert.deepEqual({x:a.x,y:a.y},original);assert.equal(a.task.propId,propId);assert.equal(game.props.length,1);
 assert.ok(distance(a.target,b.target)>=.054*(1.35+1)/2);run(game,40);
 assert.ok(a.interactions>0&&b.interactions>0);assert.ok(isWalkable(a)&&isWalkable(b));
});
test('personality changes movement speed and resting tendency while every personality accepts manual petting',()=>{
 const maxSpeed=personality=>{const game=make(),cat=game.cats[0];game.cats.slice(1).forEach(c=>game.archiveCat(c.id));cat.personality=personality;game._route(cat,{x:.75,y:.74});let max=0;for(let n=0;n<300;n++){game.update(1/60,{});max=Math.max(max,cat.speed)}return max;};
 assert.ok(maxSpeed('playful')>maxSpeed('sleepy')*1.4);
 for(const personality of ['active','relaxed','friendly','curious','shy','independent','playful','sleepy']){
  const game=make(),cat=game.cats[0];cat.personality=personality;cat.wait=0;game.random=()=>.25;game._decide(cat,{time:'day'});
  if(personality==='sleepy')assert.ok(cat.sleepSlotId);if(personality==='playful')assert.equal(cat.sleepSlotId,null);
  const pos={x:cat.x,y:cat.y};assert.ok(game.command('pet',cat,cat.id).ok);assert.equal(cat.task.tool,'pet');assert.deepEqual({x:cat.x,y:cat.y},pos);
 }
});


test('footsteps follow real walking distance and never displace an interaction event in a busy frame',()=>{
 const game=make(),cat=game.cats[0];game.cats.slice(1).forEach(c=>game.archiveCat(c.id));
 game._route(cat,{x:.74,y:.73});let footsteps=0;
 for(let i=0;i<600;i++){game.update(1/60,{});const events=game.drainEvents();assert.ok(events.filter(e=>e.type==='step').length<=1);footsteps+=events.filter(e=>e.type==='step').length;}
 assert.ok(footsteps>=4&&footsteps<35,'distance thresholds produce occasional, bounded footfalls');
 game.command('pet',cat,cat.id);for(let i=0;i<12;i++)game._event('step',{id:'other-'+i});
 const events=game.drainEvents();assert.ok(events.some(e=>e.type==='interaction'&&e.tool==='pet'));assert.equal(events.filter(e=>e.type==='step').length,1);
 game.archiveCat(cat.id);game.update(1/30,{});assert.equal(game.drainEvents().filter(e=>e.type==='step').length,0);
});
