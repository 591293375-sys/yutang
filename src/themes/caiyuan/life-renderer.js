import {bounds} from './geometry.js';
import {freePoint} from './habitat.js';
import {drawToadPose} from './toad-pose.js';
export const LIFE_FILES=['toad_idle','toad_blink','toad_hop','toad_carry','toad_sleep','lantern_body','lantern_tassel','gold_coin','auspicious_mist'].map(s=>'motion/'+s+'.webp');
const img=(images,name)=>images['motion/'+name+'.webp'];
export const LANTERNS=[{x:125,y:73,period:6.7,phase:.4},{x:1474,y:63,period:7.9,phase:2.6}];
export function lanternPose(index,time,life,intensity=1){const l=LANTERNS[index],a=2*Math.PI*time/l.period+l.phase,age=(life?.time??0)-(life?.lanternKicks[index]??-100),kick=age<5&&age>=0?Math.sin(age*4.4)*Math.exp(-age*.75)*.045:0;return{angle:Math.sin(a)*.026*intensity+kick,tassel:Math.sin(a-.55)*.044*intensity+kick*.6}}
export function lanternHit(p){return LANTERNS.findIndex(l=>Math.abs(p.x*1600-l.x)<49&&p.y*900>l.y&&p.y*900<l.y+183)}
function glow(ctx,x,y,r,alpha){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,216,136,${alpha})`);g.addColorStop(1,'#ffd08000');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
export function drawLanterns(ctx,images,clock,life,night,settings,reduced){if(!settings.showLanterns)return;const body=img(images,'lantern_body'),tassel=img(images,'lantern_tassel');if(!body||!tassel)return;const strength=(settings.motionIntensity==='gentle'?.55:1)*(reduced?.25:1),s=.086;
 for(let i=0;i<2;i++){const l=LANTERNS[i],pose=lanternPose(i,clock,life,strength);ctx.save();ctx.translate(l.x,l.y);ctx.rotate(pose.angle);
  // Original-pixel attachment coordinates survive trimming and texture resizing.
  if(night>.01)glow(ctx,0,83,88,(.1+.035*Math.sin(clock*.8+i))*night);
  ctx.globalAlpha=.98;ctx.drawImage(body,(52-512)*s,(66-80)*s,921*s,1373*s);
  ctx.translate((513-512)*s,(1405-80)*s);ctx.rotate(pose.tassel);const ts=s*.43;
  ctx.drawImage(tassel,(350-509)*ts,(67-88)*ts,330*ts,1402*ts);ctx.restore();
 }
}
export function drawAir(ctx,clock,night,settings,reduced,quality){if(!settings.showAtmosphere)return;const strength=settings.motionIntensity==='gentle'?.6:1;
 ctx.save();const g=ctx.createLinearGradient(105,100,690,860);g.addColorStop(0,`rgba(255,241,197,${(.024+.008*Math.sin(clock*.2))*(1-night*.8)*strength})`);g.addColorStop(1,'#ffeac500');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(90,65);ctx.lineTo(218,135);ctx.lineTo(750,875);ctx.lineTo(500,900);ctx.closePath();ctx.fill();
 const count=night>.6?6:quality==='low'||reduced?8:12;
 for(let i=0;i<count;i++){const phase=((clock*(.007+i*.0004)+i*.618)%1+1)%1,fade=Math.sin(phase*Math.PI)**2,x=158+(i*79%370)+Math.sin(clock*.17+i)*15+phase*28,y=240+phase*585;ctx.fillStyle=`rgba(255,236,191,${fade*(.14+.1*(i%3)/2)*(1-night*.6)*strength})`;ctx.beginPath();ctx.ellipse(x,y,.65+(i%3)*.28,.8+(i%2)*.25,0,0,7);ctx.fill()}
 ctx.restore();
}
export function drawMist(ctx,images,clock,settings,reduced){if(!settings.showAtmosphere)return;const mist=img(images,'auspicious_mist');if(!mist)return;ctx.save();ctx.beginPath();ctx.rect(0,816,1600,84);ctx.clip();const strength=settings.motionIntensity==='gentle'?.7:1;
 for(let i=0;i<2;i++){const phase=clock*Math.PI*2/(47+i*11)+i*2.4,w=1080,h=w*mist.height/mist.width,x=(i?645:-80)+Math.sin(phase)*55,y=865+Math.sin(phase*.73)*6;ctx.globalAlpha=(.075+.018*Math.sin(phase))*strength*(reduced?.75:1);ctx.drawImage(mist,x,y-h*.5,w,h)}ctx.restore()}
// Feet and transitions are registered in toad-pose.js, independent of padding.
export function toadBounds(life){const p=life.position;if(!p)return null;return{x:p.x-39/1600,y:p.y-(64+life.height)/900,w:79/1600,h:67/900}}
export function hitToad(p,life){if(!life?.visible||!life.settings.showToad)return false;const b=toadBounds(life);return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h}
export function drawToad(ctx,images,life,night,reduced){if(!life.visible||!life.settings.showToad||!life.position)return;const p=life.position,x=p.x*1600,y=p.y*900;
 ctx.save();ctx.translate(x,y+1);ctx.scale(29*(1-life.height/65),5*(1-life.height/90));const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(43,27,13,${.24*(1-life.height/45)})`);g.addColorStop(1,'#24160800');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
 let pose=life.pose();if(life.phase==='deliver'&&life.age>.12)pose='idle';if(life.phase==='dissolve'&&life.age>1)pose='idle';
 const breath=1+Math.sin(life.time*1.6)*.011*(reduced?.35:1),response=life.phase==='response'?Math.sin(Math.min(1,life.age/.85)*Math.PI)*3:0;
 ctx.save();ctx.translate(x,y-life.height-response);ctx.scale(life.direction,breath*life.squash);ctx.filter=night>.01?`brightness(${1-night*.26})`:'none';
 drawToadPose(ctx,images,life,pose);ctx.restore();
 if(life.phase==='dissolve'){ctx.save();for(let i=0;i<5;i++){const u=life.age/1.6,a=i*2.4;glow(ctx,x+Math.cos(a)*u*18,y-25-u*20+Math.sin(a)*8,2.3,Math.sin(Math.PI*u)*.45)}ctx.restore()}
}
export function drawCoin(ctx,images,coin,clock){const tex=img(images,'gold_coin');if(!tex)return;const age=coin.activeAge||0,u=Math.min(1,age/.4),h=23*(1-u)**2;ctx.save();ctx.globalAlpha=coin.status==='fading'?Math.max(0,1-(clock-coin.fadeAt)):1;ctx.fillStyle='#271c0a35';ctx.beginPath();ctx.ellipse(coin.x*1600,coin.y*900+1,8,2.2,0,0,7);ctx.fill();ctx.translate(coin.x*1600,coin.y*900-h);ctx.rotate(Math.sin(u*Math.PI)*.25);ctx.drawImage(tex,-9,-10,18,12+6*(1-u));ctx.restore()}
export function drawDelivery(ctx,images,life,bowl){if(life.phase!=='deliver'||life.delivery?.id!==bowl.id)return;const tex=img(images,'gold_coin');if(!tex)return;const u=Math.min(1,Math.max(0,(life.age-.12)/.83)),b=bounds(bowl),sx=life.delivery.start.x*1600+life.direction*12,sy=life.delivery.start.y*900-25,ex=bowl.x*1600,ey=(b.y+b.h*.33)*900;if(u>=.98)return;ctx.save();ctx.translate(sx+(ex-sx)*u,sy+(ey-sy)*u-48*Math.sin(Math.PI*u));ctx.rotate(u*1.5);ctx.globalAlpha=Math.min(1,(1-u)*6);ctx.drawImage(tex,-8,-8,16,16);ctx.restore()}
export function drawBowlGlow(ctx,life,bowl){for(const e of life.glows.filter(e=>e.id===bowl.id)){const age=life.time-e.at,u=age/2.5;if(u<0||u>1)continue;const b=bounds(bowl),x=bowl.x*1600,y=(b.y+b.h*.35)*900;glow(ctx,x,y,46*bowl.scale,Math.sin(u*Math.PI)*.23);for(let n=0;n<4;n++)glow(ctx,x+Math.sin(n*8)*22*bowl.scale,y-4-Math.sin(n+u)*13*bowl.scale,1.5,Math.sin(u*Math.PI)*.55)}}
export function drawCoinPreview(ctx,images,p,items){const tex=img(images,'gold_coin');if(!tex||!p)return;ctx.save();ctx.globalAlpha=.5;ctx.drawImage(tex,p.x*1600-9,p.y*900-9,18,12);ctx.globalAlpha=1;ctx.strokeStyle=freePoint(p,items,{x:10,y:4})?'#f3e1a4':'#d48b78';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x*1600,p.y*900+2,13,4,0,0,7);ctx.stroke();ctx.restore()}
