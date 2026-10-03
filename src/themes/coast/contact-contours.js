// Optical contours only. The supplied material pixels are never modified and
// none of these paths participate in collision, habitat or hit detection.
const clamp=n=>Math.max(0,Math.min(1,n));
const squareCases=[[],[[3,0]],[[0,1]],[[3,1]],[[1,2]],[[3,0],[1,2]],[[0,2]],[[3,2]],[[2,3]],[[0,2]],[[0,1],[2,3]],[[1,2]],[[1,3]],[[0,1]],[[3,0]],[]];

export function materialContactContours(rgba,width,height,{worldWidth=1600,worldHeight=900,step=2,minArea=300,spacing=5}={}){
  if(!rgba||rgba.length!==width*height*4)return [];
  const sx=worldWidth/width,sy=worldHeight/height;
  const alpha=(x,y)=>x<0||y<0||x>=width||y>=height?0:rgba[(Math.floor(y)*width+Math.floor(x))*4+3]/255;
  const nodes=new Map(),segments=[];
  const node=(key,x,y)=>{let p=nodes.get(key);if(!p){p={x:x*sx,y:y*sy,edges:[]};nodes.set(key,p)}return p};
  for(let y=-step;y<height;y+=step)for(let x=-step;x<width;x+=step){
    const a=alpha(x,y),b=alpha(x+step,y),c=alpha(x+step,y+step),d=alpha(x,y+step);
    const index=(a>.5?1:0)|(b>.5?2:0)|(c>.5?4:0)|(d>.5?8:0);if(!index||index===15)continue;
    const at=(lo,hi)=>Math.abs(hi-lo)<1e-6?.5:clamp((.5-lo)/(hi-lo));
    const edge=e=>e===0?node(`h${x},${y}`,x+at(a,b)*step,y):e===1?node(`v${x+step},${y}`,x+step,y+at(b,c)*step):e===2?node(`h${x},${y+step}`,x+at(d,c)*step,y+step):node(`v${x},${y}`,x,y+at(a,d)*step);
    for(const [from,to]of squareCases[index]){const p=edge(from),q=edge(to),segment={p,q,used:false};p.edges.push(segment);q.edges.push(segment);segments.push(segment)}
  }
  const contours=[];
  for(const start of segments){
    if(start.used)continue;const raw=[],first=start.p;let point=first,edge=start;
    while(edge&&!edge.used){edge.used=true;raw.push(point);point=edge.p===point?edge.q:edge.p;if(point===first)break;edge=point.edges.find(e=>!e.used)}
    if(point!==first||raw.length<8)continue;
    const area=raw.reduce((s,p,i)=>{const q=raw[(i+1)%raw.length];return s+p.x*q.y-q.x*p.y},0)/2;
    if(Math.abs(area)<minArea)continue;
    // One small, symmetric convolution removes raster stairs, not stone shape.
    const smooth=raw.map((p,i)=>{const a=raw[(i+raw.length-1)%raw.length],b=raw[(i+1)%raw.length];return{x:(a.x+p.x*2+b.x)/4,y:(a.y+p.y*2+b.y)/4}});
    const points=[];let carried=0,length=0;
    for(let i=0;i<smooth.length;i++){
      const a=smooth[i],b=smooth[(i+1)%smooth.length],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.001)continue;
      for(let along=carried;along<d;along+=spacing){const t=along/d;points.push({x:a.x+dx*t,y:a.y+dy*t,arc:length+along})}
      carried=(carried-d)%spacing;if(carried<0)carried+=spacing;length+=d;
    }
    if(points.length<6)continue;
    const sign=area>0?1:-1;
    const feet=points.map(p=>({x:p.x,y:p.y}));
    for(let i=0;i<points.length;i++){
      const p=points[i],a=feet[(i+points.length-1)%points.length],b=feet[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
      p.nx=sign*dy/d;p.ny=-sign*dx/d;
      if(alpha((p.x+p.nx*3)/sx,(p.y+p.ny*3)/sy)>alpha((p.x-p.nx*3)/sx,(p.y-p.ny*3)/sy)){p.nx=-p.nx;p.ny=-p.ny}
      // Move only the optical foot to the water side of antialiased paint.
      let shift=0;while(shift<5&&alpha((p.x+p.nx*shift)/sx,(p.y+p.ny*shift)/sy)>.14)shift+=.5;
      p.x+=p.nx*shift;p.y+=p.ny*shift;
      p.phase=p.arc*.014+p.x*.004+p.y*.003;
      p.strength=0;
    }
    contours.push({points,area,length,phase:contours.length*1.618});
  }
  return contours;
}

/** A slow advancing wash, with an independent weaker ebb; no sawtooth reset. */
export function contactWave(arc,time,phase=0,reducedMotion=false){
  const t=reducedMotion?0:time;
  const wave=Math.sin(t*.72-arc*.012+phase),small=Math.sin(t*.37+arc*.028+phase*.7);
  return {distance:2.1+(wave+1)*1.7+small*.3,opacity:.16+(wave+1)*.065,width:1.0+(small+1)*.25};
}
