// Geometry is expressed in original 7680 × 4320 artwork coordinates (0…1).
// Both drawing and hit testing use the same full-viewport transform; no viewport coordinates
// are persisted. The lower cat-tree platform is reached only by an explicit jump.
export const WORLD_WIDTH = 7680, WORLD_HEIGHT = 4320;
export const ASPECT = WORLD_HEIGHT / WORLD_WIDTH;
const polygon=points=>Object.freeze(points.map(([x,y])=>Object.freeze({x,y})));
const ellipse=(x,y,rx,ry)=>polygon(Array.from({length:32},(_,i)=>[x+Math.cos(i/32*Math.PI*2)*rx,y+Math.sin(i/32*Math.PI*2)*ry]));
// Coordinates are projected feet locations on the supplied painting. Elevation
// is physical surface height, not an extra screen-y offset to apply twice.
export const SURFACES=Object.freeze([
  {id:'ground',name:'石板庭院',layer:0,height:0,ramp:.03,polygon:polygon([[.29,.265],[.41,.18],[.55,.22],[.64,.27],[.75,.285],[.858,.35],[.886,.56],[.872,.74],[.795,.87],[.674,.952],[.444,.946],[.31,.87],[.265,.71],[.24,.56],[.263,.43]])},
  {id:'step',name:'石阶',layer:1,height:.015,ramp:.034,polygon:polygon([[.527,.273],[.522,.222],[.552,.176],[.640,.166],[.684,.237],[.643,.282]])},
  {id:'porch',name:'木廊',layer:2,height:.021,ramp:.035,polygon:polygon([[.548,.184],[.577,.135],[.647,.117],[.702,.132],[.747,.159],[.80,.193],[.835,.227],[.813,.266],[.754,.244],[.695,.222],[.637,.191],[.590,.190]])},
  {id:'bed-entry',name:'草垫低沿',layer:2,height:.023,ramp:.025,polygon:polygon([[.703,.137],[.775,.127],[.791,.185],[.739,.209],[.703,.177]])},
  {id:'bed',name:'草垫猫窝',layer:3,height:.027,ramp:.032,polygon:ellipse(.739,.088,.073,.079)},
  {id:'rock-step',name:'暖石缓坡',layer:1,height:.007,ramp:.02,polygon:polygon([[.282,.845],[.310,.829],[.338,.847],[.333,.883],[.297,.891],[.280,.877]])},
  {id:'safe-rock',name:'暖石',layer:1,height:.017,ramp:.034,polygon:polygon([[.236,.838],[.246,.813],[.278,.820],[.304,.845],[.302,.887],[.278,.902],[.246,.886],[.235,.862]])},
  {id:'lower-platform',name:'爬架低平台',layer:4,height:.075,ramp:0,polygon:polygon([[.900,.516],[.951,.484],[.993,.531],[.949,.571],[.912,.547]])},
]);
export const WALKABLE_POLYGONS=Object.freeze(SURFACES.map(s=>s.polygon));
export const OBSTACLES=Object.freeze([
  {id:'left-pot',x:.255,y:.415,rx:.027,ry:.051},
  {id:'water-bowl',x:.865,y:.179,rx:.029,ry:.043},
  {id:'right-planter',x:.882,y:.363,rx:.041,ry:.066},
  {id:'climbing-base',x:.957,y:.540,rx:.065,ry:.116},
]);
export const FACILITIES=Object.freeze({
  bed:{id:'bed',x:.739,y:.088,approach:{x:.730,y:.137},label:'草垫猫窝',surfaceId:'bed'},
  step:{id:'step',x:.589,y:.217,approach:{x:.589,y:.217},label:'石阶',surfaceId:'step'},
  rock:{id:'rock',x:.269,y:.858,approach:{x:.278,y:.850},label:'暖石',surfaceId:'safe-rock'},
  water:{id:'water',x:.865,y:.179,approach:{x:.807,y:.232},label:'水碗',surfaceId:'porch'},
  climbing:{id:'climbing',x:.949,y:.525,approach:{x:.857,y:.574},landing:{x:.949,y:.525},label:'爬架低平台',surfaceId:'lower-platform',available:true,capacity:1},
  sun:{id:'sun',x:.64,y:.565,approach:{x:.64,y:.565},label:'阳光石板',surfaceId:'ground'},
});
export const SLEEP_SLOTS=Object.freeze([
  {id:'bed-left',surfaceId:'bed',x:.710,y:.107,label:'草垫左侧'},
  {id:'bed-right',surfaceId:'bed',x:.766,y:.103,label:'草垫右侧'},
  {id:'warm-rock',surfaceId:'safe-rock',x:.271,y:.854,label:'暖石上'},
  {id:'sun-stone-a',surfaceId:'ground',x:.476,y:.45,label:'阳光石板'},
  {id:'sun-stone-b',surfaceId:'ground',x:.640,y:.565,label:'阳光石板'},
  {id:'sun-stone-c',surfaceId:'ground',x:.765,y:.674,label:'阳光石板'},
  {id:'sun-stone-d',surfaceId:'ground',x:.436,y:.70,label:'苔边石板'},
  {id:'garden-stone-a',surfaceId:'ground',x:.576,y:.82,label:'庭中石板'},
  {id:'garden-stone-b',surfaceId:'ground',x:.737,y:.844,label:'庭中石板'},
  {id:'garden-stone-c',surfaceId:'ground',x:.354,y:.546,label:'树荫石板'},
  {id:'garden-stone-d',surfaceId:'ground',x:.827,y:.459,label:'花边石板'},
  {id:'garden-stone-e',surfaceId:'ground',x:.625,y:.371,label:'木廊前石板'},
  {id:'climbing-lower',surfaceId:'lower-platform',x:.949,y:.525,label:'爬架低平台',traversal:'jump'},
]);
export const SLEEP_SLOT_MAP=Object.freeze(Object.fromEntries(SLEEP_SLOTS.map(s=>[s.id,s])));
export function coverTransform(width,height){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
  // Fill the viewport with the actual painting at its original aspect ratio.
  // Unusual windows crop the edges instead of adding blurred letterboxes.
  // Foreground, feet, shadows and input must keep this exact same transform.
  const scale=Math.max(w/WORLD_WIDTH,h/WORLD_HEIGHT);
  return {width:w,height:h,scale,fit:'cover',offsetX:(w-WORLD_WIDTH*scale)/2,offsetY:(h-WORLD_HEIGHT*scale)/2,drawWidth:WORLD_WIDTH*scale,drawHeight:WORLD_HEIGHT*scale};
}
export function worldToScreen(point,t){return {x:t.offsetX+point.x*t.drawWidth,y:t.offsetY+point.y*t.drawHeight};}
export function screenToWorld(point,t){return {x:(point.x-t.offsetX)/t.drawWidth,y:(point.y-t.offsetY)/t.drawHeight};}
export const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*ASPECT);
export function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
}return inside;}
const lowerPlatform=SURFACES.find(s=>s.id==='lower-platform');
function blocked(p){return OBSTACLES.some(o=>!(o.id==='climbing-base'&&pointInPolygon(p,lowerPlatform.polygon))&&((p.x-o.x)/o.rx)**2+((p.y-o.y)/o.ry)**2<1);}
function rawWalkable(p){return Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&WALKABLE_POLYGONS.some(poly=>pointInPolygon(p,poly))&&!blocked(p);}
function edgeDistance(p,poly){let best=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j],dx=b.x-a.x,dy=(b.y-a.y)*ASPECT,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*ASPECT*dy)/length)):0;
  best=Math.min(best,Math.hypot(p.x-(a.x+t*dx),(p.y-a.y)*ASPECT-t*dy));
}return best;}
function surfaceIdAt(p){if(!rawWalkable(p))return null;let selected=null;for(const surface of SURFACES)if(pointInPolygon(p,surface.polygon)&&(!selected||surface.layer>selected.layer))selected=surface;return selected?.id||null;}
export function surfaceAt(point){
  if(!rawWalkable(point))return null;let selected=null,elevation=0;
  for(const surface of SURFACES){if(!pointInPolygon(point,surface.polygon))continue;if(!selected||surface.layer>selected.layer)selected=surface;
    const t=surface.ramp?Math.min(1,edgeDistance(point,surface.polygon)/surface.ramp):1;elevation=Math.max(elevation,surface.height*t*t*(3-2*t));}
  return {id:selected.id,surfaceId:selected.id,name:selected.name,layer:selected.layer,elevation,height:elevation,walkable:true};
}
// Match the painted physical surface, not an arbitrary radius around its
// center. The water bowl is blocked for walking but remains a clickable object.
export function hitFacility(point){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.x>1||point.y<0||point.y>1)return null;
  const surface=surfaceAt(point),id=({bed:'bed','bed-entry':'bed',step:'step','safe-rock':'rock','rock-step':'rock','lower-platform':'climbing'})[surface?.id];
  if(id)return FACILITIES[id];
  const bowl=OBSTACLES.find(o=>o.id==='water-bowl');
  if(((point.x-bowl.x)/bowl.rx)**2+((point.y-bowl.y)/bowl.ry)**2<=1)return FACILITIES.water;
  return null;
}
function transitionAllowed(a,b){
  const x=surfaceIdAt(a),y=surfaceIdAt(b);if(x===y)return true;
  const pair=[x,y].sort().join(':');
  if(['ground:step','porch:step','bed:porch','bed-entry:porch','bed:bed-entry','ground:rock-step','rock-step:safe-rock'].includes(pair))return true;
  // The flat rock is reached from its low right edge, never through its face.
  if(pair==='ground:safe-rock'){const p=x==='safe-rock'?a:b;return p.x>.285&&p.y>.825&&p.y<.89;}
  return false;
}
export function isWalkable(point,padding=.007){
  if(!rawWalkable(point))return false;
  if(padding<=0)return true;
  for(let n=0;n<8;n++){const a=n*Math.PI/4;if(!rawWalkable({x:point.x+Math.cos(a)*padding,y:point.y+Math.sin(a)*padding/ASPECT}))return false;}
  return true;
}
const NAV_EDGES=SURFACES.flatMap(surface=>surface.polygon.map((b,i,poly)=>({a:poly[(i+poly.length-1)%poly.length],b})));
function segmentCuts(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,cuts=[0,1];
  for(const edge of NAV_EDGES){const ex=edge.b.x-edge.a.x,ey=edge.b.y-edge.a.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;
    const ax=edge.a.x-a.x,ay=edge.a.y-a.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
  for(const o of OBSTACLES){const ox=(a.x-o.x)/o.rx,oy=(a.y-o.y)/o.ry,vx=dx/o.rx,vy=dy/o.ry,A=vx*vx+vy*vy,B=2*(ox*vx+oy*vy),C=ox*ox+oy*oy-1,D=B*B-4*A*C;
    if(A&&D>=0){const root=Math.sqrt(D);for(const t of [(-B-root)/(2*A),(-B+root)/(2*A)])if(t>0&&t<1)cuts.push(t);}}
  cuts.sort((x,y)=>x-y);return cuts;
}
function exactOffsetSegment(a,b){
  if(!rawWalkable(a)||!rawWalkable(b))return false;const cuts=segmentCuts(a,b);
  for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(!rawWalkable({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))return false;}return true;
}
export function segmentWalkable(a,b,padding=.007){
  // Long routes are split at actual polygon/obstacle crossings. This is both
  // stricter and cheaper than sampling hundreds of points per AI decision.
  if(distance(a,b)>.012){
    if(!exactOffsetSegment(a,b))return false;
    if(padding>0)for(let i=0;i<8;i++){const angle=i*Math.PI/4,ox=Math.cos(angle)*padding,oy=Math.sin(angle)*padding/ASPECT;if(!exactOffsetSegment({x:a.x+ox,y:a.y+oy},{x:b.x+ox,y:b.y+oy}))return false;}
    const cuts=segmentCuts(a,b);let previous=a;for(let i=1;i<cuts.length;i++){if(cuts[i]-cuts[i-1]<1e-10)continue;const t=(cuts[i-1]+cuts[i])/2,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(!transitionAllowed(previous,p))return false;previous=p;}return transitionAllowed(previous,b);
  }
  const steps=Math.max(1,Math.ceil(distance(a,b)/.001));let previous=a;
  for(let i=0;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(!isWalkable(p,padding)||(i>0&&!transitionAllowed(previous,p)))return false;previous=p;}return true;
}

const GRID_X=65,GRID_Y=37;
const nodes=[];
for(let y=0;y<GRID_Y;y++)for(let x=0;x<GRID_X;x++){
  const p={x:x/(GRID_X-1),y:y/(GRID_Y-1)};
  nodes.push(isWalkable(p)?{...p,key:y*GRID_X+x,neighbors:[]}:null);
}
for(const p of nodes)if(p){const x=p.key%GRID_X,y=Math.floor(p.key/GRID_X);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||nx>=GRID_X||ny<0||ny>=GRID_Y)continue;
  const q=nodes[ny*GRID_X+nx];if(q&&segmentWalkable(p,q))p.neighbors.push(q.key);
}}
const safeNodes=nodes.filter(Boolean);
export function nearestWalkable(point,maxDistance=Infinity){
  if(isWalkable(point))return {x:point.x,y:point.y};
  let best=null,bestD=maxDistance;
  for(const p of safeNodes){const d=distance(p,point||{});if(d<bestD){bestD=d;best=p;}}
  return best?{x:best.x,y:best.y}:null;
}
const roamingNodes=safeNodes.filter(p=>surfaceIdAt(p)!=='lower-platform');
export function randomWalkable(random=Math.random){const p=roamingNodes[Math.min(roamingNodes.length-1,Math.floor(Math.max(0,random())*roamingNodes.length))];return {x:p.x,y:p.y};}
function avoidsCats(a,b,avoid){
  for(const o of avoid){const radius=o.radius||.046,dx=b.x-a.x,dy=(b.y-a.y)*ASPECT,l=dx*dx+dy*dy;
    const start=distance(a,o),end=distance(b,o),t=l?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*ASPECT*dy)/l)):0;
    const nearest=Math.hypot(a.x+t*dx-o.x,(a.y-o.y)*ASPECT+t*dy);
    if(start<radius){if(end<start-.00001||nearest<start-.0001)return false;}
    else if(nearest<radius)return false;
  }return true;
}
function nearestConnected(point,avoid=[]){
  // Start around the point's grid cell rather than scanning the entire garden
  // for every cat decision. A route only needs a nearby visible graph node.
  const cx=Math.round(point.x*(GRID_X-1)),cy=Math.round(point.y*(GRID_Y-1));
  for(let radius=0;radius<8;radius++){
    let best=null,d=Infinity;
    for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
      if(x<0||x>=GRID_X||y<0||y>=GRID_Y||(radius>0&&Math.abs(x-cx)<radius&&Math.abs(y-cy)<radius))continue;
      const p=nodes[y*GRID_X+x];if(!p)continue;const n=distance(point,p);
      if(n<d&&avoidsCats(point,p,avoid)&&segmentWalkable(point,p)){best=p;d=n;}
    }
    if(best)return best;
  }
  return null;
}
export function findPath(from,to,{avoid=[]}={}){
  if(!isWalkable(from)||!isWalkable(to)||avoid.some(o=>distance(to,o)<(o.radius||.046)))return null;
  if(avoidsCats(from,to,avoid)&&segmentWalkable(from,to))return [{x:to.x,y:to.y}];
  const start=nearestConnected(from,avoid),end=nearestConnected(to,avoid);if(!start||!end)return null;
  const open=new Set([start.key]),g=new Map([[start.key,0]]),parents=new Map();let iterations=0;
  while(open.size&&iterations++<(avoid.length?700:2500)){
    let key=null,score=Infinity;for(const id of open){const f=g.get(id)+distance(nodes[id],end);if(f<score){score=f;key=id;}}
    if(key===end.key){const path=[{x:to.x,y:to.y}];let id=key;while(id!==start.key){path.unshift({x:nodes[id].x,y:nodes[id].y});id=parents.get(id);}path.unshift({x:start.x,y:start.y});
      const simplified=[];let anchor=from;while(path.length){let i=path.length-1;while(i>0&&(!avoidsCats(anchor,path[i],avoid)||!segmentWalkable(anchor,path[i])))i--;anchor=path[i];simplified.push(anchor);path.splice(0,i+1);}return simplified;
    }
    open.delete(key);for(const id of nodes[key].neighbors){if(!avoidsCats(nodes[key],nodes[id],avoid))continue;const candidate=g.get(key)+distance(nodes[key],nodes[id]);if(candidate<(g.get(id)??Infinity)){g.set(id,candidate);parents.set(id,key);open.add(id);}}
  }return null;
}
// Feet anchor the contact shadow. The visible torso lies above that anchor.
export function hitCat(cats,point){return cats.filter(c=>c.active).sort((a,b)=>b.y-a.y).find(c=>{
  const w=c.hitWidth||.055,h=c.hitHeight||.092,footY=c.y-(c.traverse?.jumpHeight||0)/ASPECT;return ((point.x-c.x)/(w*.58))**2+((point.y-(footY-h*.48))/(h*.6))**2<=1;
})||null;}
export const WALKABLE_AREAS = WALKABLE_POLYGONS;
