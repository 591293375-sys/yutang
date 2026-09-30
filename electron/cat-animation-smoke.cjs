'use strict';
const {_electron}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work/cats/actions-v2'),selection=process.argv[2]||'ragdoll';
(async()=>{fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(out,'profile-'));const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,'--user-data-dir='+profile],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});try{
 const page=await app.firstWindow();await page.waitForSelector('.pond-canvas');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ids=await page.evaluate(async selection=>selection==='--all'?Object.keys((await import('/src/themes/cats/actions-manifest.js')).CAT_ACTION_ATLASES):[selection],selection),reports=[];
 for(const presetId of ids){
 const result=await page.evaluate(async presetId=>{
  const {loadActionAtlas,drawActionFrame,CAT_ACTION_CLIPS}=await import('/src/themes/cats/animation.js'),{getPreset}=await import('/src/themes/cats/catalog.js');
  const preset=getPreset(presetId),blank={version:1,strokes:[]},stroke={color:'#975849',size:.10,erase:false,symmetric:false,region:'body',points:[{x:.55,y:.42},{x:.65,y:.55}]},design={version:1,strokes:[stroke]};
  const original=await loadActionAtlas(preset,blank),painted=await loadActionAtlas(preset,design),restored=await loadActionAtlas(preset,JSON.parse(JSON.stringify(design))),erased=await loadActionAtlas(preset,{version:1,strokes:[stroke,{...stroke,size:.14,erase:true}]});
  const c=document.createElement('canvas');c.width=1600;c.height=1040;const ctx=c.getContext('2d');ctx.fillStyle='#dfdeca';ctx.fillRect(0,0,c.width,c.height);const report=[];
  for(let i=0;i<16;i++){
   const frame=original.frames[i],pf=painted.frames[i],rf=restored.frames[i],ef=erased.frames[i],row=Math.floor(i/4),col=i%4;
   const action=Object.keys(CAT_ACTION_CLIPS).find(k=>CAT_ACTION_CLIPS[k].includes(i));
   const pixels=f=>f.image.getContext('2d').getImageData(0,0,f.image.width,f.image.height).data,raw=pixels(frame),color=pixels(pf),repeat=pixels(rf),rub=pixels(ef);let alphaChanges=0,colorChanges=0,repeatChanges=0,erasedChanges=0,faceChanges=0,changedTowardBlue=0;
   for(let p=0;p<raw.length;p+=4){if(raw[p+3]!==color[p+3])alphaChanges++;if(raw[p]!==color[p]||raw[p+1]!==color[p+1]||raw[p+2]!==color[p+2]){colorChanges++;const x=frame.bounds[0]+(p/4%frame.image.width+.5)/frame.cellWidth,y=frame.bounds[1]+(Math.floor(p/4/frame.image.width)+.5)/frame.cellHeight;if(frame.protectedAreas.some(a=>((x-a.x)/a.rx)**2+((y-a.y)/a.ry)**2<=1))faceChanges++;if(color[p+2]>color[p]+12&&raw[p+2]<=raw[p]+12)changedTowardBlue++;}for(let k=0;k<4;k++){if(color[p+k]!==repeat[p+k])repeatChanges++;if(raw[p+k]!==rub[p+k])erasedChanges++}}
   ctx.save();ctx.translate(col*400+200,row*260+219);ctx.strokeStyle='#aa8660';ctx.beginPath();ctx.moveTo(-165,0);ctx.lineTo(165,0);ctx.stroke();const bounds=drawActionFrame(ctx,pf,painted,190,action,1.5,{mesh:true});ctx.restore();ctx.fillStyle='#334936';ctx.font='15px sans-serif';ctx.fillText(`${i} ${action}`,col*400+15,row*260+246);
   report.push({i,action,bounds,alphaChanges,colorChanges,repeatChanges,erasedChanges,faceChanges,changedTowardBlue,anchor:frame.anchor,scale:frame.scale});
  }
  return{report,sourceLayout:original.sourceLayout,image:c.toDataURL('image/png')};
 },presetId);
 assert.equal(result.sourceLayout,'alpha-rects');for(const item of result.report){assert.equal(item.alphaChanges,0);assert.equal(item.repeatChanges,0);assert.equal(item.erasedChanges,0);assert.equal(item.faceChanges,0);assert.equal(item.changedTowardBlue,0);assert.ok(item.colorChanges>0,`${presetId}: paint follows ${item.action}`)}assert.ok(result.report[9].bounds.width<result.report[0].bounds.width*.85,`${presetId}: sleeping does not become giant`);
 fs.writeFileSync(path.join(out,presetId+'-contact.png'),Buffer.from(result.image.split(',')[1],'base64'));const report={result:'PASS',presetId,sourceLayout:result.sourceLayout,frames:result.report};fs.writeFileSync(path.join(out,presetId+'-atlas-paint.json'),JSON.stringify(report,null,2));reports.push(report);console.log(`${presetId}: 16 frames, alpha/face/pigment/erase/serialize PASS`);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'all-atlases.json'),JSON.stringify({result:'PASS',presets:reports.length,frameCount:reports.length*16,errors,results:reports},null,2));console.log(JSON.stringify({result:'PASS',presets:reports.length,frames:reports.length*16,output:out}));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
