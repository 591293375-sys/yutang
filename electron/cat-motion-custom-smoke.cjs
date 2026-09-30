'use strict';
const {_electron}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work/cats/actions-v3');
(async()=>{fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(out,'custom-motion-profile-')),app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,'--user-data-dir='+profile],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});try{
 const page=await app.firstWindow();await page.waitForSelector('.pond-canvas');
 const result=await page.evaluate(async()=>{
 const {loadActionAtlas,drawActionFrame}=await import('/src/themes/cats/animation.js'),{getPreset}=await import('/src/themes/cats/catalog.js'),{customizeActionFrame,catLandmarks}=await import('/src/themes/cats/morphology.js');
 const settings={version:1,size:1.25,build:1.2,earSize:1.25,earShape:'pointed',eyeColor:'#799b70'},canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1000;const c=canvas.getContext('2d');c.fillStyle='#e9e8d5';c.fillRect(0,0,1440,1000);const report=[];
 for(const [row,id]of['ragdoll','british-shorthair'].entries()){
 const preset=getPreset(id),blank={version:1,strokes:[]},base=await loadActionAtlas(preset,blank),custom=await loadActionAtlas(preset,blank,{key:JSON.stringify(settings),transformFrame:f=>customizeActionFrame(f,preset,settings)});
 for(const [col,[index,modified]]of[[0,false],[0,true],[8,false],[8,true]].entries()){
 const atlas=modified?custom:base,frame=atlas.frames[index];c.save();c.translate(col*360+180,row*500+242);drawActionFrame(c,frame,atlas,205*(modified?1.25:1),index===0?'walkToward':'rest',.4,{mesh:true,gaitPhase:.3,strideStrength:.8});c.restore();
 const h=frame.parts.head,b=frame.bounds,sx=(h[0]-b[0])*frame.cellWidth,sy=(h[1]-b[1])*frame.cellHeight,sw=h[2]*frame.cellWidth,sh=h[3]*frame.cellHeight;c.drawImage(frame.image,sx,sy,sw,sh,col*360+80,row*500+275,200,200*sh/sw);
 c.fillStyle='#314a38';c.font='17px sans-serif';c.fillText(`${id} ${index===0?'walk':'loaf'} ${modified?'custom':'original'}`,col*360+12,row*500+484);
 report.push({id,index,modified,eyeLandmarks:catLandmarks(preset,frame).eyes,bounds:frame.bounds});
 }
 }
 return{image:canvas.toDataURL('image/png'),settings,report};
 });fs.writeFileSync(path.join(out,'custom-walk-loaf-inspection.png'),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});
 await page.addInitScript(settings=>{if(sessionStorage.getItem('custom-gait'))return;sessionStorage.setItem('custom-gait','1');localStorage.setItem('mofish-theme',JSON.stringify('cats'));localStorage.setItem('fusheng-settings',JSON.stringify({sound:false,quality:'high',reducedMotion:false}));localStorage.setItem('mofish-cats-v1',JSON.stringify({version:1,cats:[{id:'custom-motion-cat',presetId:'ragdoll',name:'动作与外观验证',personality:'active',active:true,x:.55,y:.60,customization:settings,appearance:{version:1,strokes:[]}}],props:[],environment:{season:'summer',time:'day',particles:false,fireflies:false},nextId:80}));},result.settings);
 await page.reload();await page.waitForSelector('.cat-canvas');await page.evaluate(async()=>{
 const resource=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>new URL(n).pathname==='/src/themes/cats/renderer.js').at(-1),{CatRenderer}=await import(resource||'/src/themes/cats/renderer.js'),original=CatRenderer.prototype.render;
 const qa=window.customGaitQA={ready:false,samples:[],last:0,active:false},sheet=document.createElement('canvas');sheet.width=256*8;sheet.height=306;qa.sheet=sheet;
 CatRenderer.prototype.render=function(game,...args){original.call(this,game,...args);qa.ready=this.stats().actionAtlases===1;const cat=game.cats[0],pose=this.animation.cats.get(cat.id)?.last;
 if(!qa.active||!pose?.action.startsWith('walk')||qa.samples.length>=8||performance.now()-qa.last<145)return;
 const p=this.point(cat),ctx=sheet.getContext('2d'),index=qa.samples.length,source=[(p.x-128)*this.scale,(p.y-230)*this.scale,256*this.scale,256*this.scale];ctx.drawImage(this.bgCanvas,...source,index*256,0,256,256);ctx.drawImage(this.canvas,...source,index*256,0,256,256);ctx.fillStyle='#e9e8d5';ctx.fillRect(index*256,256,256,50);ctx.fillStyle='#314a38';ctx.font='15px sans-serif';ctx.fillText(`帧 ${pose.index} · 步相 ${pose.gaitPhase.toFixed(2)}`,index*256+12,280);
 qa.samples.push({frame:pose.index,phase:pose.gaitPhase,mix:pose.mix,at:performance.now(),x:cat.x,y:cat.y,speed:cat.speed});qa.last=performance.now();};
 });await page.waitForFunction(()=>customGaitQA.ready);await page.getByRole('button',{name:'猫咪',exact:true}).click();await page.getByRole('button',{name:'让动作与外观验证回窝休息',exact:true}).click();await page.evaluate(()=>customGaitQA.active=true);await page.waitForFunction(()=>customGaitQA.samples.length===8);await page.screenshot({path:path.join(out,'custom-cat-walking-4k.png')});
 const captured=await page.evaluate(()=>({samples:customGaitQA.samples,image:customGaitQA.sheet.toDataURL('image/png')}));assert.equal(captured.samples.length,8);assert.ok(new Set(captured.samples.map(s=>s.frame)).size>=3);fs.writeFileSync(path.join(out,'custom-cat-gait-filmstrip.png'),Buffer.from(captured.image.split(',')[1],'base64'));result.gaitSamples=captured.samples;result.result='PASS';fs.writeFileSync(path.join(out,'custom-motion.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',samples:captured.samples,output:out},null,2));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
