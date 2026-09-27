const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 fs.mkdirSync(path.join(root,'work'),{recursive:true});
 const profile=fs.mkdtempSync(path.join(root,'work','interaction-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
 const page=await app.firstWindow();await page.waitForSelector('.pond-canvas');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{
 const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/engine/pond.js'));const {PondEngine}=await import(url||'/src/engine/pond.js');const render=PondEngine.prototype.render;PondEngine.prototype.render=function(...args){window.testEngine=this;return render.apply(this,args)}});
 await page.waitForFunction(()=>window.testEngine);
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByText('治愈流水声',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('audio').currentTime>.5);
 let sound=await page.evaluate(()=>{const a=document.querySelector('audio');return{duration:a.duration,loop:a.loop,paused:a.paused,currentTime:a.currentTime,src:a.currentSrc}});
 assert.ok(Math.abs(sound.duration-120)<.1);assert.equal(sound.loop,true);assert.equal(sound.paused,false);
 await page.getByRole('slider',{name:'环境音量'}).press('Home');for(let i=0;i<16;i++) await page.getByRole('slider',{name:'环境音量'}).press('ArrowRight');
 await page.waitForFunction(async()=>{const {ambientMix}=await import('/src/audio/ambient.js');const s=JSON.parse(localStorage.getItem('fusheng-settings'));const e=window.testEngine.options;return Math.abs(document.querySelector('audio').volume-.32*ambientMix(e.weather,e.season,e.night).stream)<.001});
 await page.evaluate(()=>document.querySelector('audio').currentTime=56.8);
 await page.waitForFunction(()=>document.querySelector('audio').currentTime<2&&!document.querySelector('audio').paused);
 sound.loopBoundaryPassed=true;
 await page.getByText('治愈流水声',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('audio').paused&&document.querySelector('audio').volume<.01);
 for(let i=0;i<3;i++){await page.getByText('治愈流水声',{exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click()}
 await page.waitForFunction(()=>document.querySelector('audio').paused&&document.querySelector('audio').volume<.01);
 sound.rapidToggleStopped=true;
 await page.getByRole('slider',{name:'原生锦鲤数量'}).press('End');
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await page.evaluate(()=>window.testEngine.updateOptions({fishCount:24,season:'autumn',weather:'sunny',quality:'high'}));
 await page.mouse.click(850,450);
 assert.ok(await page.evaluate(()=>window.testEngine.sim.food.length>0));
 const feed=await page.evaluate(()=>{const e=window.testEngine;return{food:e.sim.food.length,handLife:e.sim.hand.life}});
 await page.evaluate(()=>window.pondDesktop.setDesktopMode(true));
 await page.waitForFunction(()=>window.testEngine.options.desktopMode&&document.querySelector('.pond-canvas').width>=3840);
 async function measure(name){const result=await page.evaluate(()=>new Promise(resolve=>{const times=[];let start=0,previous=0;function sample(t){if(!start)start=t;if(previous)times.push(t-previous);previous=t;if(t-start<5000)requestAnimationFrame(sample);else {times.sort((a,b)=>a-b);resolve({...window.testEngine.getStats(),rafFPS:times.length*1000/(t-start),p95:times[Math.floor(times.length*.95)],slow:times.filter(t=>t>33.5).length})}}requestAnimationFrame(sample)}));console.log(JSON.stringify({name,...result}));return{name,...result}}
 const performance=[await measure('native-desktop-super-sampling')];
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:2560,height:1440,deviceScaleFactor:2,mobile:false});
 await page.waitForFunction(()=>document.querySelector('.pond-canvas').width===5120);
 performance.push(await measure('5k-desktop'));
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:3072,height:1728,deviceScaleFactor:2,mobile:false});
 await page.waitForFunction(()=>document.querySelector('.pond-canvas').width===6144);
 performance.push(await measure('6k-desktop'));
 assert.ok(performance.every(p=>p.fps>=50));assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'work','interaction-1.2.json'),JSON.stringify({result:'PASS',sound,feed,performance,errors},null,2));
 console.log(JSON.stringify({result:'PASS',sound,feed,errors}));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
