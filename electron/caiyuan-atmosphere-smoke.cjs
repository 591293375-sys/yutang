// Actual renderer and audio playback in an isolated Electron profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('@playwright/test'),electron=require('electron');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.CAIYUAN_QA_OUTPUT||path.join(root,'test-results/caiyuan-atmosphere'));
const report={checks:[],errors:[]};
function observe(){window.cyRuntime=()=>{const node=document.querySelector('.caiyuan-stage');let f=node?.[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];for(let i=0;f&&i<30;f=f.return,i++)for(let h=f.memoizedState,j=0;h&&j<30;h=h.next,j++){const r=h.memoizedState?.current;if(r?.model&&r?.renderer)return r}return null}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync('/tmp/caiyuan-atmosphere-');let app,page;
 try{
  app=await _electron.launch({executablePath:electron,args:[root,'--user-data-dir='+profile],env:{...process.env,VITE_DEV_SERVER_URL:process.env.CAIYUAN_QA_URL||'http://127.0.0.1:5188/'}});
  page=await app.firstWindow();page.setDefaultTimeout(18000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.waitForSelector('.pond-canvas');await page.evaluate(()=>{localStorage.setItem('mofish-theme',JSON.stringify('caiyuan'));localStorage.setItem('fusheng-settings',JSON.stringify({sound:true,volume:.3,quality:'high'}))});await page.reload();await page.waitForSelector('.caiyuan-stage');await page.evaluate(observe);await page.waitForFunction(()=>cyRuntime()?.renderer.stats().loaded>=11);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1045,899);w.show();w.focus()});await page.waitForTimeout(1200);
  const capture=async name=>{await page.waitForTimeout(650);const bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(bytes,'base64'))};
  // Force deterministic phases only for a pixel comparison; the real scene keeps
  // its own single RAF loop. Compare the actual decoded art, not mock canvas calls.
  const images=await page.evaluate(()=>{
   const r=cyRuntime(),v=r.renderer,m=r.model,save=m.snapshot();m.state.items.forEach(i=>i.lit=false);m.state.settings.time='day';m.state.settings.showToad=false;m.state.settings.showLanterns=false;m.state.settings.showAtmosphere=false;v.currentNight=0;
   const copy=document.createElement('canvas');copy.width=v.canvas.width;copy.height=v.canvas.height;const read=copy.getContext('2d',{willReadFrequently:true});const render=phase=>{v.motionTime=phase;v.draw(m,{paused:true,quality:'high'},v.lastElapsed);read.clearRect(0,0,copy.width,copy.height);read.drawImage(v.canvas,0,0);return read.getImageData(0,0,copy.width,copy.height).data};
   const a=render(4),b=render(17);let cloth=0,faces=0;const t=v.t,dpr=v.dpr;
   for(let y=0;y<v.canvas.height;y++)for(let x=0;x<v.canvas.width;x++){const q=(y*v.canvas.width+x)*4;if(a[q]===b[q]&&a[q+1]===b[q+1]&&a[q+2]===b[q+2]&&a[q+3]===b[q+3])continue;const sx=(x/dpr-t.x)/t.width*1600,sy=(y/dpr-t.y)/t.height*900;if(sy<175)cloth++;if(sy>180&&sy<440&&sx>180&&sx<1420)faces++;}
   m.state=save;v.motionTime=4;return{cloth,faces};
  });assert.ok(images.cloth>1000);assert.equal(images.faces,0);report.pixels=images;report.checks.push('curtain gust changes visible cloth pixels; five faces and sign remain unchanged');
  await page.getByRole('navigation',{name:'财源广进工具栏'}).getByRole('button',{name:'上香',exact:true}).click();await page.getByRole('button',{name:'选好时间，轻点香炉',exact:true}).click();
  const burner=await page.evaluate(async()=>{const r=cyRuntime(),{bounds}=await import('/src/themes/caiyuan/geometry.js'),b=bounds(r.model.state.items[0]),t=r.renderer.t;return{x:t.x+(b.x+b.w*.5)*t.width,y:t.y+(b.y+b.h*.6)*t.height}});
  await page.mouse.click(burner.x,burner.y);assert.equal(await page.evaluate(()=>cyRuntime().model.incense().status),'burning');await page.keyboard.press('Escape');await page.waitForTimeout(3300);report.render=await page.evaluate(()=>cyRuntime().stats());
  await page.waitForFunction(()=>{const a=cyRuntime().audio;return !a.music.paused&&a.music.currentTime>1&&a.music.volume>0&&a.wind.currentTime>0});
  report.audio=await page.evaluate(()=>{const a=cyRuntime().audio;return{musicDuration:a.music.duration,musicTime:a.music.currentTime,musicVolume:a.music.volume,windVolume:a.wind.volume,status:a.status}});assert.ok(report.audio.musicDuration>180);await capture('01-breeze-incense');
  report.checks.push('user gesture starts local instrumental music and wind, with nonzero media playback and gains');
  // Decode exported media in the running Chromium codec to check real content.
  report.media=await page.evaluate(async()=>{
   const context=new AudioContext(),results=[];
   for(const file of ['temple-music.m4a','tea.mp3']){const buffer=await context.decodeAudioData(await(await fetch('/assets/caiyuan/audio/'+file)).arrayBuffer()),pcm=buffer.getChannelData(0);let peak=0,power=0;for(const v of pcm){peak=Math.max(peak,Math.abs(v));power+=v*v}results.push({file,duration:buffer.duration,peak,rms:Math.sqrt(power/pcm.length)})}await context.close();return results;
  });assert.ok(report.media.every(a=>a.peak>.05&&a.peak<1&&a.rms>.005));report.checks.push('both local music/tea files decode, contain audible signal, and do not clip');
  await page.getByRole('navigation',{name:'财源广进工具栏'}).getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'试听添茶',exact:true}).click();assert.ok(await page.evaluate(()=>[...cyRuntime().audio.voices].some(a=>a.src.includes('tea.mp3')&&!a.paused)));
  await page.locator('label.toggle-row').filter({hasText:'背景音乐 · 阁内清音'}).click();assert.equal(await page.evaluate(()=>cyRuntime().audio.music.paused),true);
  await page.locator('label.toggle-row').filter({hasText:'背景音乐 · 阁内清音'}).click();await page.getByRole('slider',{name:'财源广进配乐音量'}).fill('0.3');
  await page.locator('label.toggle-row').filter({hasText:'互动音效'}).click();assert.equal(await page.evaluate(()=>cyRuntime().audio.voices.size),0);await page.locator('label.toggle-row').filter({hasText:'互动音效'}).click();await capture('02-sound-settings');
  report.checks.push('settings music/effects switches, music slider and tea preview work independently');
  await page.getByRole('button',{name:/^暂停片刻/}).click();const before=await page.evaluate(()=>cyRuntime().renderer.motionTime);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>cyRuntime().renderer.motionTime),before);assert.ok(await page.evaluate(()=>cyRuntime().audio.music.paused&&cyRuntime().audio.wind.paused));await page.getByRole('button',{name:/^继续静赏/}).click();
  await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForTimeout(1000);assert.ok(await page.evaluate(()=>cyRuntime().renderer.motionTime)>before);report.checks.push('pause holds motion phase and stops audio; resume continues smoothly');
  await page.getByRole('navigation',{name:'财源广进工具栏'}).getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'夜晚',exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForTimeout(1900);await capture('03-night-flames');
  await page.evaluate(()=>{window.oldCy=cyRuntime();window.oldAudio=oldCy.audio});
  await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.locator('.theme-card').filter({has:page.getByText('锦鲤池',{exact:true})}).click();await page.waitForSelector('.theme-koi');
  assert.ok(await page.evaluate(()=>oldCy.renderer.dead&&oldAudio.dead&&oldAudio.music.paused&&oldAudio.wind.paused&&oldAudio.voices.size===0));report.checks.push('leaving caiyuan destroys its renderer and releases every audio channel');
  await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.locator('.theme-card').filter({has:page.getByText('财源广进',{exact:true})}).click();await page.waitForSelector('.caiyuan-stage');await page.waitForFunction(()=>cyRuntime()?.renderer.stats().loaded>=11);assert.equal(await page.evaluate(()=>cyRuntime().model.state.settings.musicVolume),.3);assert.equal(await page.evaluate(()=>cyRuntime().model.incense().status),'burning');
  await page.reload();await page.waitForSelector('.caiyuan-stage');await page.evaluate(observe);await page.waitForFunction(()=>cyRuntime()?.renderer.stats().loaded>=11);assert.equal(await page.evaluate(()=>cyRuntime().model.state.settings.musicVolume),.3);report.checks.push('theme switch and page reload preserve audio preferences and burning incense');
  assert.deepEqual(report.errors,[]);report.result='PASS';console.log(JSON.stringify(report,null,2));
 }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;if(page)console.error(await page.locator('body').innerText().catch(()=>''));}
 finally{fs.writeFileSync(path.join(out,'atmosphere-report.json'),JSON.stringify(report,null,2));if(app)await app.close().catch(()=>{});fs.rmSync(profile,{recursive:true,force:true})}
})();
