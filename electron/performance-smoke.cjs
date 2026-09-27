const {_electron}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 fs.mkdirSync(path.join(root,'work'),{recursive:true});
 const profile=fs.mkdtempSync(path.join(root,'work','perf-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
 const page=await app.firstWindow();await page.waitForSelector('.pond-canvas');
 const gpu=await app.evaluate(({app,screen})=>({gpu:app.getGPUFeatureStatus(),display:screen.getPrimaryDisplay()}));
 console.log(JSON.stringify({gpu}));
 const client=await page.context().newCDPSession(page);
 await client.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Isolate the owned renderer while retaining the actual app's full compositing stack.
 await page.evaluate(async()=>{
 fs.mkdirSync(path.join(root,'work'),{recursive:true});const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/engine/pond.js'));const m=await import(url||'/src/engine/pond.js');const proto=m.PondEngine.prototype;window.originalRender=proto.render;proto.render=function(...args){window.benchEngine=this;return window.originalRender.apply(this,args)}});
 await page.waitForFunction(()=>window.benchEngine);
 await page.evaluate(()=>{window.benchEngine.updateOptions({season:'autumn',weather:'sunny',night:false,fishCount:24,quality:'high'});});
 async function measure(name){const metrics=await page.evaluate(()=>new Promise(resolve=>{const samples=[],cpu=[];let prev=0,start=0;const e=window.benchEngine,render=e.render; e.render=function(...args){const t=performance.now();const r=render.apply(this,args);cpu.push(performance.now()-t);return r};function frame(t){if(!start)start=t;if(prev)samples.push(t-prev);prev=t;if(t-start<5000)requestAnimationFrame(frame);else {e.render=render;samples.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);resolve({frames:samples.length,renderFPS:cpu.length*1000/(t-start),fps:samples.length*1000/(t-start),p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],over33ms:samples.filter(x=>x>33.5).length,drawP95:cpu[Math.floor(cpu.length*.95)],pixels:[e.canvas.width,e.canvas.height]})}}requestAnimationFrame(frame)}));console.log(JSON.stringify({name,...metrics}));return{name,...metrics}}
 await page.waitForTimeout(1500);const results=[await measure('autumn-sunny-24fish')];
 if(process.argv.includes('--matrix')){
  const cases=[['spring','rainy',false],['summer','sunny',true],['winter','snowy',false],['autumn','foggy',false]];
  for(const [season,weather,night] of cases){
   await page.evaluate(({season,weather,night})=>{window.benchEngine.updateOptions({season,weather,night});document.querySelector('.app').className=`app season-${season} ${night?'night':'day'} weather-${weather}`},{season,weather,night});
   await page.waitForTimeout(1000);results.push(await measure(`${season}-${weather}-${night?'night':'day'}-24fish`));
  }
  await page.evaluate(()=>{const c=document.createElement('canvas');c.width=512;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle='#f0d58e';ctx.beginPath();ctx.ellipse(256,96,160,42,0,0,Math.PI*2);ctx.fill();const texture=c.toDataURL();window.benchEngine.setCustomFish(Array.from({length:12},(_,i)=>({id:'perf-'+i,name:'test',texture})));window.benchEngine.feed(960,540)});
  await page.waitForTimeout(1000);results.push(await measure('foggy-36fish-with-feeding'));
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.waitForTimeout(1000);results.push(await measure('settings-open-36fish'));
  await page.evaluate(()=>window.benchEngine.updateOptions({quality:'low'}));
  await page.waitForTimeout(1000);results.push(await measure('energy-saving-36fish'));
 }

 if(process.argv.includes('--ablate')){
  await page.evaluate(()=>{const e=window.benchEngine; e.origFish=e.drawFish;e.drawFish=function(f,shadow){if(!shadow)this.origFish(f,false)}});results.push(await measure('without-fish-blur'));
  await page.addStyleTag({content:'*{backdrop-filter:none!important}.pond-background{filter:none!important;transition:none!important}'});results.push(await measure('without-fish-blur-and-css-filters'));
 }
 fs.writeFileSync(path.join(root,'work',process.argv.includes('--ablate')?'performance-before.json':process.argv.includes('--matrix')?'performance-matrix.json':'performance-after.json'),JSON.stringify({gpu,results,errors},null,2));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
