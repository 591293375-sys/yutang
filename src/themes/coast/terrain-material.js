// Split one registered painting into sand and emergent rock materials. The
// complementary rock alpha also supplies upgraded foreground and navigation.
const clamp=n=>Math.max(0,Math.min(1,n));
// Fill tiny warm mineral highlights inside a reef without recolouring the
// sandy channels around it. This happens once on image load, never in a frame.
function distanceToZero(bits,width,height){
  const d=Float32Array.from(bits,v=>v?width+height:0),diag=Math.SQRT2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+1);if(y)v=Math.min(v,d[i-width]+1);
    if(x&&y)v=Math.min(v,d[i-width-1]+diag);if(y&&x+1<width)v=Math.min(v,d[i-width+1]+diag);d[i]=v;
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;let v=d[i];if(x+1<width)v=Math.min(v,d[i+1]+1);if(y+1<height)v=Math.min(v,d[i+width]+1);
    if(x+1<width&&y+1<height)v=Math.min(v,d[i+width+1]+diag);if(x&&y+1<height)v=Math.min(v,d[i+width-1]+diag);d[i]=v;
  }
  return d;
}
export function terrainSandCoverage(r,g,b){
  // Classify warm substrate by chroma, not brightness: shadowed sand and tiny
  // ochre grains must remain below water too. Navy/slate reef faces have a
  // cooler green/blue balance, so their highlights remain continuous.
  return clamp((r-g+1)/9)*clamp((r-b-2)/13);
}
export function makeTerrainMaterials(source){
  const mask=document.createElement('canvas');mask.width=source.width;mask.height=source.height;
  const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const image=ctx.getImageData(0,0,mask.width,mask.height),d=image.data;
  const material=document.createElement('canvas');material.width=source.width;material.height=source.height;
  const mctx=material.getContext('2d'),rock=mctx.createImageData(mask.width,mask.height);rock.data.set(d);
  const sandBits=new Uint8Array(mask.width*mask.height);
  for(let i=0;i<sandBits.length;i++)sandBits[i]=terrainSandCoverage(d[i*4],d[i*4+1],d[i*4+2])>.5?1:0;
  const radius=5*mask.width/1600;
  const sandDistance=distanceToZero(sandBits,mask.width,mask.height);
  const dilated=Uint8Array.from(sandDistance,n=>n<=radius?1:0);
  const rockDistance=distanceToZero(dilated,mask.width,mask.height);
  // Mineral highlights can be much wider than a few pixels. Flood the open
  // sand from the plate edges: an enclosed light patch belongs to its stone,
  // while a real sandy channel stays connected to the surrounding seabed.
  const outside=new Uint8Array(sandBits.length),queue=new Int32Array(sandBits.length);
  let head=0,tail=0;
  const visit=i=>{if(i<0||i>=outside.length||outside[i]||rockDistance[i]>radius)return;outside[i]=1;queue[tail++]=i;};
  for(let x=0;x<mask.width;x++){visit(x);visit((mask.height-1)*mask.width+x);}
  for(let y=0;y<mask.height;y++){visit(y*mask.width);visit(y*mask.width+mask.width-1);}
  while(head<tail){const i=queue[head++],x=i%mask.width,y=Math.floor(i/mask.width);if(x)visit(i-1);if(x+1<mask.width)visit(i+1);if(y)visit(i-mask.width);if(y+1<mask.height)visit(i+mask.width);}
  for(let i=0;i<d.length;i+=4){
    const closedRock=outside[i/4]?clamp((rockDistance[i/4]-radius+1)/2):1;
    const sand=terrainSandCoverage(d[i],d[i+1],d[i+2])*(1-closedRock);
    d[i+3]=Math.round(d[i+3]*sand);
  }
  ctx.putImageData(image,0,0);
  // Smooth the material boundary once, rather than producing speckled holes
  // from individual warm highlights. This cached material does not alter the
  // current tidal mask. The renderer registers the finished rock alpha once.
  const soft=document.createElement('canvas');soft.width=mask.width;soft.height=mask.height;
  const sctx=soft.getContext('2d');sctx.filter='blur(2px)';sctx.drawImage(mask,0,0);sctx.filter='none';
  ctx.clearRect(0,0,mask.width,mask.height);ctx.drawImage(soft,0,0);
  // Sandy crevices must remain transparent to water. Forcing the former coarse
  // polygons opaque would restore gold sand wedges along an invisible hull.
  mctx.putImageData(rock,0,0);mctx.globalCompositeOperation='destination-out';mctx.drawImage(mask,0,0);mctx.globalCompositeOperation='source-over';
  // Draw this same material over animals, so visible rocks and blocked habitat
  // stay registered even when their new contours differ from the former art.
  return {sand:mask,rock:material};
}
