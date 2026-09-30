/** Locate complete cats in generated atlases whose row heights are not uniform.
 * This imports/crops metadata only: no source artwork is changed.
 * NODE_PATH=/path/to/node_modules node scripts/locate-cat-action-frames.cjs [--review]
 * Re-run when a new public/assets/cats/actions-v2/<preset-id>.webp is added.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..');
const SOURCE=path.join(ROOT,'public/assets/cats/actions-v2');
const OUTPUT=path.join(ROOT,'src/themes/cats/action-source-rects.js');
const REVIEW=path.join(ROOT,'docs/cat-art-v2/atlas-source-rects');
const ALPHA_THRESHOLD=12;
const PADDING=2;
const POSES=['walk toward 1','walk toward 2','walk toward 3','walk toward 4','walk away 1','walk away 2','walk away 3','walk away 4','rest','sleep','eat','lick','groom face','groom paw','scratch','pounce'];

function components(pixels,width,height,threshold=ALPHA_THRESHOLD){
 const labels=new Int32Array(width*height),queue=new Uint32Array(width*height),found=[];let label=0;
 for(let start=0;start<labels.length;start++){
  if(labels[start]||pixels[start*4+3]<threshold)continue;
  label++;let read=0,write=1,area=0,minX=width,minY=height,maxX=-1,maxY=-1,sx=0,sy=0;queue[0]=start;labels[start]=label;
  while(read<write){const index=queue[read++],x=index%width,y=Math.floor(index/width);area++;sx+=x;sy+=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
    const next=ny*width+nx;if(!labels[next]&&pixels[next*4+3]>=threshold){labels[next]=label;queue[write++]=next;}
   }
  }
  found.push({label,area,minX,minY,maxX,maxY,cx:sx/area,cy:sy/area});
 }
 return {found,labels};
}

function locate(data,width,height){
 const {found,labels}=components(data,width,height),minimumBody=width*height*.002;
 const bodies=found.filter(c=>c.area>=minimumBody).sort((a,b)=>a.cy-b.cy);
 // Deliberately reject a merged body/missing frame rather than silently output
 // sixteen fixed cells or relabel the same drawing as a different pose.
 if(bodies.length!==16)throw new Error(`Expected 16 separate cat bodies, found ${bodies.length}. Inspect source before publishing.`);
 const rows=[];
 for(let row=0;row<4;row++){
  const group=bodies.slice(row*4,row*4+4).sort((a,b)=>a.cx-b.cx);
  if(Math.max(...group.map(c=>c.cy))-Math.min(...group.map(c=>c.cy))>height*.13)throw new Error(`Row ${row+1} has ambiguous centroids.`);
  for(let col=1;col<4;col++)if(group[col].cx-group[col-1].cx<width*.13)throw new Error(`Row ${row+1} contains overlapping column centroids.`);
  rows.push(group);
 }
 for(let row=1;row<4;row++)if(Math.min(...rows[row].map(c=>c.cy))-Math.max(...rows[row-1].map(c=>c.cy))<height*.09)throw new Error('Unclear row separation.');
 const ordered=rows.flat(),bodyLabels=new Set(ordered.map(c=>c.label));
 // Preserve detached whiskers/fur islands next to a body, without attaching a
 // neighboring full cat. Imperceptible alpha speckles never decide the bounds.
 for(const part of found){if(bodyLabels.has(part.label)||part.area<3||part.area>minimumBody)continue;
  let best=null,bestGap=Infinity;
  for(const body of ordered){const dx=Math.max(body.minX-part.maxX,part.minX-body.maxX,0),dy=Math.max(body.minY-part.maxY,part.minY-body.maxY,0),gap=Math.hypot(dx,dy);
   if(gap<bestGap){bestGap=gap;best=body;}}
  if(best&&bestGap<=5){best.minX=Math.min(best.minX,part.minX);best.minY=Math.min(best.minY,part.minY);best.maxX=Math.max(best.maxX,part.maxX);best.maxY=Math.max(best.maxY,part.maxY);}
 }
 const frames=ordered.map((c,index)=>{
  const x=Math.max(0,c.minX-PADDING),y=Math.max(0,c.minY-PADDING),right=Math.min(width,c.maxX+PADDING+1),bottom=Math.min(height,c.maxY+PADDING+1);
  return {index,pose:POSES[index],sourceRect:[x,y,right-x,bottom-y],centroid:[Math.round(c.cx*100)/100,Math.round(c.cy*100)/100],bodyArea:c.area,bodyLabel:c.label};
 });
 // Count crop contamination for QA. Runtime retains the dominant alpha body
 // when an adjacent cat's extremity falls inside this rectangular crop.
 for(const frame of frames){const [x,y,w,h]=frame.sourceRect;let neighborAlpha=0;
  for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){const label=labels[py*width+px];if(bodyLabels.has(label)&&label!==frame.bodyLabel)neighborAlpha++;}
  frame.neighborAlpha=neighborAlpha;
 }
 return frames;
}

async function contactSheet(id,file,frames){
 const size=220,gap=12,label=30,canvasW=4*(size+gap)+gap,canvasH=4*(size+label+gap)+gap,composite=[];
 for(const f of frames){const [left,top,width,height]=f.sourceRect;const input=await sharp(file).extract({left,top,width,height}).resize(size,size,{fit:'contain',background:'#dce9e2'}).flatten({background:'#dce9e2'}).png().toBuffer();const x=gap+(f.index%4)*(size+gap),y=gap+Math.floor(f.index/4)*(size+label+gap);composite.push({input,left:x,top:y});
  const title=`${String(f.index).padStart(2,'0')} ${f.pose} · ${width}x${height}`;const text=Buffer.from(`<svg width="${size}" height="${label}" xmlns="http://www.w3.org/2000/svg"><text x="2" y="20" font-size="13" fill="#244539" font-family="Arial">${title}</text></svg>`);composite.push({input:text,left:x,top:y+size});
 }
 await sharp({create:{width:canvasW,height:canvasH,channels:3,background:'#f5f4e9'}}).composite(composite).png().toFile(path.join(REVIEW,`${id}.png`));
}
async function main(){
 const review=process.argv.includes('--review'),files=(await fs.readdir(SOURCE)).filter(f=>f.endsWith('.webp')).sort(),all={},report=[];
 if(!files.length)throw new Error('No action atlases found.');if(review)await fs.mkdir(REVIEW,{recursive:true});
 for(const file of files){const id=file.slice(0,-5),filename=path.join(SOURCE,file),{data,info}=await sharp(filename).ensureAlpha().raw().toBuffer({resolveWithObject:true});const frames=locate(data,info.width,info.height);
  all[id]={sourceRects:frames.map(f=>f.sourceRect),sourceSize:[info.width,info.height]};report.push({id,sourceSize:[info.width,info.height],alphaThreshold:ALPHA_THRESHOLD,padding:PADDING,frames:frames.map(({bodyLabel,...f})=>f)});
  if(review)await contactSheet(id,filename,frames);
  console.log(`${id}: 16 complete bodies; max frame ${Math.max(...frames.map(f=>f.sourceRect[2]))}×${Math.max(...frames.map(f=>f.sourceRect[3]))}; ${frames.filter(f=>f.neighborAlpha).length} crops need runtime neighbor cleanup`);
 }
 const lines=Object.entries(all).map(([id,value])=>`  ${JSON.stringify(id)}: ${JSON.stringify(value)},`);
 const source=`/** Generated by scripts/locate-cat-action-frames.cjs.\n * Absolute source pixels; complete alpha components, not a fixed cell grid.\n * Re-run after adding an atlas. Original artwork is never modified.\n */\nexport const CAT_SOURCE_RECTS = Object.freeze({\n${lines.join('\n')}\n});\n`;
 await fs.writeFile(`${OUTPUT}.tmp`,source);await fs.rename(`${OUTPUT}.tmp`,OUTPUT);
 if(review)await fs.writeFile(path.join(REVIEW,'validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`Updated ${path.relative(ROOT,OUTPUT)} with ${files.length} atlases.`);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={components,locate};
