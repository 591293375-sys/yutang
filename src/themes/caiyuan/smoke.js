import {windAt} from './atmosphere.js';

const smooth=u=>u*u*(3-2*u);
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};

// Age is distance travelled up the plume. Varying the emission phase advects
// curls upwards instead of sliding or repeating a complete static smoke image.
export function smokeFlow(u,time,seed=0){
 const age=u*7.2,born=time-age,wind=windAt(time-age*.45).drift;
 const curl=Math.sin(born*1.23+seed*2.7)+.43*Math.sin(born*2.07+seed*4.3);
 return {
  x:u===0?0:wind*48*u**1.45+curl*(2+u*13)*smooth(u),
  width:(1.4+u*6.2)*(1+.17*Math.sin(born*.93+seed)),
  opacity:(1-smooth(Math.max(0,(u-.18)/.82)))*(.72+.28*Math.sin(born*.77+seed)**2)
 };
}

export function drawIncenseSmoke(ctx,texture,{time,seed,height,scale=1,opacity=1,low=false}){
 if(opacity<=0||height<=0)return;
 ctx.save();ctx.scale(scale,scale);
 const count=low?24:40;
 // A soft, tapered volume with two finer internal streams. These connected
 // ribbons supply the visible rising motion; supplied watercolor art adds mist.
 for(let strand=0;strand<2;strand++){
  const points=[];
  for(let k=0;k<=count;k++){
   const u=k/count,flow=smokeFlow(u,time,seed+strand*.63);
   points.push({x:flow.x+(strand-.5)*u*3,y:-u*height,w:flow.width*(strand?.68:1),alpha:flow.opacity});
  }
  for(const [spread,strength] of [[2.8,.045],[1.8,.09],[1,.24]]){
   // Short connected quads give each part its own age-dependent density.
   // Slight edge overlap prevents hairline seams without expensive canvas blur.
   for(let k=0;k<count;k++){
    const a=points[k],b=points[k+1];ctx.globalAlpha=opacity*(a.alpha+b.alpha)*.5*strength;
    ctx.fillStyle='#efeee5';ctx.beginPath();ctx.moveTo(a.x-a.w*spread,a.y+.3);
    ctx.lineTo(b.x-b.w*spread,b.y);ctx.lineTo(b.x+b.w*spread,b.y);
    ctx.lineTo(a.x+a.w*spread,a.y+.3);ctx.closePath();ctx.fill();
   }
  }
 }
 if(texture){
  // Bounded emission window; each birth gets a different scale, curl and
  // orientation. Fade to zero at both ends, so no visible modulo-loop reset.
  const interval=1.07,lifetime=7.4,current=Math.floor((time+seed*.51)/interval);
  for(let birth=current-7;birth<=current;birth++){
   const age=time+seed*.51-birth*interval,u=age/lifetime;if(u<=0||u>=1)continue;
   const r=noise(birth+seed*19),f=smokeFlow(u,time,seed),h=(24+u*33)*( .8+r*.5),w=h*texture.width/texture.height;
   ctx.save();ctx.translate(f.x,-u*height);ctx.rotate((r-.5)*.65+Math.sin(age*.48+r*6)*.12);
   ctx.globalAlpha=opacity*Math.sin(u*Math.PI)**1.5*(.28+r*.18);
   ctx.drawImage(texture,-w/2,-h*.5,w,h);ctx.restore();
  }
 }
 ctx.restore();
}
