// Local articulation over a stable painted pose. Geometry moves, coat pixels do
// not dissolve into a differently painted cat. Coordinates are source-rect UVs.
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
export function pawCycle(phase){
 const p=((phase%1)+1)%1,duty=.62;
 if(p<duty)return {travel:.5-p/duty,lift:0,planted:true};
 const u=(p-duty)/(1-duty);return {travel:-.5+smooth(u),lift:Math.sin(u*Math.PI)**1.25,planted:false};
}
export const WALK_RIGS=Object.freeze({
 toward:{legs:[[[.35,.69],[.31,.81],[.27,.95]],[[.46,.63],[.42,.75],[.39,.84]],[[.75,.45],[.76,.58],[.73,.72]],[[.81,.39],[.84,.49],[.81,.61]]],head:[.25,.60],body:[.59,.48],tail:[[.72,.33],[.88,.09]]},
 away:{legs:[[[.29,.33],[.24,.43],[.24,.55]],[[.40,.40],[.38,.50],[.38,.62]],[[.65,.68],[.67,.80],[.68,.96]],[[.52,.59],[.52,.73],[.53,.82]]],head:[.20,.16],body:[.47,.49],tail:[[.69,.57],[.86,.32]]},
});
const gauss=(p,c,rx,ry)=>Math.exp(-2*(((p.x-c[0])/rx)**2+((p.y-c[1])/ry)**2));
function boneWeight(p,hip,knee,paw){
 const segment=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/n),x=a[0]+t*dx,y=a[1]+t*dy;return {t,weight:Math.exp(-((p.x-x)**2+(p.y-y)**2)/(.068*.068))}};
 const upper=segment(hip,knee),lower=segment(knee,paw);
 return Math.max(upper.weight*upper.t*.38,lower.weight*(.38+.62*lower.t))*clamp((p.y-hip[1])/.11);
}
export function rigVertexWeights(p,frame,action){
 const map=frame.sourceMapping||{x:0,y:0,width:1,height:1},q={x:(p.x-map.x)/map.width,y:(p.y-map.y)/map.height},away=frame.index>=4&&frame.index<=7,rig=away?WALK_RIGS.away:WALK_RIGS.toward;
 const walking=action.startsWith('walk')||action==='idle'||action==='pounce'&&(frame.index===0||frame.index===4),joints=[...rig.legs];
 if(away&&frame.rearTargets){const {near,far}=frame.rearTargets;joints[2]=[near.hip,near.knee,near.paw];joints[3]=[far.hip,far.knee,far.paw]}
 const legs=walking?joints.map(([a,b,c],i)=>away&&frame.farLegSeparate&&i===3?0:boneWeight(q,a,b,c)):[0,0,0,0];
 const total=legs.reduce((a,b)=>a+b,0);if(total>1)for(let i=0;i<4;i++)legs[i]/=total;
 const part=r=>r?gauss(p,[r[0]+r[2]*.5,r[1]+r[3]*.5],r[2]*.65,r[3]*.65):0;
 const head=walking?gauss(q,rig.head,.25,.24):part(frame.parts.head),body=walking?gauss(q,rig.body,.31,.29):part(frame.parts.body),tail=walking?gauss(q,rig.tail[1],.21,.29):part(frame.parts.tail);
 return {legs,head,body,tail,paws:walking?0:part(frame.parts.legs),mx:map.width,my:map.height};
}
export function rigControls(action,time,{gaitPhase=0,strideStrength=0,motionStage=null,stageProgress=0,reducedMotion=false}={}){
 const strength=reducedMotion?strideStrength*.4:strideStrength,phase=gaitPhase*TAU;
 const controls={legs:Array.from({length:4},()=>({x:0,y:0})),head:{x:0,y:0},body:{x:0,y:0},tail:{x:0,y:0},paws:{x:0,y:0}};
 if(action.startsWith('walk')){
  const offsets=[0,.5,.25,.75],away=action==='walkAway',ax=away?.72:-.72,ay=away?-.32:.32;
  controls.legs=offsets.map(offset=>{const step=pawCycle(gaitPhase+offset);return {x:ax*step.travel*.18*strength,y:(ay*step.travel*.18-step.lift*.065)*strength}});
  controls.head.y=Math.sin(phase*2+.5)*.003*strength;controls.body.y=Math.sin(phase*2)*.003*strength;controls.tail={x:Math.sin(phase-.8)*.024*strength,y:Math.cos(phase-.8)*.004*strength};
 }else if(action==='eat'){
  const chew=Math.sin(time*5.1),nod=Math.sin(time*2.15);controls.head={x:chew*.0025,y:nod*.012+Math.max(0,chew)*.003};controls.body.y=Math.sin(time*1.3)*.002;
 }else if(action==='groom'){
  const wash=Math.sin(time*3.5);controls.paws={x:wash*.014,y:-Math.max(0,wash)*.027};controls.head={x:-wash*.009,y:Math.sin(time*3.5-.4)*.012};controls.body.y=Math.sin(time*1.5)*.002;
 }else if(action==='scratch'){
  const scratch=Math.sin(time*5.4);controls.paws={x:scratch*.006,y:scratch*.032};controls.head.y=Math.sin(time*2.7)*.004;controls.body.y=Math.sin(time*2.7)*.007;
 }else if(action==='pounce'){
  const crouch=motionStage==='crouch'?smooth(stageProgress):motionStage==='jump'?1-smooth(stageProgress):motionStage==='land'?Math.sin(clamp(stageProgress)*Math.PI):Math.max(0,Math.sin(time*2.1));
  controls.paws={x:crouch*.005,y:-crouch*.019};controls.body.y=crouch*.019;controls.head.y=crouch*.013;controls.tail.x=Math.sin(time*2)*.010;
  if(motionStage){const tucked=motionStage==='jump'?Math.sin(clamp(stageProgress)*Math.PI):0;controls.legs=controls.legs.map((_,i)=>({x:(i%2?.007:-.007)*tucked,y:-.045*tucked}));}
 }else{controls.body.y=Math.sin(time*(action==='sleep'?1.05:1.35))*.003;controls.tail.x=action==='idle'?Math.sin(time*.8)*.008:0;}
 if(reducedMotion&&!action.startsWith('walk'))for(const key of ['head','body','tail','paws']){controls[key].x*=.3;controls[key].y*=.3}
 return controls;
}
export function applyRigWeights(weights,controls){
 let x=0,y=0;for(let i=0;i<4;i++){x+=weights.legs[i]*controls.legs[i].x;y+=weights.legs[i]*controls.legs[i].y}
 for(const key of ['head','body','tail','paws']){x+=weights[key]*controls[key].x;y+=weights[key]*controls[key].y}
 return {x:x*weights.mx,y:y*weights.my};
}
