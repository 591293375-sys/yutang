// Shared, bounded wind in scene space. Cloth rests between gusts; smoke still rises.
const TAU=Math.PI*2;
export function windAt(time){
 const t=Math.max(0,time),phase=((t+2)%29)/29;
 const envelope=phase<.36?Math.sin(phase/.36*Math.PI)**2:0;
 return{gust:envelope,drift:.58*Math.sin(t*.16-.8)+.3*envelope*Math.sin(t*.39+.5)};
}
export function advanceMotion(time,delta,options){return time+(options.paused?0:Math.min(.1,Math.max(0,delta))*(options.reducedMotion?.2:1))}
export function flamePose(time,seed=0){
 const wind=windAt(time),p=time*2.1+seed*17;
 return{lean:wind.drift*.09+Math.sin(p)*.022,height:1+Math.sin(p)*.085+Math.sin(p*.61+1)*.025,width:1-Math.sin(p)*.035,glow:1+Math.sin(p*.67)*.07};
}
// The source is the unchanged background. Pin the seams and supports; move only
// the folds inside the red cloth and the small tassel patches, never the gods.
const cloth=[[120,0],[315,0],[308,62],[275,80],[245,86],[220,98],[191,113],[164,118],[119,110]];
export const CURTAINS=[
 {x:112,y:0,w:212,h:128,cols:12,rows:10,polygon:cloth,side:1},
 {x:1276,y:0,w:212,h:128,cols:12,rows:10,polygon:cloth.map(([x,y])=>[1600-x,y]),side:-1},
 {x:191,y:88,w:39,h:79,cols:4,rows:10,tassel:true,side:1},
 {x:1370,y:88,w:39,h:79,cols:4,rows:10,tassel:true,side:-1}
];
function inPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside}return inside}
function edgeDistance(x,y,polygon){let best=Infinity;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],v=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));best=Math.min(best,Math.hypot(x-a[0]-v*dx,y-a[1]-v*dy))}return best}
export function curtainOffset(p,u,v,time){
 if(u<=0||u>=1||v<=0||v>=1)return{x:0,y:0};
 const x=p.x+u*p.w,y=p.y+v*p.h,wind=windAt(time);
 if(!wind.gust||p.polygon&&!inPolygon(x,y,p.polygon))return{x:0,y:0};
 const seam=p.polygon?Math.min(1,edgeDistance(x,y,p.polygon)/10):1;
 const pin=Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*seam;
 const wave=Math.sin(time*1.65-v*2.8+p.side*.5),strength=wind.gust*pin;
 return{x:strength*(p.tassel?4.8:5.2)*(wave*.7+wind.drift*.3),y:p.tassel?strength*.5*wave:strength*1.5*Math.sin(time*1.4-u*TAU)};
}
function triangle(ctx,texture,source,dest){
 const [a,b,c]=source,[d,e,f]=dest;
 const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-a.x,vy=c.y-a.y,det=ux*vy-uy*vx;
 const A=((e.x-d.x)*vy-(f.x-d.x)*uy)/det,B=((e.y-d.y)*vy-(f.y-d.y)*uy)/det;
 const C=((f.x-d.x)*ux-(e.x-d.x)*vx)/det,D=((f.y-d.y)*ux-(e.y-d.y)*vx)/det;
 ctx.save();ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(e.x,e.y);ctx.lineTo(f.x,f.y);ctx.closePath();ctx.clip();
 ctx.transform(A,B,C,D,d.x-A*a.x-C*a.y,d.y-B*a.x-D*a.y);ctx.drawImage(texture.image,texture.x,texture.y,texture.w,texture.h);ctx.restore();
}
export function drawCurtains(ctx,background,time,cache){
 if(!background||windAt(time).gust<.001)return;
 if(cache.source!==background){cache.source=background;cache.patches=CURTAINS.map(p=>{
  // Crop on integer source pixels without resampling; the calm and moving
  // versions then share the background's texel alignment (no sharpness pop).
  const c=document.createElement('canvas'),scale=background.width/1600;
  const x=Math.floor(p.x*scale),y=Math.floor(p.y*scale);
  c.width=Math.ceil((p.x+p.w)*scale)-x;c.height=Math.ceil((p.y+p.h)*scale)-y;
  c.getContext('2d').drawImage(background,x,y,c.width,c.height,0,0,c.width,c.height);
  return{image:c,x:x/scale,y:y/scale,w:c.width/scale,h:c.height/scale};
 })}
 for(const [index,p] of CURTAINS.entries()){
  const points=[];for(let j=0;j<=p.rows;j++)for(let i=0;i<=p.cols;i++){const u=i/p.cols,v=j/p.rows,source={x:p.x+u*p.w,y:p.y+v*p.h},o=curtainOffset(p,u,v,time);points.push({source,dest:{x:source.x+o.x,y:source.y+o.y},moving:Math.abs(o.x)+Math.abs(o.y)>.001})}
  for(let j=0;j<p.rows;j++)for(let i=0;i<p.cols;i++){const a=j*(p.cols+1)+i,b=a+1,c=a+p.cols+1,d=c+1;for(const ids of [[a,b,d],[a,d,c]]){const verts=ids.map(id=>points[id]);if(verts.some(v=>v.moving))triangle(ctx,cache.patches[index],verts.map(v=>v.source),verts.map(v=>v.dest))}}
 }
}
