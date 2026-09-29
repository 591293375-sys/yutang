import {getSpecies} from './catalog.js';

export const WORLD_WIDTH=1600, WORLD_HEIGHT=900;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const P=(x,y)=>({x:x*WORLD_WIDTH,y:y*WORLD_HEIGHT});
const polygon=points=>points.map(([x,y])=>P(x,y));

// This single coast drives both the water mask and every habitat query. The
// former low-water painting is retained only as a texture source below.
const PAINTED_SHORE=polygon([[.89,-.1],[.85,.085],[.825,.154],[.783,.191],[.754,.224],
  [.778,.286],[.791,.350],[.801,.434],[.824,.494],[.809,.566],[.781,.615],
  [.735,.661],[.687,.709],[.655,.752],[.605,.786],[.543,.813],[.491,.842],
  [.438,.872],[.387,.879],[.331,.848],[.273,.827],[.225,.803],[.181,.757],[-.09,.605]]);
// Low tide exposes a broad continuous wet beach while retaining the upper sea
// entrance and the central channel used by fish and drifting bottles.
const LOW_SHORE=polygon([[.89,-.1],[.83,.05],[.76,.12],[.72,.17],[.71,.22],
  [.70,.265],[.68,.31],[.66,.355],[.655,.40],[.64,.445],[.62,.49],
  [.59,.525],[.555,.555],[.515,.59],[.46,.62],[.40,.645],[.34,.64],
  [.285,.62],[.23,.59],[.185,.56],[.14,.53],[.105,.50],[.065,.46],[-.09,.40]]);
// The concave upper inlet needs its own smooth high-water trace. A uniform
// normal offset folds into self-intersections where the inlet radius is small.
const HIGH_SHORE=polygon([[1.02,-.1],[.99,.10],[.965,.19],[.96,.25],[.97,.31],
  [.98,.38],[.99,.46],[.99,.53],[.98,.60],[.95,.69],[.925,.77],
  [.89,.85],[.84,.94],[.77,1.01],[.70,1.07],[.63,1.10],[.55,1.13],
  [.47,1.14],[.39,1.13],[.306,1.10],[.245,1.055],[.17,1.00],[.12,.94],[-.09,.84]]);

function smoothLine(points,steps=7){
  const result=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
    for(let j=0;j<steps;j++){
      const t=j/steps,t2=t*t,t3=t2*t;
      result.push({x:.5*((2*b.x)+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3),
        y:.5*((2*b.y)+(-a.y+c.y)*t+(2*a.y-5*b.y+4*c.y-d.y)*t2+(-a.y+3*b.y-3*c.y+d.y)*t3)});
    }
  }
  result.push(points.at(-1));return result;
}

const LOW_SAMPLES=smoothLine(LOW_SHORE);
const HIGH_SAMPLES=smoothLine(HIGH_SHORE);
// Artwork coverage is deliberately separate from habitat. It identifies where
// the fixed marine plate needs a dry seabed beneath the animated water mask.
export const PAINTED_WATER_BOUNDARY=Object.freeze([{x:-300,y:-300},...smoothLine(PAINTED_SHORE),{x:-300,y:900}]);
const shoreCache=new Map();
export function shoreLine(level=0){
  const key=Math.round(clamp(level)*500);
  if(shoreCache.has(key))return shoreCache.get(key);
  const t=key/500;
  const result=LOW_SAMPLES.map((point,i)=>{
    const high=HIGH_SAMPLES[i];
    return {x:point.x+(high.x-point.x)*t,y:point.y+(high.y-point.y)*t};
  });
  if(shoreCache.size>510)shoreCache.clear();
  shoreCache.set(key,result);return result;
}

const boundaryCache=new WeakMap();
export function waterBoundary(level=0){
  const line=shoreLine(level);
  if(!boundaryCache.has(line))boundaryCache.set(line,[{x:-300,y:-300},...line,{x:-300,y:900}]);
  return boundaryCache.get(line);
}
export const POOL=polygon([[.806,.837],[.793,.795],[.812,.756],[.841,.730],[.875,.722],
  [.910,.742],[.916,.776],[.898,.806],[.885,.849],[.856,.873],[.822,.865]]);

function ellipse(x,y,rx,ry,n=16){return Array.from({length:n},(_,i)=>{
  const a=i/n*Math.PI*2;return P(x+Math.cos(a)*rx,y+Math.sin(a)*ry);
});}

// Trace the actual stone faces in the aligned 1672 × 941 artwork, excluding
// the sand/shadow around them. Their dry plate is also the foreground source:
// restoring the original sea plate would paint turquoise water over the rock.
const stone=points=>points.map(([x,y])=>P(x/1672,y/941));
export const DRY_ROCKS=Object.freeze([
  // Central group: rear, left rear, left front, right front, small round stone.
  stone([[491,533],[509,497],[551,473],[604,465],[635,452],[693,448],[736,453],
    [777,463],[811,482],[840,509],[852,534],[858,562],[824,584],[769,605],
    [721,630],[679,640],[637,660],[591,662],[552,639],[516,608],[503,574]]),
  stone([[251,611],[259,589],[282,568],[315,555],[350,549],[383,549],[417,558],
    [450,574],[470,592],[474,620],[451,642],[415,650],[374,651],[335,659],
    [294,659],[267,644],[251,629]]),
  stone([[286,665],[300,645],[330,631],[340,608],[359,588],[390,575],[428,573],
    [467,581],[503,595],[533,611],[561,636],[576,661],[586,690],[582,710],
    [564,726],[536,735],[504,736],[478,744],[446,739],[419,730],[386,730],
    [356,718],[326,713],[304,698],[290,685]]),
  stone([[657,613],[669,583],[694,559],[727,548],[761,544],[798,552],[835,566],
    [868,581],[895,601],[912,624],[918,646],[910,669],[893,688],[868,701],
    [835,710],[798,713],[762,708],[729,699],[699,686],[674,665],[661,642]]),
  stone([[579,711],[586,691],[602,677],[624,668],[646,670],[671,680],[687,696],
    [695,715],[689,731],[675,744],[652,752],[626,754],[602,746],[586,732]]),
  // Middle-right boulder and its touching upper stone share one silhouette.
  stone([[984,428],[1004,405],[1001,387],[984,377],[990,360],[1009,348],
    [1035,340],[1067,344],[1097,357],[1110,372],[1107,383],[1147,375],
    [1194,387],[1230,407],[1255,435],[1265,464],[1263,489],[1251,512],
    [1224,535],[1183,548],[1137,550],[1092,537],[1054,522],[1021,512],
    [994,491],[980,463]]),
  // The small right stone is lower and flatter than the former ellipse.
  stone([[1355,413],[1360,402],[1374,394],[1388,391],[1406,394],[1417,402],
    [1424,413],[1422,423],[1410,430],[1396,434],[1377,433],[1363,427]]),
]);

export const ROCKS=Object.freeze([
  polygon([[-.04,-.05],[.288,-.05],[.273,.044],[.287,.082],[.256,.143],[.206,.157],[.155,.214],[.094,.268],[-.02,.341]]),
  ellipse(.142,.257,.077,.074),ellipse(.026,.426,.043,.073),
  ellipse(.427,.072,.068,.072),ellipse(.557,.165,.035,.030),ellipse(.603,.196,.025,.027),
  ellipse(.590,.263,.095,.073),ellipse(.775,.359,.036,.045),
  polygon([[-.04,.522],[.025,.519],[.077,.580],[.100,.679],[.106,.719],[.076,.764],[.139,.798],[.179,.831],
    [.214,.872],[.238,.927],[.324,1.04],[-.04,1.04]]),
  // Trace the emergent rock silhouettes, not the dry sand between them. A
  // broad bank polygon would restore angular wedges of dry sand at high tide.
  polygon([[.856,-.04],[1.04,-.04],[1.04,.260],[1,.258],[.970,.249],[.945,.243],
    [.916,.235],[.887,.220],[.876,.190],[.873,.150],[.862,.154],[.857,.135],
    [.865,.115],[.858,.104],[.847,.100],[.839,.113],[.826,.132],[.804,.144],
    [.785,.143],[.775,.131],[.779,.106],[.788,.086],[.807,.070],[.830,.064],
    [.830,.045],[.845,.033]]),
  ellipse(.929,.247,.017,.020),ellipse(.860,.213,.008,.011),
  ellipse(.985,.282,.011,.014),
  polygon([[.916,.705],[.959,.701],[1.04,.749],[1.04,1.04],[.839,1.04],[.825,.956],[.854,.906],[.916,.870],[.931,.819],[.909,.786]]),
  ...DRY_ROCKS,
]);

function polygonEdges(points){
  const edges=[];for(let i=0,j=points.length-1;i<points.length;j=i++)edges.push({a:points[i],b:points[j]});return edges;
}
// The shared large water polygons are immutable. Index their ray-crossing edges
// by y so each query visits only edges which can intersect that horizontal ray.
const polygonBands=new WeakMap();
function edgesAtY(points,y){
  if(points.length<32)return null;
  let bands=polygonBands.get(points);
  if(!bands){bands=new Map();for(const edge of polygonEdges(points)){
    for(let band=Math.floor(Math.min(edge.a.y,edge.b.y)/32);band<=Math.floor(Math.max(edge.a.y,edge.b.y)/32);band++){
      if(!bands.has(band))bands.set(band,[]);bands.get(band).push(edge);
    }
  }polygonBands.set(points,bands);}
  return bands.get(Math.floor(y/32))||[];
}
export function pointInPolygon(x,y,points){
  let inside=false;const edges=edgesAtY(points,y);
  if(edges){for(const {a,b} of edges)if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
  else for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
const rockBounds=ROCKS.map(poly=>({poly,minX:Math.min(...poly.map(p=>p.x)),maxX:Math.max(...poly.map(p=>p.x)),minY:Math.min(...poly.map(p=>p.y)),maxY:Math.max(...poly.map(p=>p.y))}));
export function blockedAt(x,y){
  if(x<8||y<8||x>WORLD_WIDTH-8||y>WORLD_HEIGHT-8)return true;
  for(const r of rockBounds)if(x>=r.minX&&x<=r.maxX&&y>=r.minY&&y<=r.maxY&&pointInPolygon(x,y,r.poly))return true;
  return false;
}

// Exact segment projection behind an ordered bounding-box tree. Pruning cannot
// remove a closer segment; only the final minimum needs a square root.
const segmentCache=new WeakMap();
function boxDistanceSquared(x,y,box){
  const dx=x<box.minX?box.minX-x:x>box.maxX?x-box.maxX:0;
  const dy=y<box.minY?box.minY-y:y>box.maxY?y-box.maxY:0;
  return dx*dx+dy*dy;
}
function shoreSegments(line){
  if(segmentCache.has(line))return segmentCache.get(line);
  const segments=[];
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],dx=b.x-a.x,dy=b.y-a.y;
    segments.push({x:a.x,y:a.y,dx,dy,lengthSquared:dx*dx+dy*dy||1,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});
  }
  const build=(from,to)=>{
    const node={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,from,to};
    for(let i=from;i<to;i++){const s=segments[i];node.minX=Math.min(node.minX,s.minX);node.maxX=Math.max(node.maxX,s.maxX);node.minY=Math.min(node.minY,s.minY);node.maxY=Math.max(node.maxY,s.maxY);}
    if(to-from>8){const mid=(from+to)>>1;node.left=build(from,mid);node.right=build(mid,to);}
    return node;
  };
  const result={segments,tree:build(0,segments.length)};segmentCache.set(line,result);return result;
}
function nearestSegment(x,y,node,segments,best){
  if(boxDistanceSquared(x,y,node)>best)return best;
  if(node.left){
    const leftFirst=boxDistanceSquared(x,y,node.left)<=boxDistanceSquared(x,y,node.right);
    best=nearestSegment(x,y,leftFirst?node.left:node.right,segments,best);
    return nearestSegment(x,y,leftFirst?node.right:node.left,segments,best);
  }
  for(let i=node.from;i<node.to;i++){
    const s=segments[i];if(boxDistanceSquared(x,y,s)>best)continue;
    const ax=x-s.x,ay=y-s.y,t=clamp((ax*s.dx+ay*s.dy)/s.lengthSquared),dx=ax-t*s.dx,dy=ay-t*s.dy;
    best=Math.min(best,dx*dx+dy*dy);
  }
  return best;
}
export function shoreDistance(x,y,level){
  const {segments,tree}=shoreSegments(shoreLine(level));
  return Math.sqrt(nearestSegment(x,y,tree,segments,Infinity));
}

export function habitatAt(x,y,level=0){
  const blocked=blockedAt(x,y),pool=!blocked&&pointInPolygon(x,y,POOL);
  const water=!blocked&&(pool||pointInPolygon(x,y,waterBoundary(level)));
  const distance=shoreDistance(x,y,level),tidal=pointInPolygon(x,y,waterBoundary(1))&&!pointInPolygon(x,y,waterBoundary(0));
  const wet=!blocked&&!water&&(tidal||distance<24);
  return {water,depth:water?(pool?.32:clamp(distance/190)):0,wet,blocked,pool,shore:!blocked&&!pool&&(tidal||distance<80),distance,tidal};
}

function validPoint(species,x,y,level){
  const h=habitatAt(x,y,level);if(h.blocked)return false;
  switch(species.habitat){
    case 'water':return h.water&&(species.kind==='shrimp'||!h.pool)&&h.depth>.045;
    case 'pool':return h.pool;
    case 'shore':return !h.pool&&(!h.water||h.depth<.18)&&h.distance<185;
    case 'beach':return !h.pool&&!h.water&&h.distance<240;
    default:return false;
  }
}
export function isHabitatValid(value,x,y,level=0,radius){
  const species=getSpecies(value);if(!species||!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(!validPoint(species,x,y,level))return false;
  const r=radius??(species.kind==='fish'?13:species.kind==='shrimp'?9:species.kind==='pool'?14:8);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;if(!validPoint(species,x+Math.cos(a)*r,y+Math.sin(a)*r,level))return false;}
  return true;
}
export function pathIsHabitatValid(species,x1,y1,x2,y2,level=0,radius){
  const steps=Math.max(1,Math.ceil(Math.hypot(x2-x1,y2-y1)/7));
  for(let i=0;i<=steps;i++){const t=i/steps;if(!isHabitatValid(species,x1+(x2-x1)*t,y1+(y2-y1)*t,level,radius))return false;}
  return true;
}
export function findHabitat(value,level=0,random=Math.random,near){
  const species=getSpecies(value);if(!species)return null;
  for(let i=0;i<250;i++){
    let x,y;
    if(species.habitat==='pool'){x=1255+random()*235;y=650+random()*150;}
    else if(near&&i<80){const r=24+i*5,a=random()*Math.PI*2;x=near.x+Math.cos(a)*r;y=near.y+Math.sin(a)*r;}
    else if(species.habitat==='shore'||species.habitat==='beach'){
      const line=shoreLine(level),index=10+Math.floor(random()*(line.length-21));
      const p=line[index],q=line[index+1],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
      const d=30+random()*(species.habitat==='beach'?155:95);x=p.x+dy/len*d;y=p.y-dx/len*d;
    }else {x=30+random()*1510;y=30+random()*820;}
    if(isHabitatValid(species,x,y,level))return {x,y};
  }
  for(let y=32;y<WORLD_HEIGHT-24;y+=23)for(let x=32;x<WORLD_WIDTH-24;x+=23)if(isHabitatValid(species,x,y,level))return{x,y};
  return null;
}
