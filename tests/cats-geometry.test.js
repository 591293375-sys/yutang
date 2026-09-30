import test from 'node:test';
import assert from 'node:assert/strict';
import {coverTransform,screenToWorld,worldToScreen,isWalkable,segmentWalkable,findPath,nearestWalkable,hitCat,FACILITIES,hitFacility,SURFACES,SLEEP_SLOTS} from '../src/themes/cats/geometry.js';
import {resolveEnvironment,normalizeEnvironment} from '../src/themes/cats/environment.js';
test('courtyard coordinates roundtrip through wide, tall, retina, and 4K covers',()=>{
 for(const [w,h] of [[1280,720],[1045,887],[600,950],[3840,2160]])for(const point of [{x:.32,y:.38},{x:.8,y:.76},{x:.57,y:.21}]){
  const t=coverTransform(w,h),screen=worldToScreen(point,t),restored=screenToWorld(screen,t);
  assert.ok(Math.abs(restored.x-point.x)<1e-12&&Math.abs(restored.y-point.y)<1e-12);
 }
});
test('flowerbeds and tall furniture remain blocked while bed and flat rock are reachable surfaces',()=>{
 for(const p of [{x:.1,y:.5},{x:.26,y:.415},{x:.965,y:.4},{x:.99,y:.99}])assert.equal(isWalkable(p),false);
 for(const p of [{x:.5,y:.5},{x:.7,y:.7},FACILITIES.bed.approach,FACILITIES.water.approach,FACILITIES.rock.approach,{x:.739,y:.09}])assert.ok(isWalkable(p),JSON.stringify(p));
});
test('navigation connects the garden and porch without cutting across vegetation',()=>{
 const from={x:.4,y:.7},to=FACILITIES.bed.approach,path=findPath(from,to);assert.ok(path?.length);
 let prev=from;for(const next of path){assert.ok(segmentWalkable(prev,next));prev=next;}
 assert.deepEqual(path.at(-1),to);
 assert.equal(findPath(from,{x:.1,y:.5}),null);
});
test('restoring unsafe coordinates finds a safe paving location',()=>{
 const fixed=nearestWalkable({x:.96,y:.4});assert.ok(isWalkable(fixed));
 assert.equal(nearestWalkable({x:0,y:0},.01),null);
});
test('hit testing follows the visible torso above feet and foreground order',()=>{
 const back={id:'a',active:true,x:.5,y:.5},front={id:'b',active:true,x:.5,y:.52};
 assert.equal(hitCat([back,front],{x:.5,y:.48})?.id,'b');assert.equal(hitCat([back],{x:.5,y:.60}),null);
 assert.equal(hitCat([{...back,active:false}],{x:.5,y:.47}),null);
});
test('season and local clock phase boundaries follow the courtyard specification',()=>{
 const dates=[[2,1,'winter'],[3,1,'spring'],[5,31,'spring'],[6,1,'summer'],[9,1,'autumn'],[12,1,'winter']];
 for(const [month,day,season] of dates)assert.equal(resolveEnvironment({},new Date(2026,month-1,day,12)).season,season);
 for(const [hour,time] of [[4,'night'],[5,'night'],[6,'night'],[7,'day'],[8,'day'],[16,'day'],[17,'day'],[18,'day'],[19,'night']])assert.equal(resolveEnvironment({},new Date(2026,5,1,hour)).time,time);
 const manual=resolveEnvironment({season:'winter',time:'night'},new Date(2026,5,1,12));assert.equal(manual.fireflyCount,0);
 assert.equal(resolveEnvironment({season:'summer',time:'night',fireflies:false}).fireflyCount,0);
 assert.equal(resolveEnvironment({season:'spring',time:'day'}).fireflyCount,0);
 assert.ok(resolveEnvironment({season:'summer',time:'night'}).fireflyCount>0);
 assert.deepEqual(normalizeEnvironment({time:'bad',season:'bad'}),{season:'auto',time:'auto',fireflies:true,particles:true});
});
test('a blocked straight line is replaced with a valid multi-segment route',()=>{
 let fixture=null;
 const points=[];for(let y=.17;y<.9;y+=.04)for(let x=.24;x<.88;x+=.04)if(isWalkable({x,y}))points.push({x,y});
 for(const a of points){for(const b of points){if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<.18||segmentWalkable(a,b))continue;const path=findPath(a,b);if(path?.length>1){fixture={a,path};break;}}if(fixture)break;}
 assert.ok(fixture,'the scene contains a navigable concave or blocked route');let p=fixture.a;
 for(const next of fixture.path){assert.ok(segmentWalkable(p,next),'no returned segment cuts through a plant or facility');p=next;}
});

test('courtyard painting covers every viewport corner without letterboxing or distorting hit coordinates',()=>{
 for(const [width,height] of [[1000,850],[1045,887],[600,950],[320,900],[3840,1080],[3840,2160]]){
  const transform=coverTransform(width,height);
  assert.ok(transform.offsetX<=1e-9&&transform.offsetY<=1e-9,'painting must reach the top and left edges');
  assert.ok(transform.offsetX+transform.drawWidth>=width-1e-9&&transform.offsetY+transform.drawHeight>=height-1e-9,'painting must reach the bottom and right edges');
  assert.ok(Math.abs(transform.drawWidth/transform.drawHeight-16/9)<1e-12);
  for(const point of [...Object.values(FACILITIES),...SLEEP_SLOTS,...SURFACES.flatMap(s=>s.polygon)]){
   const pixel=worldToScreen(point,transform);
   const roundtrip=screenToWorld(pixel,transform);assert.ok(Math.abs(roundtrip.x-point.x)<1e-12&&Math.abs(roundtrip.y-point.y)<1e-12);
  }
  for(const pixel of [{x:0,y:0},{x:width,y:height},{x:width,y:0},{x:0,y:height}]){
   const world=screenToWorld(pixel,transform);assert.ok(world.x>=-1e-9&&world.x<=1+1e-9&&world.y>=-1e-9&&world.y<=1+1e-9,'each visible corner comes from actual courtyard artwork');
  }
 }
 const t=coverTransform(1045,899),step=worldToScreen(FACILITIES.step,t);
 assert.equal(hitFacility(screenToWorld(step,t))?.id,'step','visible step hit stays on the painted step');
 assert.ok(isWalkable(screenToWorld(worldToScreen({x:.58,y:.60},t),t)),'visible paving remains a valid tool target');
});

test('facility hit areas follow actual surfaces and cannot steal nearby paving clicks',()=>{
 for(const id of ['bed','step','rock','water','climbing'])assert.equal(hitFacility(FACILITIES[id])?.id,id);
 assert.equal(hitFacility({x:.704,y:.149})?.id,'bed','the low mat rim is part of its interaction area');
 assert.equal(hitFacility({x:.273,y:.89})?.id,'rock');assert.equal(hitFacility({x:.945,y:.55})?.id,'climbing');
 assert.equal(hitFacility({x:.52,y:.58}),null);assert.equal(hitFacility({x:.857,y:.574}),null,'climbing takeoff paving is not itself the raised platform');
 assert.equal(hitFacility({x:.832,y:.177}),null,'outside the bowl outline stays unselected');
 assert.equal(hitFacility({x:NaN,y:0}),null);assert.equal(hitFacility({x:Infinity,y:0}),null);
});
