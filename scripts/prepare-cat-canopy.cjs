// Offline extraction from the existing paintings. No generated/repositioned tree.
const fs=require('node:fs'),path=require('node:path');
const sharp=require('/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public/assets/cats/canopy-v1'),qa=path.resolve(root,'../../work/cats/canopy-2.8');
const W=1920,H=1080,CW=1028,CH=432;
const paths={spring:'art-v3/courtyard-sakura.webp',summer:'courtyard-1920.webp',autumn:'art-v2/courtyard-autumn.webp',winter:'art-v2/courtyard-winter.webp'};
const envelope=[[0,0],[.483,0],[.481,.078],[.429,.092],[.432,.155],[.402,.176],[.453,.256],[.422,.282],[.377,.252],[.346,.254],[.328,.283],[.306,.248],[.274,.263],[.265,.315],[.241,.326],[.239,.359],[.187,.353],[.171,.283],[.113,.291],[.080,.337],[0,.373]];
const springEnvelope=[[0,0],[.487,0],[.486,.060],[.420,.063],[.406,.118],[.400,.150],[.430,.187],[.432,.239],[.448,.260],[.416,.278],[.374,.258],[.347,.271],[.311,.249],[.281,.245],[.263,.280],[.247,.325],[.231,.357],[.185,.359],[.177,.293],[.126,.270],[.080,.303],[0,.373]];
const winterBranches=[
 {w:.018,p:[[0,.36],[.049,.228],[.088,.141],[.13,.067],[.21,0]]},
 {w:.012,p:[[.070,.172],[.133,.115],[.154,.073],[.210,.034],[.275,.017],[.333,0]]},
 {w:.008,p:[[.115,.13],[.193,.102],[.226,.08],[.276,.113],[.324,.161],[.372,.205],[.431,.25]]},
 {w:.006,p:[[.216,.033],[.235,.093],[.248,.16],[.266,.208],[.281,.272]]},
 {w:.008,p:[[.133,.150],[.171,.19],[.197,.218],[.224,.259],[.263,.297]]},
 {w:.007,p:[[.11,.163],[.146,.209],[.180,.230],[.207,.283],[.238,.320]]},
 {w:.006,p:[[.194,.199],[.221,.217],[.245,.211],[.282,.22],[.322,.24],[.345,.259]]},
 {w:.005,p:[[.243,.130],[.276,.142],[.300,.128],[.325,.093],[.355,.068]]},
 {w:.003,p:[[.323,.174],[.352,.173],[.384,.151],[.401,.151]]},
 {w:.003,p:[[.276,.142],[.295,.163],[.340,.176],[.374,.159]]},
 {w:.003,p:[[.27,.208],[.293,.231],[.312,.280],[.332,.295]]},
 {w:.003,p:[[.163,.169],[.188,.156],[.213,.147],[.228,.128]]},
];
function inside(x,y,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit}return hit}
function lineDist(x,y,a,b){const dx=b[0]-a[0],dy=(b[1]-a[1])*.5625,vx=x-a[0],vy=(y-a[1])*.5625,t=Math.max(0,Math.min(1,(vx*dx+vy*dy)/(dx*dx+dy*dy)));return Math.hypot(vx-t*dx,vy-t*dy)}
function nearBranch(x,y){return winterBranches.some(({w,p})=>p.slice(1).some((b,i)=>lineDist(x,y,p[i],b)<w/2))}
const clamp=v=>Math.max(0,Math.min(1,v));
(async()=>{fs.mkdirSync(out,{recursive:true});fs.mkdirSync(qa,{recursive:true});const metrics={};for(const [season,file]of Object.entries(paths)){
 const source=await sharp(path.join(root,'public/assets/cats',file)).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer(),rgba=Buffer.alloc(CW*CH*4);let pixels=0;
 for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
  const u=x/W,v=y/H;if(!inside(u,v,season==='spring'?springEnvelope:envelope))continue;
  const i=(y*W+x)*4,r=source[i],g=source[i+1],b=source[i+2],j=(y*CW+x)*4;
  let confidence=0;
  if(season==='summer')confidence=clamp((g-b-24)/22)*clamp((g-r+44)/20);
  if(season==='autumn')confidence=clamp((r-b-39)/24)*clamp((g-b-22)/22)*clamp((r-g-1)/13);
  if(season==='spring'){
   const pink=clamp((r-g-6)/10)*clamp((b-g+4)/10),white=clamp((Math.min(r,g,b)-199)/20)*clamp((b-g+13)/12)*clamp((r-g+7)/12),green=clamp((g-b-29)/21)*clamp((g-r+42)/20);
   confidence=Math.max(pink,white,green);
   if(inside(u,v,[[.254,.249],[.284,.251],[.30,.273],[.284,.283],[.27,.278]]))confidence=0;
  }
  if(season==='winter'&&nearBranch(u,v))confidence=Math.max(clamp((Math.min(r,g,b)-192)/30)*clamp((b-g+8)/9),clamp((r-b-16)/15)*clamp((175-r)/30));
  // The trunk is far outside the walking region. Branches use narrow traced
  // support, not the broad canopy hull; floor shadows remain transparent.
  if(season!=='winter'&&nearBranch(u,v)&&r<174&&g<160&&b<135&&r>b+8)confidence=Math.max(confidence,.9);
  if(confidence>0){rgba[j]=rgba[j+1]=rgba[j+2]=255;rgba[j+3]=confidence>.30?255:Math.round(confidence*170);if(confidence>.30)pixels++}
 }
 if(season==='winter'){
  // Recover the actual twig paint, then grow only into adjacent cool snow.
  // This avoids cutting a branch into chips when the hand-traced support is
  // slightly narrower than its snowy rim. Warm paving cannot seed the mask.
  const brown=new Uint8Array(CW*CH),integral=new Uint32Array((CW+1)*(CH+1));
  for(let y=0;y<CH;y++){let row=0;for(let x=0;x<CW;x++){const i=(y*W+x)*4,r=source[i],g=source[i+1],b=source[i+2];brown[y*CW+x]=inside(x/W,y/H,envelope)&&r>g+6&&r>b+16&&r<182&&g<157?1:0;row+=brown[y*CW+x];integral[(y+1)*(CW+1)+x+1]=row+integral[y*(CW+1)+x+1]}}
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
   if(!inside(x/W,y/H,envelope))continue;const i=(y*W+x)*4,r=source[i],g=source[i+1],b=source[i+2],j=(y*CW+x)*4;
   const x0=Math.max(0,x-9),y0=Math.max(0,y-9),x1=Math.min(CW,x+10),y1=Math.min(CH,y+10),near=integral[y1*(CW+1)+x1]-integral[y0*(CW+1)+x1]-integral[y1*(CW+1)+x0]+integral[y0*(CW+1)+x0];
   if(brown[y*CW+x]||(near>0&&Math.min(r,g,b)>186&&b>g-3&&r<g+24)){rgba[j]=rgba[j+1]=rgba[j+2]=255;rgba[j+3]=255}
  }
 }
 // Flower centres and dark leaf veins belong to the leaf; fill only tiny
 // enclosed pinholes, never open gaps between branches or paving islands.
 const seen=new Uint8Array(CW*CH);for(let sy=0;sy<CH;sy++)for(let sx=0;sx<CW;sx++){const start=sy*CW+sx;if(seen[start]||rgba[start*4+3]>=100)continue;const todo=[start],group=[];seen[start]=1;let edge=false;for(let qi=0;qi<todo.length;qi++){const a=todo[qi],x=a%CW,y=Math.floor(a/CW);group.push(a);if(x===0||y===0||x===CW-1||y===CH-1)edge=true;for(const b of [x>0?a-1:-1,x<CW-1?a+1:-1,y>0?a-CW:-1,y<CH-1?a+CW:-1])if(b>=0&&!seen[b]&&rgba[b*4+3]<100){seen[b]=1;todo.push(b)}}if(!edge&&group.length<42)for(const a of group){rgba[a*4]=rgba[a*4+1]=rgba[a*4+2]=255;rgba[a*4+3]=255}}
 pixels=0;let edgePixels=0;for(let i=0;i<CW*CH;i++){if(rgba[i*4+3]>127)pixels++;if((i%CW>=CW-12||Math.floor(i/CW)>=CH-12)&&rgba[i*4+3]>0)edgePixels++}
 const raw={raw:{width:CW,height:CH,channels:4}};
 await sharp(rgba,raw).webp({lossless:true}).toFile(path.join(out,season+'-mask.webp'));
 const cropped=await sharp(path.join(root,'public/assets/cats',file)).resize(W,H,{fit:'fill'}).extract({left:0,top:0,width:CW,height:CH}).ensureAlpha().raw().toBuffer();for(let i=0;i<rgba.length;i+=4)cropped[i+3]=rgba[i+3];await sharp(cropped,raw).png().toFile(path.join(qa,season+'-foreground.png'));
 const bg={create:{width:CW,height:CH,channels:4,background:'#ba83bd'}};await sharp(bg).composite([{input:await sharp(cropped,raw).png().toBuffer()}]).png().toFile(path.join(qa,season+'-matte-review.png'));
 metrics[season]={width:CW,height:CH,opaquePixels:pixels,coverage:pixels/(CW*CH),edgePixels,bytes:fs.statSync(path.join(out,season+'-mask.webp')).size};
 }fs.writeFileSync(path.join(qa,'canopy-metrics.json'),JSON.stringify(metrics,null,2));console.log(metrics)})();
