const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const profile=fs.mkdtempSync(path.join(out,'weather-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/engine/pond.js'));const {PondEngine}=await import(url||'/src/engine/pond.js');const render=PondEngine.prototype.render;PondEngine.prototype.render=function(...args){window.testEngine=this;return render.apply(this,args)}});
 await page.waitForFunction(()=>window.testEngine?.landscape.ready&&document.querySelector('.living-background').style.opacity==='1');
 async function weather(name){await page.getByRole('button',{name:'打开天气设置',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click()}
 await page.getByRole('button',{name:'打开天气设置',exact:true}).click();assert.equal(await page.locator('.weather-choices button').count(),5);assert.equal(await page.getByRole('button',{name:'薄雾',exact:true}).count(),0);await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await weather('多云');await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,'cloud-reflections.png')});
 await page.evaluate(()=>window.testEngine.updateOptions({paused:true}));
 const moving=await page.evaluate(()=>{const e=window.testEngine,l=e.landscape,g=l.gl;function pixels(){const p=new Uint8Array(64*64*4);g.readPixels(0,Math.round(l.canvas.height*.4),64,64,g.RGBA,g.UNSIGNED_BYTE,p);return p}l.render(0,e.options,e.sim.hand);const a=pixels();l.render(4,e.options,e.sim.hand);const b=pixels();return a.filter((v,i)=>v!==b[i]).length});assert.ok(moving>10,'shoreline art moves');
 await page.evaluate(()=>window.testEngine.updateOptions({paused:false}));
 await weather('细雨');await page.waitForFunction(()=>window.testEngine.atmosphere.rainHits>80);await page.screenshot({path:path.join(out,'rain-impacts.png')});
 const rain=await page.evaluate(()=>window.testEngine.getStats().scenery);assert.ok(rain.rainHits>80);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-ambient="rain"]').currentTime>.5&&document.querySelector('[data-ambient="rain"]').volume>.06);
 const rainMix=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('audio')].map(a=>[a.dataset.ambient,{volume:a.volume,time:a.currentTime,paused:a.paused,duration:a.duration,loop:a.loop}])));
 assert.ok(rainMix.rain.volume>rainMix.stream.volume);assert.equal(rainMix.thunder.paused,true);
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();await weather('雷雨');
 await page.waitForFunction(()=>!document.querySelector('[data-ambient="thunder"]').paused&&document.querySelector('[data-ambient="thunder"]').volume>0&&document.querySelector('[data-ambient="thunder"]').currentTime>.2,{},{timeout:23000});
 const thunder=await page.evaluate(()=>({time:document.querySelector('[data-ambient="thunder"]').currentTime,volume:document.querySelector('[data-ambient="thunder"]').volume,flash:window.testEngine.atmosphere.flash}));
 await page.screenshot({path:path.join(out,'thunderstorm.png')});
 await weather('晴天');await page.waitForFunction(()=>document.querySelector('[data-ambient="rain"]').paused&&document.querySelector('[data-ambient="thunder"]').paused);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.paused&&a.volume<.001));
 for(let i=0;i<3;i++){await page.getByText('治愈流水声',{exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click()}await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.paused&&a.volume<.001));
 await page.getByRole('slider',{name:'原生锦鲤数量'}).press('End');await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 // Genuine context loss must reveal the CSS art, then restore the animated layer.
 await page.evaluate(()=>{window.glLoss=window.testEngine.landscape.gl.getExtension('WEBGL_lose_context');window.glLoss.loseContext()});await page.waitForFunction(()=>document.querySelector('.living-background').style.opacity==='0');await page.evaluate(()=>window.glLoss.restoreContext());await page.waitForFunction(()=>document.querySelector('.living-background').style.opacity==='1');
 await weather('雷雨');await page.evaluate(()=>window.pondDesktop.setDesktopMode(true));await page.waitForFunction(()=>window.testEngine.options.desktopMode&&document.querySelector('.pond-canvas').width>=3840);
 async function measure(name){await page.waitForTimeout(1000);const result=await page.evaluate(()=>new Promise(resolve=>{const times=[];let start=0,previous=0;function sample(t){if(!start)start=t;if(previous)times.push(t-previous);previous=t;if(t-start<6000)requestAnimationFrame(sample);else{times.sort((a,b)=>a-b);resolve({...window.testEngine.getStats(),rafFPS:times.length*1000/(t-start),p95:times[Math.floor(times.length*.95)],slow:times.filter(t=>t>33.5).length})}}requestAnimationFrame(sample)}));console.log(JSON.stringify({name,...result}));return{name,...result}}
 const performance=[await measure('4k-storm-24-fish')],cdp=await page.context().newCDPSession(page);
 for(const [name,width,height] of [['5k',2560,1440],['6k',3072,1728]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});await page.waitForFunction(w=>document.querySelector('.pond-canvas').width===w,width*2);performance.push(await measure(name+'-storm-24-fish'))}
 assert.ok(performance.every(p=>p.rafFPS>=50&&p.fps>=50),'frame budget');assert.deepEqual(errors,[]);
 const result={result:'PASS',rain,rainMix,thunder,moving,performance,errors};fs.writeFileSync(path.join(out,'weather-1.3.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
