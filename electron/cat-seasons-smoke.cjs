'use strict';
// Public UI in a disposable profile. Pixel sampling observes the rendered
// background, not internal scene/game methods, and also runs in the file:// app.
const {_electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../../work/cats/seasons-2.7.4');
const packaged=process.argv.includes('--packaged'),mode=packaged?'packaged':'dev';
const regions={
 canopy:[.03,.02,.22,.21],center:[.43,.34,.31,.37],
 upperPaving:[.48,.32,.18,.16],lowerPaving:[.43,.61,.29,.17],
 bed:[.714,.063,.055,.057],water:[.852,.166,.027,.039],
 step:[.563,.222,.053,.031],climbing:[.935,.440,.031,.082],rock:[.251,.827,.042,.052],
};
const facilities=['bed','water','step','climbing','rock'];
function difference(a,b){let total=0,changed=0;for(let i=0;i<a.length;i+=3){let max=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);total+=d;max=Math.max(max,d)}if(max>5)changed++}return{mae:total/a.length,changedFraction:changed/(a.length/3)}}
function registration(a,b){
 const size=64,gray=rgb=>Array.from({length:size*size},(_,i)=>rgb[i*3]*.2126+rgb[i*3+1]*.7152+rgb[i*3+2]*.0722),g=gray(a),h=gray(b);
 let best={correlation:-2,dx:0,dy:0};
 for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
  let n=0,sa=0,sb=0,saa=0,sbb=0,sab=0;
  for(let y=5;y<size-5;y++)for(let x=5;x<size-5;x++){
   const ai=y*size+x,bi=(y+dy)*size+x+dx;
   // Gradient magnitude keeps the registration insensitive to overall light tint.
   const av=Math.abs(g[ai+1]-g[ai-1])+Math.abs(g[ai+size]-g[ai-size]);
   const bv=Math.abs(h[bi+1]-h[bi-1])+Math.abs(h[bi+size]-h[bi-size]);
   n++;sa+=av;sb+=bv;saa+=av*av;sbb+=bv*bv;sab+=av*bv;
  }
  const correlation=(sab-sa*sb/n)/Math.max(1e-9,Math.sqrt((saa-sa*sa/n)*(sbb-sb*sb/n)));
  if(correlation>best.correlation)best={correlation,dx,dy};
 }
 return best;
}
(async()=>{
 fs.mkdirSync(output,{recursive:true});const profile=fs.mkdtempSync(path.join(output,'season-profile-'));
 const report={result:'IN_PROGRESS',mode,isolatedProfile:true,checks:[],screenshots:[],seasons:{},errors:[],assetErrors:[]};let page;
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL='http://127.0.0.1:5188/';
 const app=await _electron.launch({executablePath:path.join(root,packaged?'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池':'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env});
 const pass=name=>{report.checks.push(name);console.log('PASS',name)};
 const nativeShot=async filename=>{const encoded=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(filename,Buffer.from(encoded,'base64'))};
 app.process().on('exit',(code,signal)=>{report.processExit={code,signal}});app.process().stderr.on('data',chunk=>{report.stderr=((report.stderr||'')+chunk.toString()).slice(-8000)});
 try{
  page=await app.firstWindow();page.on('crash',()=>{report.rendererCrashed=true});page.on('close',()=>{report.pageClosed=true});await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.webContents.on('render-process-gone',(_,details)=>process.stderr.write('SEASON_RENDERER_EXIT '+JSON.stringify(details)+'\n'))});page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>{if(r.url().includes('/assets/cats/'))report.assetErrors.push({url:r.url(),error:r.failure()?.errorText})});
  report.runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));assert.equal(report.runtime.packaged,packaged);
  await page.waitForSelector('.pond-canvas');
  await page.addInitScript(()=>{
   if(sessionStorage.getItem('cat-seasons-274-fixture'))return;
   localStorage.setItem('mofish-theme',JSON.stringify('cats'));
   localStorage.setItem('fusheng-settings',JSON.stringify({sound:false,volume:.18,quality:'high',reducedMotion:false}));
   const ids=['ragdoll','british-shorthair','domestic-orange-white'];
   localStorage.setItem('mofish-cats-v1',JSON.stringify({version:1,cats:ids.map((presetId,i)=>({id:'season-'+i,presetId,name:'四季陪伴'+i,personality:'relaxed',active:true,appearance:{version:1,strokes:[]},x:.48+i*.13,y:.57+i*.09})),props:[],environment:{season:'summer',time:'day',particles:false,fireflies:false},nextId:4}));
   sessionStorage.setItem('cat-seasons-274-fixture','1');
  });
  await page.reload();await page.waitForSelector('.cat-stage[data-season="summer"][data-time="day"]');
  const resizeWindow=async(width,height)=>{const actual=await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();w.setContentSize(width,height);return w.getContentSize()},{width,height});assert.deepEqual(actual,[width,height])};
  await resizeWindow(1600,900);
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  let selectionAt=0;
  const selectSeason=async season=>{selectionAt=await page.evaluate(()=>performance.now());await page.getByRole('button',{name:'四时',exact:true}).click();await page.locator('.season-card.'+season).click();await close();await page.waitForSelector('.cat-stage[data-season="'+season+'"]')};
  const environment=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-cats-v1')).environment);
  async function pixels(){return page.evaluate(regions=>{
   const source=document.querySelector('.cat-background'),scale=Math.max(source.width/7680,source.height/4320),drawWidth=7680*scale,drawHeight=4320*scale,offsetX=(source.width-drawWidth)/2,offsetY=(source.height-drawHeight)/2;
   const sample=document.createElement('canvas');sample.width=64;sample.height=64;const c=sample.getContext('2d',{willReadFrequently:true}),patches={};
   for(const[name,[x,y,w,h]]of Object.entries(regions)){c.clearRect(0,0,64,64);c.drawImage(source,offsetX+x*drawWidth,offsetY+y*drawHeight,w*drawWidth,h*drawHeight,0,0,64,64);const d=c.getImageData(0,0,64,64).data;patches[name]=Array.from({length:64*64*3},(_,i)=>d[Math.floor(i/3)*4+i%3])}
   return{patches,canvas:[source.width,source.height],environment:JSON.parse(localStorage.getItem('mofish-cats-v1')).environment};
  },regions)}
  async function stablePixels(){
   // Two equal pixel samples can still be the old scene while assets are loading.
   // Read the already-created renderer ref without invoking any game/render method.
   await page.waitForFunction(selectionAt=>{const node=document.querySelector('.cat-stage');if(!node)return false;let fiber=node[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];for(let i=0;fiber&&i<30;fiber=fiber.return,i++)for(let hook=fiber.memoizedState,j=0;hook&&j<30;hook=hook.next,j++){const runtime=hook.memoizedState?.current;if(runtime?.game&&runtime?.renderer){const r=runtime.renderer;return !r.dead&&r.background&&r.season===node.dataset.season&&r.timeOfDay===node.dataset.time&&r.backgroundTransition>=selectionAt&&!r.previousBackground&&performance.now()-r.backgroundTransition>=1400}}return false},selectionAt);
   await page.waitForTimeout(120);let last=await pixels();for(let tries=0;tries<12;tries++){await page.waitForTimeout(220);const next=await pixels();if(difference(last.patches.center,next.patches.center).mae<.02&&difference(last.patches.canopy,next.patches.canopy).mae<.02)return next;last=next}throw new Error('season background did not settle')}
  async function capture(name){const sampled=await stablePixels();const filename=`${mode}-${name}.png`;await nativeShot(path.join(output,filename));report.screenshots.push(filename);return sampled}
  await page.getByRole('button',{name:'庭院',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:/^花叶与四时效果/}).isChecked(),false);assert.equal(await page.getByRole('checkbox',{name:/^夜间萤火虫/}).isChecked(),false);await close();pass('season-comparison-uses-disabled-particles-and-fireflies');
  // Exercise last-selection wins while the seasonal images are initially cold.
  selectionAt=await page.evaluate(()=>performance.now());await page.getByRole('button',{name:'四时',exact:true}).click();for(const id of ['winter','spring','autumn','summer','winter'])await page.locator('.season-card.'+id).click();await close();const rapid=await stablePixels();assert.equal((await environment()).season,'winter');
  const samples={};for(const season of ['summer','spring','autumn','winter']){await selectSeason(season);samples[season]=await capture(season+'-day-particles-off');report.seasons[season]={canvas:samples[season].canvas,environment:samples[season].environment};assert.equal(samples[season].environment.particles,false)}
  report.pairwise=[];const seasons=Object.keys(samples);for(let a=0;a<seasons.length;a++)for(let b=a+1;b<seasons.length;b++){
   const first=seasons[a],second=seasons[b],regionsCompared={};for(const key of ['center','upperPaving','lowerPaving','canopy'])regionsCompared[key]=difference(samples[first].patches[key],samples[second].patches[key]);
   report.pairwise.push({first,second,regions:regionsCompared});assert.ok(regionsCompared.center.mae>1.2,`${first}/${second} center visibly differs without particles`);assert.ok(regionsCompared.center.changedFraction>.05,`${first}/${second} center change covers more than isolated pixels`);
  }pass('all-six-season-pairs-change-central-paving-even-with-particles-off');
  report.facilityRegistration={};for(const season of ['spring','autumn','winter']){report.facilityRegistration[season]={};for(const facility of facilities){const match=registration(samples.summer.patches[facility],samples[season].patches[facility]);report.facilityRegistration[season][facility]=match;assert.ok(Math.abs(match.dx)<=1&&Math.abs(match.dy)<=1,`${season} ${facility} remains spatially registered`);assert.ok(match.correlation>.75,`${season} ${facility} preserves the original structure`)}}pass('bed-water-step-climbing-and-rock-remain-registered-in-all-four-seasons');
  report.rapidLastWins=difference(rapid.patches.center,samples.winter.patches.center);assert.ok(report.rapidLastWins.mae<.05);pass('rapid-cold-season-switching-finishes-on-the-last-selection');
  await selectSeason('autumn');const beforeReload=await stablePixels();const catIds=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-cats-v1')).cats.map(c=>c.id));await page.reload();selectionAt=0;await page.waitForSelector('.cat-stage[data-season="autumn"][data-time="day"]');const restored=await stablePixels();report.reloadDifference=difference(beforeReload.patches.center,restored.patches.center);assert.ok(report.reloadDifference.mae<.05);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-cats-v1')).cats.map(c=>c.id)),catIds);assert.equal((await environment()).particles,false);pass('season-particle-preference-and-cat-save-survive-reload');
  await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByText('花叶与四时效果',{exact:true}).click();await close();assert.equal((await environment()).particles,true);const particlesOn=await stablePixels();report.staticArtWithParticles=difference(restored.patches.center,particlesOn.patches.center);assert.ok(report.staticArtWithParticles.mae<.05);await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByText('花叶与四时效果',{exact:true}).click();await close();pass('particle-toggle-does-not-remove-the-seasonal-ground-art');
  report.viewports=[];for(const[width,height]of[[1045,899],[1600,900]]){
   await resizeWindow(width,height);await stablePixels();const coverage=await page.evaluate(()=>{const canvas=document.querySelector('.cat-background'),c=canvas.getContext('2d',{willReadFrequently:true}),rect=canvas.getBoundingClientRect();let mattePixels=0,total=0;for(const[x,y]of[[0,0],[canvas.width-24,0],[0,canvas.height-24],[canvas.width-24,canvas.height-24],[canvas.width/2-12,0],[canvas.width/2-12,canvas.height-24]]){const d=c.getImageData(x,y,24,24).data;for(let i=0;i<d.length;i+=4){total++;if(d[i]===95&&d[i+1]===116&&d[i+2]===93)mattePixels++}}return{viewport:[innerWidth,innerHeight],css:[rect.x,rect.y,rect.width,rect.height],canvas:[canvas.width,canvas.height],mattePixels,total,opacity:getComputedStyle(canvas).opacity}});report.viewports.push(coverage);assert.deepEqual(coverage.css,[0,0,width,height]);assert.equal(coverage.opacity,'1');assert.ok(coverage.mattePixels/coverage.total<.005,'no exposed blank matte borders');await nativeShot(path.join(output,`${mode}-autumn-${width}x${height}.png`));
  }pass('portrait-like-and-wide-windows-remain-covered-with-registered-scenes');
  selectionAt=await page.evaluate(()=>performance.now());await page.getByRole('button',{name:'光阴',exact:true}).click();await page.getByRole('button',{name:/黑夜 · 月下小院/}).click();await close();await page.waitForSelector('.cat-stage[data-time="night"]');const night=await capture('autumn-night');report.night={center:difference(samples.autumn.patches.center,night.patches.center)};assert.ok(report.night.center.mae>5);pass('seasonal-ground-also-renders-after-switching-to-night');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.assetErrors,[]);if(packaged)report.asarSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/Resources/app.asar'))).digest('hex');report.checkedAt=new Date().toISOString();report.result='PASS';
 }catch(error){report.result='FAIL';report.error=error.stack;if(page)await nativeShot(path.join(output,`${mode}-failure.png`)).catch(()=>{});throw error}
 finally{fs.writeFileSync(path.join(output,`season-validation-${mode}.json`),JSON.stringify(report,null,2));await app.close();fs.rmSync(profile,{recursive:true,force:true});console.log(JSON.stringify(report,null,2))}
})().catch(error=>{console.error(error);process.exitCode=1});
