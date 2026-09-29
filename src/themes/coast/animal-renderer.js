// Prepared once per supplied illustration. The runtime draws one smooth cached
// silhouette, never independently displaced coarse image strips.
const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export function sourceHeading(species){
  const [hx,hy,tx,ty]=species.headAxis||[1,.5,0,.5];
  return Math.atan2((hy-ty)*species.rect[3],(hx-tx)*species.rect[2]);
}
export function animalDepth(entity,species,habitat){
  if(!habitat.water||entity.stranded)return{depth:0,scale:1,alpha:1,tint:0};
  if(species.kind==='shell')return{depth:habitat.depth,scale:1,alpha:Math.pow(1-clamp(habitat.depth/.58),1.45),tint:clamp(habitat.depth*.85)};
  const swim=Number.isFinite(entity.swimDepth)?clamp(entity.swimDepth):.34+(Math.sin((entity.phase||0)*2.31)+1)*.22;
  const depth=clamp(habitat.depth*(species.aquatic?.38+swim*.62:.76));
  return{depth,scale:species.aquatic?1-depth*.17:1,alpha:species.aquatic?.94-depth*.27:.97-depth*.15,tint:.11+depth*.52};
}
export function animationPhase(entity,species,time,reducedMotion=false){
  if(reducedMotion)return 0;
  const moving=entity.motionState!=='resting'&&(entity.speed===undefined||entity.speed>1.2);
  if(species.kind==='crab'&&!moving)return 0;
  const hz=species.kind==='crab'?1.7:species.kind==='shrimp'?1.1:species.id==='fish_puffer'?.85:1.35;
  // Multiplying absolute time by changing speed would jump the tail phase at
  // every acceleration. Locomotion changes the body; the tail cycle stays smooth.
  return((time*hz+(entity.phase||0)/TAU)%1+1)%1;
}
export function advanceAnimationPhase(previous,entity,species,time,reducedMotion=false){
  const moving=entity.motionState!=='resting'&&(entity.speed===undefined||entity.speed>1.2),crab=species.kind==='crab';
  const hz=crab?2.15:species.kind==='shrimp'?1.4:species.id==='fish_puffer'?1.1:1.65;
  // Evasive fish need a rapid tail beat to propel their burst; integrate the
  // rate so acceleration never jumps straight to a different tail pose.
  const target=reducedMotion?0:crab&&!moving?0:hz*(Number.isFinite(entity.speed)?clamp(entity.speed/(crab?7:23),.3,species.kind==='fish'?2.5:1.3):1);
  if(!previous)return{phase:crab&&!moving?0:((entity.phase||0)/TAU%1+1)%1,at:time,rate:target};
  const dt=clamp(time-previous.at,0,.12);
  if(!dt)return{...previous,at:time};
  if(reducedMotion)return{phase:previous.phase,at:time,rate:0};
  if(crab&&!moving){
    // Finish the current half-step, then return every foot to its neutral pose.
    const goal=Math.ceil((previous.phase-1e-8)*2)/2,gap=goal-previous.phase;
    const phase=gap<.0001?goal:previous.phase+gap*(1-Math.exp(-dt*10));
    return{phase:(phase%1+1)%1,at:time,rate:0};
  }
  const rate=previous.rate+(target-previous.rate)*(1-Math.exp(-dt*7));
  return{phase:(previous.phase+(previous.rate+rate)*.5*dt)%1,at:time,rate};
}

/** A local pose, measured in the aligned artwork's coordinates (head to right).
 * The head / shell is anchored: only the spine, fins or jointed legs deform. */
export function deformAnimalPoint(species,u,v,phase,aspect=1){
  const p=phase*TAU,side=v<.5?-1:1;
  if(species.aquatic){
    const t=clamp((.88-u)/.88),amplitude=species.id==='fish_puffer'?.038:species.kind==='shrimp'?.042:.073;
    const wave=p-t*2.5,bend=amplitude*t*t*Math.sin(wave);
    const slope=-amplitude/.88*(2*t*Math.sin(wave)-2.5*t*t*Math.cos(wave));
    const tangent=Math.atan(slope),cross=v-.5;
    const fin=smooth(.12,.35,Math.abs(cross))*Math.exp(-Math.pow((u-.66)/.17,2));
    const flap=Math.sin(p+side*.65)*fin;
    return{x:u-cross*aspect*Math.sin(tangent)+flap*.010,y:.5+cross*Math.cos(tangent)+bend/aspect+side*flap*.078};
  }
  if(species.kind==='crab'){
    const hermit=species.id==='hermit',leg=smooth(hermit?.12:.18,hermit?.36:.42,Math.abs(v-.5));
    const exposed=hermit?smooth(.5,.72,u):1-smooth(.68,.9,u);
    // Neighboring legs alternate their contact / recovery stroke. The two
    // sides are half a stride apart, while the central carapace stays exact.
    const group=Math.cos((u-(hermit?.52:.08))*Math.PI*(hermit?5:6));
    const stride=Math.sin(p)*group*side,weight=leg*exposed;
    return{x:u+stride*weight*.075,y:v+Math.sin(p)*group*weight*.052};
  }
  return{x:u,y:v};
}

// Inverse sample a small, smooth deformation mesh once into cached frames.
// Bilinear sampling preserves watercolor edges without displaced-strip seams.
export function deformSpritePixels(source,width,height,artWidth,artHeight,pad,species,phase){
  const columns=32,rows=24,dx=new Float32Array((columns+1)*(rows+1)),dy=new Float32Array(dx.length),stride=columns+1;
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const x=col/columns*(width-1),y=row/rows*(height-1),u=(x-pad)/artWidth,v=(y-pad)/artHeight,point=deformAnimalPoint(species,u,v,phase,artHeight/artWidth),i=row*stride+col;
    dx[i]=(point.x-u)*artWidth;dy[i]=(point.y-v)*artHeight;
  }
  const result=new Uint8ClampedArray(source.length),sxScale=columns/(width-1),syScale=rows/(height-1);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sx=x,sy=y;
    for(let iteration=0;iteration<4;iteration++){
      const gx=clamp(sx*sxScale,0,columns-.00001),gy=clamp(sy*syScale,0,rows-.00001),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,i=iy*stride+ix;
      const a=(1-fx)*(1-fy),b=fx*(1-fy),c=(1-fx)*fy,d=fx*fy;
      sx=x-dx[i]*a-dx[i+1]*b-dx[i+stride]*c-dx[i+stride+1]*d;
      sy=y-dy[i]*a-dy[i+1]*b-dy[i+stride]*c-dy[i+stride+1]*d;
    }
    if(sx<0||sy<0||sx>=width-1||sy>=height-1)continue;
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,i=(iy*width+ix)*4,o=(y*width+x)*4;
    const a=(1-fx)*(1-fy)*source[i+3],b=fx*(1-fy)*source[i+7],c=(1-fx)*fy*source[i+width*4+3],d=fx*fy*source[i+width*4+7],alpha=a+b+c+d;
    if(alpha<.5)continue;
    result[o+3]=alpha;
    for(let channel=0;channel<3;channel++)result[o+channel]=(source[i+channel]*a+source[i+4+channel]*b+source[i+width*4+channel]*c+source[i+width*4+4+channel]*d)/alpha;
  }
  return result;
}
export function concealmentPoint(entity){return entity.concealmentAnchor||{x:entity.x,y:entity.y};}
export function concealed(entity){return !!entity.concealment&&entity.state==='scene';}

export function prepareAnimalSprite(species,image){
  const [sx,sy,sw,sh]=species.rect,baseWidth=192,baseHeight=Math.round(baseWidth*sh/sw);
  const source=canvas(baseWidth,baseHeight),sctx=source.getContext('2d');
  sctx.imageSmoothingQuality='high';sctx.drawImage(image,sx,sy,sw,sh,0,0,baseWidth,baseHeight);
  const angle=sourceHeading(species),c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  const aligned=canvas(Math.ceil(baseWidth*c+baseHeight*s)+8,Math.ceil(baseWidth*s+baseHeight*c)+8),actx=aligned.getContext('2d',{willReadFrequently:true});
  actx.translate(aligned.width/2,aligned.height/2);actx.rotate(-angle);actx.drawImage(source,-baseWidth/2,-baseHeight/2);
  // Rotation leaves large empty corners. Tighten around the actual illustration.
  const rgba=actx.getImageData(0,0,aligned.width,aligned.height).data;
  let x0=aligned.width,y0=aligned.height,x1=0,y1=0;
  for(let y=0;y<aligned.height;y++)for(let x=0;x<aligned.width;x++)if(rgba[(y*aligned.width+x)*4+3]>24){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const artWidth=Math.max(1,x1-x0+1),artHeight=Math.max(1,y1-y0+1),pad=Math.ceil(Math.max(artWidth,artHeight)*.11)+3,width=artWidth+pad*2,height=artHeight+pad*2;
  const neutral=canvas(width,height),nctx=neutral.getContext('2d',{willReadFrequently:true});
  nctx.drawImage(aligned,x0,y0,artWidth,artHeight,pad,pad,artWidth,artHeight);
  const sourcePixels=nctx.getImageData(0,0,width,height).data;
  const cacheFrame=(frame,pixels)=>{
    const water=canvas(width,height),wctx=water.getContext('2d');
    wctx.drawImage(frame,0,0);wctx.globalCompositeOperation='source-atop';wctx.fillStyle='rgba(42,136,145,.48)';wctx.fillRect(0,0,width,height);
    const alpha=new Uint8Array(width*height);for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
    return{canvas:frame,water,alpha,alphaStride:1};
  };
  const neutralFrame=cacheFrame(neutral,sourcePixels),animated=species.aquatic||species.kind==='crab',count=animated?32:1,frames=[];
  for(let f=0;f<count;f++){
    if(!animated){frames.push(neutralFrame);continue;}
    const frame=canvas(width,height),ctx=frame.getContext('2d'),pixels=deformSpritePixels(sourcePixels,width,height,artWidth,artHeight,pad,species,f/count),data=ctx.createImageData(width,height);
    data.data.set(pixels);ctx.putImageData(data,0,0);frames.push(cacheFrame(frame,pixels));
  }
  return{canvas:neutral,width,height,artWidth,artHeight,alpha:neutralFrame.alpha,alphaStride:1,neutralFrame,frames,sourceHeading:angle};
}
export function spriteFrame(sprite,entity,species,time,reducedMotion,phase){
  if(reducedMotion===true)return sprite.neutralFrame||sprite.frames[0];
  const index=Math.round((phase??animationPhase(entity,species,time,false))*sprite.frames.length)%sprite.frames.length;
  return sprite.frames[index];
}
