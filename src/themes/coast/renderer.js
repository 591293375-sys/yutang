import {CoastWater} from './water.js';
import {drawBottles} from './bottle-renderer.js';
import {drawSurf} from './surf.js';
import {SPECIES,SPECIES_BY_ID,COAST_ASSETS,COAST_BACKGROUND} from './catalog.js';
import {WORLD_WIDTH as W,WORLD_HEIGHT as H,ROCKS,DRY_ROCKS,POOL,waterBoundary,PAINTED_WATER_BOUNDARY,habitatAt,blockedAt} from './geometry.js';
import {prepareAnimalSprite,animalDepth,spriteFrame,advanceAnimationPhase,concealed,concealmentPoint} from './animal-renderer.js';

export {COAST_BACKGROUND};
const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const makeCanvas=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
const linePath=(points,close=false)=>{const p=new Path2D();points.forEach((q,i)=>i?p.lineTo(q.x,q.y):p.moveTo(q.x,q.y));if(close)p.closePath();return p;};
const hash=i=>{const n=Math.sin(i*127.13+81.7)*43758.5453;return n-Math.floor(n);};
const SAND_BACKGROUND=`${import.meta.env?.BASE_URL || '/'}assets/coast/coast-sand.png`;

/** Canvas view only. Game rules, clocks, RAF, persistence and rewards live outside. */
export class CoastRenderer {
  constructor(canvas,backgroundCanvas,{background=COAST_BACKGROUND}={}){
    this.canvas=canvas;this.backgroundCanvas=backgroundCanvas;
    this.ctx=canvas.getContext('2d',{alpha:true});
    this.backgroundCtx=backgroundCanvas?.getContext('2d',{alpha:false});
    this.images=new Set();this.sprites=new Map();this.errors=[];this.disposed=false;
    this.water=new CoastWater();
    this.animalAnimations=new Map();this.animalWaterPath=null;this.animalWaterKey=-1;
    this.width=1;this.height=1;this.scale=1;this.cover=1;this.offsetX=0;this.offsetY=0;
    this.baseImage=null;this.baseCache=null;this.sandCache=null;this.ready=false;this.sourceSize=null;this.sandSourceSize=null;
    this.lowPath=linePath(waterBoundary(0),true);this.poolPath=linePath(POOL,true);
    this.paintedWaterPath=linePath(PAINTED_WATER_BOUNDARY,true);
    this.rocksPath=new Path2D();for(const rock of ROCKS)this.rocksPath.addPath(linePath(rock,true));
    this.dryRocksPath=new Path2D();for(const rock of DRY_ROCKS)this.dryRocksPath.addPath(linePath(rock,true));
    this.floodKey=-1;this.currentPath=this.lowPath;
    this.wetPeak=0;this.lastTime=null;this.frameTimes=[];this.entityCount=0;this.hoverId=null;
    this.baseURL=background;this.loadImage(background,image=>this.setBase(image,background),()=>{
      this.loadImage(COAST_ASSETS.original,image=>this.setBase(image,COAST_ASSETS.original));
    });
    this.loadImage(SAND_BACKGROUND,image=>this.setSand(image));
    for(const species of SPECIES)this.loadImage(species.asset,image=>this.cacheSprite(species,image));
  }

  loadImage(url,onload,onerror){
    const image=new Image();this.images.add(image);image.decoding='async';
    image.onload=()=>{image.onload=null;image.onerror=null;if(!this.disposed)onload(image);};
    image.onerror=()=>{image.onload=null;image.onerror=null;if(this.disposed)return;this.errors.push(url);onerror?.();};
    image.src=url;return image;
  }
  setBase(image,url){
    this.baseImage=image;this.baseURL=url;this.sourceSize=[image.naturalWidth,image.naturalHeight];
    // Keep the generated terrain's actual resolution, without claiming native 4K.
    const width=Math.min(3200,image.naturalWidth),height=Math.round(width*H/W);
    this.baseCache=makeCanvas(width,height);this.baseCache.getContext('2d').drawImage(image,0,0,width,height);
    this.water.setSea(this.baseCache);
    this.ready=true;this.floodKey=-1;this.drawBackground();
  }
  setSand(image){
    this.sandSourceSize=[image.naturalWidth,image.naturalHeight];
    const width=Math.min(3200,image.naturalWidth),height=Math.round(width*H/W);
    this.sandCache=makeCanvas(width,height);this.sandCache.getContext('2d').drawImage(image,0,0,width,height);
    this.drawBackground();
  }
  cacheSprite(species,image){
    this.sprites.set(species.id,prepareAnimalSprite(species,image));
  }
  resize({width,height,scale=1}){
    if(this.disposed)return;
    this.width=Math.max(1,width);this.height=Math.max(1,height);this.scale=clamp(scale,.5,4);
    this.cover=Math.max(this.width/W,this.height/H);
    this.offsetX=(this.width-W*this.cover)/2;this.offsetY=(this.height-H*this.cover)/2;
    for(const canvas of [this.canvas,this.backgroundCanvas].filter(Boolean)){
      canvas.width=Math.round(this.width*this.scale);canvas.height=Math.round(this.height*this.scale);
      // The scene wrapper measures CSS bounds on resize. Fixed inline pixels
      // would lock those measurements to the old viewport indefinitely.
      canvas.style.width='100%';canvas.style.height='100%';
    }
    this.drawBackground();
  }
  worldTransform(ctx){ctx.setTransform(this.scale*this.cover,0,0,this.scale*this.cover,this.offsetX*this.scale,this.offsetY*this.scale);}
  drawBackground(){
    const ctx=this.backgroundCtx;if(!ctx||this.disposed)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#a8d5ca';ctx.fillRect(0,0,this.backgroundCanvas.width,this.backgroundCanvas.height);
    if(this.baseCache){
      this.worldTransform(ctx);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(this.baseCache,0,0,W,H);
      this.drawDrySeabed(ctx);
    }
  }
  drawDrySeabed(ctx){
    if(!this.sandCache)return;
    // Only the old painted sea needs replacement. The original dry beach,
    // tide pool, vegetation and emergent rocks keep their exact artwork.
    ctx.save();ctx.clip(this.paintedWaterPath);ctx.drawImage(this.sandCache,0,0,W,H);ctx.restore();
    this.drawRockForeground(ctx);
  }
  drawRockForeground(ctx){
    if(!this.baseCache)return;
    ctx.save();ctx.clip(this.rocksPath);ctx.drawImage(this.baseCache,0,0,W,H);ctx.restore();
    // The marine painting has water colour baked into these rock faces. Their
    // aligned dry artwork is a fixed foreground, never blended by the tide.
    // The very same silhouettes also block animals and sand drawing.
    if(this.sandCache){ctx.save();ctx.clip(this.dryRocksPath);ctx.drawImage(this.sandCache,0,0,W,H);ctx.restore();}
  }
  screenToWorld(x,y){
    const rect=this.canvas.getBoundingClientRect();
    return{x:(x-rect.left-this.offsetX)/this.cover,y:(y-rect.top-this.offsetY)/this.cover};
  }
  worldToScreen(x,y){return{x:x*this.cover+this.offsetX,y:y*this.cover+this.offsetY};}

  updateFlood(level){
    const key=Math.round(clamp(level)*500);if(key===this.floodKey)return;
    this.floodKey=key;this.level=key/500;this.currentPath=linePath(waterBoundary(this.level),true);
  }
  drawWater(ctx,level,time,reducedMotion){
    this.updateFlood(level);this.water.update(level,this.wetPeak,time);
    if(this.sandCache){ctx.save();ctx.clip(this.paintedWaterPath);this.water.drawSea(ctx,this.currentPath);ctx.restore();}
    this.water.draw(ctx);
    // Refraction reuses the actual seabed beneath this water, preserving the
    // supplied painting instead of repeating a mirrored texture over the beach.
    if(this.baseCache&&!reducedMotion){
      ctx.save();ctx.clip(this.currentPath);ctx.globalAlpha=.025;
      const bands=18,bh=H/bands,sourceScale=this.baseCache.height/H;
      for(let i=0;i<bands;i++){
        const shift=Math.sin(time*.55+i*.76)*1.25;
        ctx.drawImage(this.baseCache,0,i*bh*sourceScale,this.baseCache.width,bh*sourceScale,shift,i*bh,W,bh+.3);
      }
      ctx.restore();
    }
    // Restrained highlights in the permanent tide pool.
    ctx.save();ctx.clip(this.poolPath);ctx.strokeStyle='rgba(230,255,236,.14)';ctx.lineWidth=.65;
    for(let i=0;i<4;i++){
      const x=1330+i*31,y=708+i*18+Math.sin(time*.24+i)*2;
      ctx.beginPath();ctx.ellipse(x,y,13+Math.sin(time*.2+i)*3,2.6,0,.35,2.35);ctx.stroke();
    }
    ctx.restore();
  }
  drawFoam(ctx,level,time,reducedMotion){
    drawSurf(ctx,{level,time,reducedMotion,waterPath:this.currentPath});
  }
  drawSandDrawing(ctx,drawing){
    if(!drawing?.segments?.length)return;
    const buckets=Array.from({length:8},()=>new Path2D());let width=3.2;
    for(const s of drawing.segments){if(s.alpha<=.01)continue;const p=buckets[Math.min(7,Math.floor(s.alpha*8))];p.moveTo(s.x1,s.y1);p.lineTo(s.x2,s.y2);width=s.width||width;}
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=0;i<buckets.length;i++){
      ctx.globalAlpha=(i+1)/8;ctx.strokeStyle='rgba(131,103,58,.47)';ctx.lineWidth=width;ctx.stroke(buckets[i]);
      ctx.save();ctx.translate(-.6,-.6);ctx.strokeStyle='rgba(255,241,198,.43)';ctx.lineWidth=.8;ctx.stroke(buckets[i]);ctx.restore();
    }
    ctx.restore();
  }

  spritePose(entity,species,time,options,transition){
    const sprite=this.sprites.get(species.id),habitat=habitatAt(entity.x,entity.y,this.level??0);
    const water=animalDepth(entity,species,habitat);
    const aspect=(sprite?.height||100)/(sprite?.width||140),artAspect=(sprite?.artHeight||sprite?.height||100)/(sprite?.artWidth||sprite?.width||140);
    // Extra cache padding accommodates a real tail stroke, without shrinking
    // the user's illustration when the animation bounds become wider.
    const width=species.size*(species.aquatic?.92:species.kind==='crab'?.78:species.kind==='shell'?.74:1)/Math.max(1,artAspect)*(sprite?.width||140)/(sprite?.artWidth||sprite?.width||140);
    let x=entity.x,y=entity.y,scale=water.scale,alpha=water.alpha;
    // Every cached illustration points right; heading is its smoothed body axis.
    let angle=species.aquatic||species.kind==='crab'?(entity.renderHeading??entity.heading??0):0;
    if(species.kind==='pool'&&!options.reducedMotion)scale*=1+Math.sin(time*.5+(entity.phase||0))*.006;
    if(entity.stranded&&!options.reducedMotion)angle+=Math.sin(time*2.5+(entity.phase||0))*.025;
    if(entity.entry&&Number.isFinite(entity.entryProgress))alpha*=clamp(entity.entryProgress);
    if(entity.emergeKind&&Number.isFinite(entity.emergeProgress))alpha*=.25+.75*clamp(entity.emergeProgress);
    if(entity.emergeKind==='crevice'&&entity.emergeProgress<1&&entity.concealmentAnchor){
      const p=clamp(entity.emergeProgress),ease=p*p*(3-2*p);
      x=entity.concealmentAnchor.x+(x-entity.concealmentAnchor.x)*ease;
      y=entity.concealmentAnchor.y+(y-entity.concealmentAnchor.y)*ease;
    }
    if(transition){
      const p=clamp(transition.progress);
      if(transition.type==='capture'||transition.type==='collect'){x=transition.from.x;y=transition.from.y-p*30;scale*=1-p*.55;alpha*=1-p;}
      if(transition.type==='observe')scale*=1+Math.sin(p*Math.PI)*.05;
    }
    return{x,y,width:width*scale,height:width*scale*aspect,angle,alpha,depth:water.depth,tint:water.tint,water:habitat.water};
  }
  drawSprite(ctx,entity,species,time,options,transition){
    const sprite=this.sprites.get(species.id);if(!sprite||concealed(entity))return false;
    const pose=this.spritePose(entity,species,time,options,transition);
    if(pose.alpha<.01)return false;
    const frame=spriteFrame(sprite,entity,species,time,options.reducedMotion||entity.stranded,this.animalAnimations.get(entity.id)?.phase);
    ctx.save();
    // Ocean creatures are beneath the shared water mask. Emergent rocks are
    // restored after the surface pass, from exactly the same terrain polygons.
    if(pose.water&&species.aquatic&&!entity.stranded)ctx.clip(this.animalWaterPath||this.currentPath);
    ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.globalAlpha=pose.alpha;
    const w=pose.width,h=pose.height;
    if(!pose.water){
      ctx.save();ctx.translate(1,2);ctx.fillStyle='rgba(79,78,45,.13)';
      ctx.beginPath();ctx.ellipse(0,0,w*.32,h*.20,0,0,TAU);ctx.fill();ctx.restore();
    }
    if(entity.emergeKind==='crevice'&&entity.emergeProgress<1){
      const p=clamp(entity.emergeProgress);ctx.beginPath();ctx.rect(w*(.5-p),-h/2,w*p,h);ctx.clip();
    }
    // Two premultiplied contributions retain the requested overall opacity.
    ctx.globalAlpha=pose.alpha*(1-pose.tint)/(1-pose.alpha*pose.tint);
    ctx.drawImage(frame.canvas,-w/2,-h/2,w,h);
    if(pose.tint>0){ctx.globalAlpha=pose.alpha*pose.tint;ctx.drawImage(frame.water,-w/2,-h/2,w,h);}
    ctx.restore();
    if(entity.stranded){
      ctx.save();ctx.strokeStyle=`rgba(250,223,153,${.4+Math.sin(time*2)*.07})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(pose.x,pose.y+3,w*.64,h*.64,0,0,TAU);ctx.stroke();ctx.restore();
    }
    return true;
  }
  drawAnimalWaterVeil(ctx,time,options){
    // Short moving glints cross animals and seabed together, putting the animals
    // beneath the surface without bleaching the whole painting with another tile.
    ctx.save();ctx.clip(this.animalWaterPath||this.currentPath);ctx.lineWidth=.55;
    for(let i=0;i<34;i++){
      const x=hash(i+430)*W,y=hash(i+870)*H,phase=options.reducedMotion?i:time*.38+i;
      const opacity=(.025+.035*(.5+.5*Math.sin(phase)));
      ctx.strokeStyle=`rgba(225,255,239,${opacity})`;ctx.beginPath();
      ctx.ellipse(x+Math.sin(phase*.4)*3,y,6+hash(i+40)*15,1.5+hash(i+80)*2,Math.sin(i)*.3,.2,2.4);ctx.stroke();
    }
    ctx.restore();
  }
  drawConcealment(ctx,game,time){
    for(const entity of game.entities||[]){
      if(!concealed(entity))continue;
      const species=SPECIES_BY_ID[entity.species],sprite=this.sprites.get(entity.species);if(!species||!sprite)continue;
      const p=concealmentPoint(entity),habitat=habitatAt(entity.x,entity.y,this.level??0),steps=clamp((entity.revealSteps||0)/(entity.revealNeeded||1));
      if(entity.concealment==='sand'){
        const wet=habitat.water?Math.pow(1-clamp(habitat.depth/.38),1.5):1;if(wet<.02)continue;
        const width=species.size*.85/Math.max(1,sprite.height/sprite.width),height=species.size*.40;
        ctx.save();ctx.translate(entity.x,entity.y);ctx.rotate(-.13);ctx.globalAlpha=wet;
        if(steps>0){
          ctx.save();ctx.rotate((entity.renderHeading??entity.heading??0)+.13);ctx.globalAlpha=wet*.85;
          ctx.drawImage(sprite.canvas,-width/2,-width*sprite.height/sprite.width/2,width,width*sprite.height/sprite.width);ctx.restore();
        }
        const mound=1-steps*.45;
        ctx.fillStyle='rgba(160,132,83,.12)';ctx.beginPath();ctx.ellipse(1,3,width*.47*mound,height*.35,0,0,TAU);ctx.fill();
        const rx=width*.47*mound,ry=height*.40*mound;
        ctx.fillStyle='rgba(231,210,169,.86)';ctx.beginPath();ctx.moveTo(-rx,ry*.12);
        ctx.bezierCurveTo(-rx*.91,-ry*.72,-rx*.39,-ry*.82,-rx*.11,-ry);
        ctx.bezierCurveTo(rx*.3,-ry*.87,rx*.77,-ry*.49,rx,ry*.09);
        ctx.bezierCurveTo(rx*.82,ry*.83,rx*.23,ry*.66,0,ry*.82);
        ctx.bezierCurveTo(-rx*.5,ry*.7,-rx*.83,ry*.5,-rx,ry*.12);ctx.fill();
        ctx.strokeStyle='rgba(159,126,77,.35)';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,1,width*.40*mound,height*.30*mound,0,.20,1.3);ctx.stroke();
        ctx.strokeStyle='rgba(255,241,206,.67)';ctx.beginPath();ctx.ellipse(-1,-1,width*.35*mound,height*.27*mound,0,Math.PI*1.15,Math.PI*1.67);ctx.stroke();
        ctx.strokeStyle='rgba(140,121,70,.37)';ctx.lineWidth=.8;
        for(let i=0;i<3;i++){const x=(i-1)*6;ctx.beginPath();ctx.moveTo(x-2,-height*.65);ctx.lineTo(x+1,-height*.8);ctx.stroke();}
        ctx.restore();
      }else{
        // A quiet fissure and two sand-coloured specks suggest a resident. This
        // clue lies on the rock rim; its legal entity point remains in water.
        const angle=Math.atan2(entity.y-p.y,entity.x-p.x);
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.globalAlpha=.76;
        ctx.fillStyle='rgba(37,70,64,.57)';ctx.beginPath();ctx.ellipse(0,0,4.4,10,0,0,TAU);ctx.fill();
        ctx.strokeStyle='rgba(207,218,167,.43)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(3,-8);ctx.quadraticCurveTo(5,0,3,8);ctx.stroke();
        ctx.fillStyle='rgba(240,225,153,.67)';ctx.beginPath();ctx.arc(1,-2,1,0,TAU);ctx.arc(1,2,1,0,TAU);ctx.fill();ctx.restore();
      }
    }
  }
  drawTransitions(ctx,game,time){
    for(const transition of (game.transitions||[]).slice(-32)){
      const p=clamp((game.nowMs-transition.startedAt)/transition.duration);if(p>=1)continue;
      const entity=game.entities.find(e=>e.id===transition.id),point=entity||transition.to||transition.from;
      ctx.save();ctx.globalAlpha=(1-p)*.65;ctx.lineWidth=1.5;
      ctx.strokeStyle=transition.type==='rescue'?'#f8e8aa':'#f7ffed';
      ctx.beginPath();ctx.ellipse(point.x,point.y,18+p*32,8+p*15,0,0,TAU);ctx.stroke();
      if(transition.type==='collect'){
        ctx.fillStyle='#fff5cd';for(let i=0;i<5;i++){
          const a=i/5*TAU+time;ctx.beginPath();ctx.arc(point.x+Math.cos(a)*p*35,point.y-8+Math.sin(a)*p*24,1.7*(1-p),0,TAU);ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  drawWeather(ctx,options,time){
    const weather=options.weather||'sunny',night=!!options.night;
    // Shared .scene-light already lights the background beneath this canvas.
    // Match that light on overlay pixels only, preserving their transparency;
    // another source-over screen wash would darken the scenery twice.
    const light=weather==='stormy'?'rgba(15,32,47,.18)':night?'rgba(6,24,43,.66)':
      weather==='rainy'?'rgba(21,45,55,.15)':weather==='cloudy'?'rgba(23,48,46,.07)':weather==='foggy'?'rgba(220,237,227,.07)':null;
    if(light){ctx.save();ctx.globalCompositeOperation='source-atop';ctx.fillStyle=light;ctx.fillRect(0,0,W,H);ctx.restore();}
    if(options.reducedMotion)return;
    if(weather==='rainy'||weather==='stormy'){
      ctx.strokeStyle=night?'rgba(205,228,237,.3)':'rgba(244,255,244,.48)';ctx.lineWidth=.8;ctx.beginPath();
      for(let i=0;i<(weather==='stormy'?95:58);i++){
        const x=(hash(i)*W-time*27+W*100)%W,y=(hash(i+200)*H+time*330)%H;
        ctx.moveTo(x,y);ctx.lineTo(x-3,y+12);
      }
      ctx.stroke();
      ctx.save();ctx.clip(this.currentPath);ctx.strokeStyle='rgba(237,255,244,.28)';
      for(let i=0;i<14;i++){
        const p=(time*.7+hash(i+300))%1;ctx.globalAlpha=1-p;ctx.beginPath();ctx.ellipse(hash(i+50)*W,hash(i+70)*H,p*11,p*4,0,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
    if(weather==='snowy'){
      ctx.fillStyle='rgba(252,255,247,.72)';for(let i=0;i<40;i++){
        const x=(hash(i)*W+Math.sin(time*.35+i)*25+W)%W,y=(hash(i+200)*H+time*20)%H;
        ctx.beginPath();ctx.arc(x,y,1+hash(i+30)*1.5,0,TAU);ctx.fill();
      }
    }
  }
  render(game,options={},time=0){
    if(this.disposed)return;
    const started=performance.now(),ctx=this.ctx,dt=this.lastTime===null?0:clamp(time-this.lastTime,0,.2);
    this.lastTime=time;this.options=options;this.game=game;
    const level=clamp(game.tide?.level||0);this.wetPeak=Math.max(level,this.wetPeak-dt/140);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.worldTransform(ctx);
    if(!this.backgroundCtx&&this.baseCache){ctx.drawImage(this.baseCache,0,0,W,H);this.drawDrySeabed(ctx);}
    this.drawSandDrawing(ctx,game.sandDrawing);
    this.drawWater(ctx,level,time,!!options.reducedMotion);
    if(this.animalWaterKey!==this.floodKey){
      this.animalWaterPath=new Path2D(this.currentPath);this.animalWaterPath.addPath(this.poolPath);this.animalWaterKey=this.floodKey;
    }
    const transitions=new Map((game.transitions||[]).map(t=>[t.id,{...t,progress:clamp((game.nowMs-t.startedAt)/t.duration)}]));
    const ids=new Set((game.entities||[]).map(e=>e.id));
    for(const id of this.animalAnimations.keys())if(!ids.has(id))this.animalAnimations.delete(id);
    this.entityCount=0;
    for(const entity of game.entities||[]){
      const species=SPECIES_BY_ID[entity.species];if(!species)continue;
      this.animalAnimations.set(entity.id,advanceAnimationPhase(this.animalAnimations.get(entity.id),entity,species,time,options.reducedMotion||entity.stranded||!!entity.concealment));
      const transition=transitions.get(entity.id),ghost=transition&&(transition.type==='capture'||transition.type==='collect');
      if(!['scene','rescuing','releasing'].includes(entity.state)&&!ghost)continue;
      if(this.drawSprite(ctx,entity,species,time,options,transition))this.entityCount++;
    }
    this.drawAnimalWaterVeil(ctx,time,options);
    this.drawFoam(ctx,level,time,!!options.reducedMotion);
    drawBottles(ctx,game.bottles,time,{reducedMotion:!!options.reducedMotion});
    this.drawTransitions(ctx,game,time);
    // Copy only emergent foreground from the identical terrain layer. This masks
    // water, foam and animals with the very same rock polygons used by collision.
    this.drawRockForeground(ctx);
    this.drawConcealment(ctx,game,time);
    if(options.debugHabitat){
      ctx.save();ctx.strokeStyle='rgba(241,98,80,.75)';ctx.lineWidth=1;ctx.stroke(this.rocksPath);
      ctx.strokeStyle='rgba(249,237,81,.9)';ctx.stroke(this.currentPath);ctx.stroke(this.poolPath);ctx.restore();
    }
    this.drawWeather(ctx,options,time);
    this.frameTimes.push(performance.now()-started);if(this.frameTimes.length>90)this.frameTimes.shift();
  }
  hitTest(screenX,screenY,game=this.game){
    if(!game||this.disposed)return null;
    const point=this.screenToWorld(screenX,screenY),blocked=blockedAt(point.x,point.y);
    let hit=null,best=Infinity;
    for(const entity of game.entities||[]){
      const species=SPECIES_BY_ID[entity.species],sprite=this.sprites.get(entity.species);
      if(!species||!sprite||entity.state!=='scene'||(species.kind==='shell'&&entity.submerged))continue;
      if(concealed(entity)){
        const habitat=habitatAt(entity.x,entity.y,this.level??0);
        if(entity.concealment==='sand'&&habitat.water)continue;
        const clue=concealmentPoint(entity),distance=Math.min(Math.hypot(point.x-clue.x,point.y-clue.y),Math.hypot(point.x-entity.x,point.y-entity.y));
        if(distance<Math.max(18,20/this.cover)&&distance<best){best=distance;hit=entity;}
        continue;
      }
      if(blocked)continue;
      const pose=this.spritePose(entity,species,this.lastTime||0,this.options||{});
      if(pose.alpha<.08)continue;
      const dx=point.x-pose.x,dy=point.y-pose.y,distance=Math.hypot(dx,dy);
      // Tiny creatures retain a 40 CSS px silhouette target, never a square box.
      const pickScale=Math.max(1,40/(Math.max(pose.width,pose.height)*this.cover));
      const w=pose.width*pickScale,h=pose.height*pickScale,c=Math.cos(-pose.angle),s=Math.sin(-pose.angle);
      const localX=dx*c-dy*s,localY=dx*s+dy*c;
      const x=Math.floor((localX/w+.5)*sprite.width),y=Math.floor((localY/h+.5)*sprite.height);
      if(x<0||y<0||x>=sprite.width||y>=sprite.height)continue;
      const frame=spriteFrame(sprite,entity,species,this.lastTime||0,this.options?.reducedMotion||entity.stranded,this.animalAnimations.get(entity.id)?.phase);
      if(frame.alpha[(y*sprite.width+x)*(frame.alphaStride||4)+(frame.alphaStride===1?0:3)]>24&&distance<best){best=distance;hit=entity;}
    }
    return hit;
  }
  getStats(){
    return{theme:'coast',ready:this.ready,source:this.baseURL,sourceSize:this.sourceSize,sandSource:SAND_BACKGROUND,sandSourceSize:this.sandSourceSize,
      backgroundSize:this.backgroundCanvas?[this.backgroundCanvas.width,this.backgroundCanvas.height]:[this.canvas.width,this.canvas.height],
      width:this.canvas.width,height:this.canvas.height,cssWidth:this.width,cssHeight:this.height,scale:this.scale,
      entityCount:this.entityCount,spriteCount:this.sprites.size,missingAssets:[...this.errors],
      renderMs:this.frameTimes.length?Math.round(this.frameTimes.reduce((a,b)=>a+b,0)/this.frameTimes.length*100)/100:0,
      desktopMode:!!this.options?.desktopMode};
  }
  stats(){return this.getStats();}
  destroy(){
    if(this.disposed)return;this.disposed=true;
    for(const image of this.images){image.onload=null;image.onerror=null;}
    this.water.destroy();
    this.images.clear();this.sprites.clear();this.animalAnimations.clear();this.game=null;this.baseImage=null;this.baseCache=null;this.sandCache=null;
    this.ctx.setTransform(1,0,0,1,0,0);this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
  }
}
export default CoastRenderer;
