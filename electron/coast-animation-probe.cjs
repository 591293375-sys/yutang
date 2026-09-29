'use strict';
// Import this function into the existing isolated Electron QA window, then:
// const result = await page.evaluate(measureCoastAnimalAnimation);
// No app mutations, no new windows, no filesystem or network access in the page.
async function measureCoastAnimalAnimation(){
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));let runtime;
 for(let fiber=canvas?.[key];fiber&&!runtime;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){const value=hook.memoizedState?.current;if(value?.renderer?.animalAnimations&&value?.game)runtime=value;}
 if(!runtime)throw Error('Mounted coast renderer not found');
 const renderer=runtime.renderer,game=runtime.game;if(renderer.sprites.size<17)throw Error('Wait for all 17 supplied animal sprites before checking animation');
 const probe=Object.assign(Object.create(Object.getPrototypeOf(renderer)),renderer,{animalAnimations:new Map()});
 const fullWater=new Path2D();fullWater.rect(-5000,-5000,10000,10000);probe.animalWaterPath=fullWater;
 const ids=['fish_silver','fish_clown','fish_puffer','shrimp','crab','sandcrab','hermit'];const results=[];
 const changed=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4){let diff=0;for(let k=0;k<4;k++)diff+=Math.abs(a[i+k]-b[i+k]);if(diff>35)count++;}return count};
 for(const id of ids){
  const species=game.getSpecies(id),source=game.entities.find(e=>e.state==='scene'&&!e.stranded&&game.getSpecies(e.species).kind===species.kind)||{x:800,y:150};
  const entity={...source,id:'animation-probe',species:id,state:'scene',concealment:null,stranded:false,phase:0,heading:0,renderHeading:0,speed:species.kind==='crab'?6:17,motionState:'moving',entry:null,emergeKind:null};
  for(const cover of [.75,1,1.25]){
   const samples=[],reduced=[];
   for(const phase of [0,.125,.25,.375,.5,.625,.75,.875]){
    probe.animalAnimations.set(entity.id,{phase});
    for(const [motion,output]of[[false,samples],[true,reduced]]){const frame=document.createElement('canvas');frame.width=96;frame.height=96;const ctx=frame.getContext('2d',{willReadFrequently:true});ctx.translate(48,48);ctx.scale(cover,cover);ctx.translate(-entity.x,-entity.y);probe.drawSprite(ctx,entity,species,0,{reducedMotion:motion});output.push(ctx.getImageData(0,0,96,96).data);}
   }
   const motionPixels=Math.max(...samples.slice(1).map(s=>changed(samples[0],s))),reducedPixels=Math.max(...reduced.slice(1).map(s=>changed(reduced[0],s)));
   if(motionPixels<15)throw Error(id+' has no visible animation at cover '+cover+' ('+motionPixels+' changed pixels)');
   if(reducedPixels!==0)throw Error(id+' changed despite reduced motion');
   results.push({species:id,cover,motionPixels,reducedPixels});
  }
 }
 const live=game.entities.find(e=>e.state==='scene'&&!e.concealment&&!e.stranded&&game.getSpecies(e.species).kind==='fish'),before=live&&renderer.animalAnimations.get(live.id);await new Promise(resolve=>setTimeout(resolve,350));const after=live&&renderer.animalAnimations.get(live.id);
 if(!before||!after||after.at<=before.at||after.phase===before.phase)throw Error('Live fish animation clock did not advance');
 const hits=[];for(const e of game.entities.filter(e=>e.state==='scene'&&!e.concealment&&!e.stranded).slice(0,12)){const rect=canvas.getBoundingClientRect();let hit=false;for(let dy=-12;dy<=12&&!hit;dy+=4)for(let dx=-12;dx<=12&&!hit;dx+=4){const p=renderer.worldToScreen(e.x+dx,e.y+dy);hit=renderer.hitTest(p.x+rect.left,p.y+rect.top,game)?.id===e.id;}if(hit)hits.push(e.id);}
 if(hits.length<3)throw Error('Animated alpha masks did not retain visible hit targets');
 return{result:'PASS',readOnly:true,livePhaseDelta:(after.phase-before.phase+1)%1,nativeFrameChecks:results,hitTargets:hits.length,spriteCacheFrames:renderer.sprites.get('fish_silver').frames.length,alphaStride:renderer.sprites.get('fish_silver').frames[0].alphaStride};
}
module.exports={measureCoastAnimalAnimation};
