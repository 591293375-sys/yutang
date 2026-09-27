import {windStrength} from './atmosphere.js';
const fract=x=>x-Math.floor(x);
/** Small groups of traveling capillary waves, in the artwork's water coordinates. */
export function surfaceRipples(time,width,height,options={}){
 if(options.reducedMotion||options.season==='winter'||options.weather==='snowy')return [];
 const wind=windStrength(options.weather,options.season),ratio=width/height,aspect=16/9;
 const coverX=Math.min(1,ratio/aspect),coverY=Math.min(1,aspect/ratio),count=options.quality==='low'?7:18,waves=[];
 for(let i=0;i<count;i++){
  const seed=fract(i*.61803398875+.19),period=13+seed*9,phase=fract(time/period+seed);
  const u=.22+fract(i*.75487766+.13)*.56,v=.17+fract(i*.56984029+.07)*.63;
  const x=((u-.5)/coverX+.5)*width+(phase-.5)*(22+wind*14),y=((v-.5)/coverY+.5)*height+(phase-.5)*12;
  if(x<-100||x>width+100||y<-40||y>height+40)continue;
  waves.push({x,y,length:45+seed*77,angle:-.2+seed*.3,spacing:5+seed*3,phase,
   alpha:Math.sin(phase*Math.PI)**2*(options.night?.052:.1)*(1+wind*.28),curve:3+seed*5});
 }
 return waves;
}
export function drawSurfaceRipples(ctx,time,width,height,options){
 const waves=surfaceRipples(time,width,height,options);if(!waves.length)return;
 ctx.save();ctx.lineWidth=.75;ctx.lineCap='round';
 for(const wave of waves){
  ctx.save();ctx.translate(wave.x,wave.y);ctx.rotate(wave.angle);
  for(let i=0;i<3;i++){
   const half=wave.length*(1-i*.14)*.5,y=(i-1)*wave.spacing+wave.phase*4;
   ctx.strokeStyle=`rgba(232,249,213,${wave.alpha*(i===1?1:.52)})`;
   ctx.beginPath();ctx.moveTo(-half,y);ctx.bezierCurveTo(-half*.36,y-wave.curve,half*.35,y-wave.curve*.6,half,y+1);ctx.stroke();
   ctx.strokeStyle=`rgba(18,83,76,${wave.alpha*.34})`;ctx.beginPath();ctx.moveTo(-half*.85,y+1.8);ctx.quadraticCurveTo(0,y-wave.curve+1.8,half*.9,y+2);ctx.stroke();
  }ctx.restore();
 }ctx.restore();
}

// Short contours follow the painted banks in artwork coordinates, so cover-cropping
// keeps them attached to the same stones at every window size. The sign faces water.
const BANKS=[
 {p:[[.018,.192],[.047,.193],[.071,.185],[.091,.169]],side:1},
 {p:[[.104,.159],[.13,.151],[.164,.122],[.176,.102]],side:1},
 {p:[[.179,.094],[.206,.092],[.225,.073],[.235,.045]],side:1},
 {p:[[.035,.268],[.052,.311],[.039,.368],[.062,.419]],side:-1},
 {p:[[.064,.455],[.062,.513],[.088,.56],[.103,.595]],side:-1},
 {p:[[.115,.659],[.145,.696],[.166,.746],[.181,.78]],side:-1},
 {p:[[.206,.83],[.239,.861],[.268,.935],[.271,.979]],side:-1},
 {p:[[.713,.918],[.70,.879],[.724,.816],[.749,.773]],side:-1},
 {p:[[.755,.757],[.787,.672],[.84,.598],[.906,.602]],side:-1},
 {p:[[.905,.601],[.943,.596],[.976,.623],[1.005,.65]],side:-1},
 {p:[[.904,.182],[.94,.22],[.971,.229],[.989,.273]],side:1},
];
function cubic(p,t){
 const a=1-t;return {x:a*a*a*p[0][0]+3*a*a*t*p[1][0]+3*a*t*t*p[2][0]+t*t*t*p[3][0],y:a*a*a*p[0][1]+3*a*a*t*p[1][1]+3*a*t*t*p[2][1]+t*t*t*p[3][1]};
}
export function shoreRipples(time,width,height,options={}){
 if(options.reducedMotion||options.season==='winter'||options.weather==='snowy')return [];
 const ratio=width/height,cx=Math.min(1,ratio/(16/9)),cy=Math.min(1,(16/9)/ratio),wind=windStrength(options.weather,options.season),waves=[];
 const map=p=>({x:((p.x-.5)/cx+.5)*width,y:((p.y-.5)/cy+.5)*height});
 for(let i=0;i<BANKS.length;i++){
  const bank=BANKS[i],period=6.8+(i%4)*.9;
  for(let crest=0;crest<(options.quality==='low'?1:3);crest++){
   const phase=fract(time/period+i*.193+crest/3),offset=2+phase*(12+wind*3),points=[];
   for(let n=0;n<=12;n++){
    const t=n/12,p=map(cubic(bank.p,t)),before=map(cubic(bank.p,Math.max(0,t-.005))),after=map(cubic(bank.p,Math.min(1,t+.005)));
    const dx=after.x-before.x,dy=after.y-before.y,len=Math.hypot(dx,dy)||1;
    const d=offset+Math.sin(t*9+time*.6+i)*.75;
    points.push({x:p.x-dy/len*d*bank.side,y:p.y+dx/len*d*bank.side});
   }
   if(points.every(p=>p.x<-30||p.x>width+30||p.y<-30||p.y>height+30))continue;
   waves.push({points,alpha:Math.sin(phase*Math.PI)**2*(options.night?.09:.18)*(1+wind*.16)});
  }
 }
 return waves;
}
export function drawShoreRipples(ctx,time,width,height,options,isWater=()=>true){
 const waves=shoreRipples(time,width,height,options);if(!waves.length)return;
 ctx.save();ctx.lineWidth=.9;ctx.lineCap='round';
 for(const wave of waves){
  // Taper the ends and break the line where blades or dry rocks cover the shore.
  for(let i=1;i<wave.points.length;i++){
   const a=wave.points[i-1],b=wave.points[i];if(!isWater(a.x,a.y)||!isWater(b.x,b.y))continue;
   const taper=Math.sin((i-.5)/(wave.points.length-1)*Math.PI);
   ctx.strokeStyle=`rgba(224,246,219,${wave.alpha*taper})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
 }ctx.restore();
}
