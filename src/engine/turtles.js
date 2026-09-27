const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function syncTurtles(sim){
 const count=Math.round(clamp(Number.isFinite(sim.options.turtleCount)?sim.options.turtleCount:0,0,4));
 sim.turtles=sim.turtles.slice(0,count);
 while(sim.turtles.length<count){const r=sim.random;sim.turtles.push({id:`turtle-${sim.serial++}`,x:sim.width*(.23+r()*.5),y:sim.height*(.24+r()*.5),heading:r()*TAU,length:45+r()*17,phase:r()*TAU,velocity:8,speed:7+r()*5,targetX:sim.width*(.2+r()*.6),targetY:sim.height*(.2+r()*.6),wander:4+r()*6,rest:0,seed:r()})}
}
export function updateTurtles(sim,dt){
 const {width:w,height:h,random:r}=sim,season=sim.options.season;
 for(const turtle of sim.turtles){
  turtle.wander-=dt;turtle.rest=Math.max(0,turtle.rest-dt);
  const radius=sim.bodyRadius(turtle);
  let food=null,nearest=350;
  for(const f of sim.food){if(f.clearance<radius)continue;const d=Math.hypot(f.x-turtle.x,f.y-turtle.y);if(d<nearest){food=f;nearest=d}}
  if(food&&!sim.habitat.routeClear(turtle.x,turtle.y,food.x,food.y,radius))food=null;
  if(turtle.wander<=0||Math.hypot(turtle.targetX-turtle.x,turtle.targetY-turtle.y)<25){turtle.targetX=w*(.16+r()*.67);turtle.targetY=h*(.17+r()*.66);const target=sim.habitat.project(turtle.targetX,turtle.targetY,radius+15);turtle.targetX=target.x;turtle.targetY=target.y;turtle.wander=10+r()*12;if(!food)turtle.rest=1+r()*2}
  const tx=food?food.x:turtle.targetX,ty=food?food.y:turtle.targetY,d=Math.max(1,Math.hypot(tx-turtle.x,ty-turtle.y));let sx=(tx-turtle.x)/d,sy=(ty-turtle.y)/d,startled=false;
  if(sim.hand.life>0){const dx=turtle.x-sim.hand.x,dy=turtle.y-sim.hand.y,dist=Math.hypot(dx,dy);if(dist<105){sx+=dx/Math.max(1,dist)*(1-dist/105)*6;sy+=dy/Math.max(1,dist)*(1-dist/105)*6;startled=true;turtle.rest=0}}
  for(const other of [...sim.turtles,...sim.fish]){if(other===turtle)continue;const dx=turtle.x-other.x,dy=turtle.y-other.y,dist=Math.hypot(dx,dy);if(dist>1&&dist<38){sx+=dx/dist*(1-dist/38);sy+=dy/dist*(1-dist/38)}}
  const mx=Math.min(90,w*.15),my=Math.min(75,h*.15);
  if(turtle.x<mx)sx+=(1-turtle.x/mx)*5;if(turtle.x>w-mx)sx-=(1-(w-turtle.x)/mx)*5;
  if(turtle.y<my)sy+=(1-turtle.y/my)*5;if(turtle.y>h-my)sy-=(1-(h-turtle.y)/my)*5;
  const bank=sim.shoreForce(turtle);sx+=bank.x;sy+=bank.y;
  const angle=Math.atan2(sy,sx),delta=Math.atan2(Math.sin(angle-turtle.heading),Math.cos(angle-turtle.heading));turtle.heading+=clamp(delta,-dt*(food?1.6:.8),dt*(food?1.6:.8));
  const speed=turtle.speed*(season==='winter'?.42:1)*(sim.options.reducedMotion?.45:1)*(startled?1.5:food?1.65:turtle.rest>0?.1:1);
  turtle.velocity+=(speed-turtle.velocity)*Math.min(1,dt*2.5);sim.moveAnimal(turtle,dt);turtle.phase+=dt*(.6+turtle.velocity*.1);
  const scale=clamp(Math.min(w/1250,h/780),.78,1.15),mouthX=turtle.x+Math.cos(turtle.heading)*turtle.length*.53*scale,mouthY=turtle.y+Math.sin(turtle.heading)*turtle.length*.53*scale;
  for(let i=sim.food.length-1;i>=0;i--)if(Math.hypot(sim.food[i].x-mouthX,sim.food[i].y-mouthY)<11){sim.addRipple(sim.food[i].x,sim.food[i].y,.35);sim.food.splice(i,1);turtle.rest=.8;break}
 }
}
const oval=(c,x,y,rx,ry,fill,rotation=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,rotation,0,TAU);c.fillStyle=fill;c.fill()};
/** Painted body parts are cached once; only their gentle swimming poses change per frame. */
export class TurtleRenderer{
 constructor(){
  this.shell=document.createElement('canvas');this.shell.width=240;this.shell.height=200;
  const c=this.shell.getContext('2d');c.translate(120,100);c.scale(2.5,2.5);
  // A plump celadon shell, with soft scutes instead of a dark, angular grid.
  const rim=c.createLinearGradient(0,-32,0,32);rim.addColorStop(0,'#d1dba2');rim.addColorStop(.5,'#9cbd89');rim.addColorStop(1,'#588974');
  oval(c,0,0,37,31,rim);
  const dome=c.createRadialGradient(-9,-12,2,1,3,40);dome.addColorStop(0,'#bad99a');dome.addColorStop(.38,'#91bf89');dome.addColorStop(.77,'#679e7a');dome.addColorStop(1,'#497d69');
  oval(c,0,-.6,34.5,28.5,dome);
  c.save();c.beginPath();c.ellipse(0,-.6,34.5,28.5,0,0,TAU);c.clip();
  const scute=(points,fill)=>{c.beginPath();const last=points[points.length-1],first=points[0];c.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle='rgba(50,106,80,.33)';c.lineWidth=.75;c.stroke()};
  scute([[-31,0],[-24,-11],[-13,-10],[-9,0],[-13,10],[-24,11]],'rgba(187,215,150,.14)');
  scute([[-11,0],[-6,-12],[7,-12],[12,0],[7,12],[-6,12]],'rgba(192,224,162,.22)');
  scute([[10,0],[15,-10],[25,-9],[32,0],[25,9],[15,10]],'rgba(173,210,146,.14)');
  c.lineCap='round';c.lineJoin='round';c.strokeStyle='rgba(54,111,81,.29)';c.lineWidth=.8;
  for(const side of [-1,1]){
   for(const [x,bend,end] of [[-24,-29,-27],[-12,-15,-13],[8,11,14],[25,29,28]]){c.beginPath();c.moveTo(x,side*10);c.quadraticCurveTo(bend,side*18,end,side*30);c.stroke()}
   c.strokeStyle='rgba(220,237,183,.25)';c.lineWidth=1.4;c.beginPath();c.moveTo(-23,side*16);c.bezierCurveTo(-13,side*25,10,side*26,23,side*15);c.stroke();c.strokeStyle='rgba(54,111,81,.29)';c.lineWidth=.8;
  }
  // Subtle painted mottling is static, including at Retina/4K resolution.
  for(let i=0;i<90;i++){const x=Math.sin(i*7.1)*32,y=Math.sin(i*3.7)*27;oval(c,x,y,.35+(i%4)*.18,.35,'rgba(225,238,183,.13)')}
  const shine=c.createRadialGradient(-9,-13,0,-9,-13,19);shine.addColorStop(0,'rgba(245,247,204,.24)');shine.addColorStop(1,'rgba(245,247,204,0)');oval(c,-9,-13,21,15,shine);c.restore();
  c.strokeStyle='rgba(225,237,192,.52)';c.lineWidth=1;c.beginPath();c.ellipse(0,-.6,35.5,29.5,0,Math.PI*1.04,Math.PI*1.87);c.stroke();

  this.head=document.createElement('canvas');this.head.width=144;this.head.height=112;
  const h=this.head.getContext('2d');h.translate(72,56);h.scale(4,4);
  const skin=h.createRadialGradient(2,-4,0,0,1,18);skin.addColorStop(0,'#c1dda8');skin.addColorStop(.58,'#9ac58c');skin.addColorStop(1,'#64997d');
  h.beginPath();h.moveTo(-12,-7);h.bezierCurveTo(-5,-14,8,-13,13,-6);h.bezierCurveTo(17,-1,15,6,10,9);h.bezierCurveTo(3,14,-8,11,-12,6);h.quadraticCurveTo(-15,0,-12,-7);h.fillStyle=skin;h.fill();
  // A larger head and bright little eyes remain readable at pond scale.
  for(const side of [-1,1]){
   oval(h,5.7,side*7.5,3.2,3.0,'#d3e4b5');oval(h,6.4,side*7.6,2.35,2.4,'#294e41');oval(h,7.05,side*7.05,.85,.85,'#f4f5d9');oval(h,5.6,side*8.15,.38,.38,'rgba(177,213,159,.8)');
   oval(h,10.4,side*4.9,2.0,1.1,'rgba(213,157,126,.34)',side*.4);
  }
  h.strokeStyle='rgba(57,106,78,.6)';h.lineWidth=.65;h.lineCap='round';h.beginPath();h.moveTo(13.9,-2.4);h.quadraticCurveTo(12.1,0,13.9,2.4);h.stroke();
  oval(h,11.4,-1.6,.45,.36,'rgba(48,95,69,.52)');oval(h,11.4,1.6,.45,.36,'rgba(48,95,69,.52)');
  oval(h,-1,-3,4.5,2.2,'rgba(234,242,193,.2)',-.2);

  this.foot=document.createElement('canvas');this.foot.width=128;this.foot.height=160;
  const f=this.foot.getContext('2d');f.translate(64,40);f.scale(3,3);
  const paddle=f.createLinearGradient(-3,0,3,31);paddle.addColorStop(0,'#7fae87');paddle.addColorStop(.55,'#abd09c');paddle.addColorStop(1,'#86b08a');
  f.beginPath();f.moveTo(-7,-2);f.bezierCurveTo(-11,2,-16,10,-15,19);f.bezierCurveTo(-14,28,-8,32,-1,30);f.bezierCurveTo(8,28,12,18,9,9);f.quadraticCurveTo(7,1,7,-2);f.closePath();f.fillStyle=paddle;f.fill();
  f.strokeStyle='rgba(218,231,178,.65)';f.lineWidth=.85;f.lineCap='round';
  for(let i=0;i<3;i++){f.beginPath();f.moveTo(-8+i*5,24-i*.8);f.quadraticCurveTo(-8+i*5,26,-6+i*4.5,27-i);f.stroke()}
  oval(f,-6,13,3,6,'rgba(223,237,186,.22)',.4);
  this.shadow=document.createElement('canvas');this.shadow.width=128;this.shadow.height=96;const s=this.shadow.getContext('2d');s.filter='blur(5px)';oval(s,64,48,36,29,'rgba(8,42,30,.55)');
 }
 draw(c,t,{night=false,shadow=false,scale=1}={}){
  c.save();c.translate(t.x+(shadow?6:0),t.y+(shadow?9:0));c.rotate(t.heading);c.scale(t.length*scale/100,t.length*scale/100);c.globalAlpha=night?.75:.95;
  if(shadow){c.globalAlpha=.3;c.drawImage(this.shadow,-64,-48,128,96);c.restore();return}
  c.fillStyle='#89af87';c.beginPath();c.moveTo(-29,-4);c.quadraticCurveTo(-39,-3,-44,Math.sin(t.phase)*1.7);c.quadraticCurveTo(-38,4,-29,4);c.fill();
  for(const front of [true,false])for(const side of [-1,1]){
   const stroke=Math.sin(t.phase+(side<0?Math.PI:0)+(front?0:Math.PI*.6));c.save();c.translate(front?19:-22,side*21);c.rotate(side*(front?-.4:.52)+stroke*.25);c.scale(front?1:.82,side*(front?1:.9));c.drawImage(this.foot,-64/3,-40/3,128/3,160/3);c.restore();
  }
  c.save();c.translate(43.5,Math.sin(t.phase*.6)*.75);c.rotate(Math.sin(t.phase*.4)*.025);oval(c,-11,0,12,7,'#91ba8e');c.drawImage(this.head,-18,-14,36,28);c.restore();
  c.drawImage(this.shell,-48,-40,96,80);c.restore();
 }
 destroy(){for(const part of [this.shell,this.head,this.foot,this.shadow])part.width=part.height=0}
}
