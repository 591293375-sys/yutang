'use strict';
// Tests the real browser Canvas pipeline using an isolated Electron profile.
const {_electron}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work/cats/v2.7');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'cat-action-eyes-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,'--user-data-dir='+profile],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
  const page=await app.firstWindow();await page.waitForSelector('.pond-canvas');const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await page.evaluate(async()=>{
   const {CAT_PRESETS}=await import('/src/themes/cats/catalog.js'),{loadActionAtlas}=await import('/src/themes/cats/animation.js'),{customizeActionFrame,catLandmarks}=await import('/src/themes/cats/morphology.js');
   const report={frames:[],color:'#acaed0',alphaChanged:0,outsideChanged:0,visibleUnchanged:0,closedChanged:0},sheet=document.createElement('canvas');sheet.width=1440;sheet.height=1120;const sc=sheet.getContext('2d');sc.fillStyle='#eeefe6';sc.fillRect(0,0,sheet.width,sheet.height);
   function face(source,frame,eyes,x,y){
    const cx=eyes.reduce((s,e)=>s+e.x,0)/eyes.length,cy=eyes.reduce((s,e)=>s+e.y,0)/eyes.length;
    const rx=(eyes[1].x-eyes[0].x)*1.22,ry=rx*.78,px=(cx-rx-frame.bounds[0])*frame.cellWidth,py=(cy-ry-frame.bounds[1])*frame.cellHeight;
    sc.drawImage(source,px,py,rx*2*frame.cellWidth,ry*2*frame.cellHeight,x,y,164,128);
   }
   for(let p=0;p<CAT_PRESETS.length;p++){
    const preset=CAT_PRESETS[p],atlas=await loadActionAtlas(preset,{version:1,strokes:[]});
    for(const frame of atlas.frames){
     const custom=customizeActionFrame(frame,preset,{eyeColor:report.color}),baseline=document.createElement('canvas');baseline.width=custom.image.width;baseline.height=custom.image.height;
     const bc=baseline.getContext('2d',{willReadFrequently:true}),offsetX=Math.round((frame.bounds[0]-custom.bounds[0])*frame.cellWidth),offsetY=Math.round((frame.bounds[1]-custom.bounds[1])*frame.cellHeight);bc.drawImage(frame.image,offsetX,offsetY);
     const a=bc.getImageData(0,0,baseline.width,baseline.height).data,b=custom.image.getContext('2d').getImageData(0,0,baseline.width,baseline.height).data,eyes=catLandmarks(preset,frame).eyes;
     let alphaChanged=0,rgbChanged=0,outsideChanged=0,perEye=eyes.map(()=>0);
     for(let y=0;y<baseline.height;y++)for(let x=0;x<baseline.width;x++){
      const i=(y*baseline.width+x)*4;if(a[i+3]!==b[i+3])alphaChanged++;
      if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2])continue;rgbChanged++;
      const q={x:custom.bounds[0]+(x+.5)/baseline.width*custom.bounds[2],y:custom.bounds[1]+(y+.5)/baseline.height*custom.bounds[3]};
      const hits=eyes.map(e=>((q.x-e.x)/e.rx)**2+((q.y-e.y)/e.ry)**2<=1+1e-8);if(!hits.some(Boolean))outsideChanged++;hits.forEach((hit,k)=>{if(hit)perEye[k]++});
     }
     const row={id:preset.id,index:frame.index,visibleEyes:eyes.length,alphaChanged,rgbChanged,outsideChanged,perEye};report.frames.push(row);report.alphaChanged+=alphaChanged;report.outsideChanged+=outsideChanged;if(eyes.length&&!perEye.every(n=>n>3))report.visibleUnchanged++;if(!eyes.length&&rgbChanged)report.closedChanged++;
     if(frame.index===0){const x=(p%4)*360,y=Math.floor(p/4)*280;sc.fillStyle='#263e34';sc.font='16px sans-serif';sc.fillText(preset.name,x+12,y+22);face(frame.image,frame,eyes,x+10,y+42);face(custom.image,custom,eyes,x+182,y+42);sc.font='13px sans-serif';sc.fillText('原图',x+70,y+196);sc.fillText('仅更改眼色',x+225,y+196);sc.fillText(preset.id,x+12,y+228);sc.fillText('0 alpha / 0 pixels outside irises',x+12,y+249);}
    }
   }
   return {...report,image:sheet.toDataURL('image/png')};
  });
  fs.writeFileSync(path.join(out,'action-eye-16-before-after.png'),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;result.errors=errors;result.result=result.frames.length===256&&!result.alphaChanged&&!result.outsideChanged&&!result.visibleUnchanged&&!result.closedChanged&&!errors.length?'PASS':'FAIL';fs.writeFileSync(path.join(out,'action-eye-256-validation.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({result:result.result,frames:result.frames.length,alphaChanged:result.alphaChanged,outsideChanged:result.outsideChanged,visibleUnchanged:result.visibleUnchanged,closedChanged:result.closedChanged,errors},null,2));assert.equal(result.result,'PASS');
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
