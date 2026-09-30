import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {CatGame} from '../themes/cats/game.js';
import {CatRenderer} from '../themes/cats/renderer.js';
import {CatAudio} from '../themes/cats/audio.js';
import {loadCats,saveCats} from '../themes/cats/storage.js';
import {resolveEnvironment} from '../themes/cats/environment.js';
import {distance,hitFacility} from '../themes/cats/geometry.js';
import {renderScale,watchDeviceScale} from '../engine/rendering.js';
import '../themes/cats/cat-scene.css';

const CatScene=forwardRef(function CatScene({options,desktop,tool,moveProp,editing,onChange,notify,onClearTool,onMoved},ref){
 const canvas=useRef(null),background=useRef(null),stage=useRef(null),runtime=useRef(null);
 const latest=useRef(null);latest.current={options,desktop,tool,moveProp,editing,onChange,notify,onClearTool,onMoved};
 useEffect(()=>{
  const game=new CatGame(loadCats());let frame=0,last=0,next=0,dead=false,time=0,lastUi=0,lastSave=0,sampleStart=0,sampleFrames=0,fps=0,saveWarning=false,audioStatus='off';
  const audio=new CatAudio(status=>{audioStatus=status;if(!dead)publish()});
  const renderer=new CatRenderer(canvas.current,background.current,message=>{if(dead)return;if(message)latest.current.notify(message);render()});
  const hidden=()=>document.hidden||latest.current.desktop?.visible===false||latest.current.desktop?.minimized===true;
  const environment=()=>resolveEnvironment(game.environment);
  const persist=()=>{const ok=saveCats(game.snapshot());if(!ok&&!saveWarning){saveWarning=true;latest.current.notify('本机存储空间不足，请先导出猫咪设计。')}return ok};
  const publish=()=>{const e=environment();stage.current.dataset.time=e.time;stage.current.dataset.season=e.season;latest.current.onChange({...game.view(),resolved:e,audioStatus})};
  const render=()=>{if(!dead&&!hidden())renderer.render(game,environment(),latest.current.options,time,latest.current.tool,latest.current.moveProp)};
  const resize=()=>{if(dead)return;const b=canvas.current.getBoundingClientRect(),o=latest.current.options;renderer.resize({width:b.width,height:b.height,scale:renderScale(b.width,b.height,window.devicePixelRatio||1,o.quality,o.desktopMode,latest.current.desktop?.display?.scaleFactor)});render()};
  const soundAllowed=()=>!dead&&!latest.current.options.paused&&!hidden()&&!latest.current.editing;
  const updateSound=()=>{const o=latest.current.options;audio.configure(o.sound&&soundAllowed(),o.volume)};
  const unlockSound=()=>{updateSound();if(soundAllowed()&&latest.current.options.sound)void audio.unlock()};
  const previewSound=async(kind='meow')=>{updateSound();if(!soundAllowed()||!latest.current.options.sound)return false;if(!await audio.unlock())return false;return audio.cue(kind,{priority:true,preview:true})};
  const setSound=async(enabled,volume)=>{audio.configure(enabled&&soundAllowed(),volume);if(!enabled)return true;if(!soundAllowed())return false;if(!await audio.unlock())return false;return audio.cue('meow',{priority:true,preview:true})};
  const respond=result=>{if(result?.message)latest.current.notify(result.message);persist();publish();render();return result};
  const inside=(x,y)=>{const b=canvas.current.getBoundingClientRect();return x>=b.left&&x<b.right&&y>=b.top&&y<b.bottom&&document.elementFromPoint(x,y)===canvas.current};
  const interact=(x,y)=>{
   const s=latest.current;if(dead||hidden()||s.options.paused||s.editing||!inside(x,y))return;updateSound();
   const p=renderer.screenToWorld(x,y),cat=renderer.hitTest(x,y,game.cats);let result;
   if(s.moveProp){result=game.moveProp(s.moveProp,p);if(result?.ok)s.onMoved();return respond(result)}
   if(s.tool)result=game.command(s.tool,p,cat?.id);
   else if(cat)result=game.command('pet',p,cat.id);
   else{const prop=game.props.find(prop=>prop.persistent&&distance(prop,p)<.022);if(prop)result=game.useProp?.(prop.id);else{const facility=hitFacility(p);if(facility)result=game.visitFacility(facility.id)}}
   // The arrival/interaction event owns its sound. A generic click cue used
   // to occupy the only voice and swallow the immediately following purr.
   if(result)return respond(result);
  };
  const pointer=(x,y)=>{if(dead||hidden())return;const p=renderer.screenToWorld(x,y);renderer.pointer=p;renderer.hoverId=renderer.hitTest(x,y,game.cats)?.id||null;if(!latest.current.options.paused&&!latest.current.editing)game.pointer(p)};
  const draw=t=>{frame=0;if(dead||hidden())return;const o=latest.current.options;const interval=o.quality==='low'||o.reducedMotion?1000/30:1000/60;if(next&&t+2<next){frame=requestAnimationFrame(draw);return}next=t+interval-2;
   const dt=last?Math.min(.06,(t-last)/1000):1/60;last=t;updateSound();
   if(!o.paused&&!latest.current.editing){
    time+=dt;const env=environment();game.update(o.reducedMotion?dt*.7:dt,env);let step=false;
    for(const event of game.drainEvents()){
     if(event.type==='interaction')void audio.cue(({pet:'purr',food:'food',scratch:'scratch',yarn:'yarn',wand:'feather',mouse:'mouse'})[event.tool]||'tap',{priority:true});
     else if(event.type==='step'||event.type==='land')step=true;
    }
    if(step)void audio.cue('step');audio.update(dt,env);
   }
   render();if(!sampleStart)sampleStart=t;sampleFrames++;if(t-sampleStart>=1000){fps=Math.round(sampleFrames*1000/(t-sampleStart));sampleFrames=0;sampleStart=t}
   if(t-lastUi>500){publish();lastUi=t}if(t-lastSave>5000){persist();lastSave=t}
   if(!o.paused&&!latest.current.editing)frame=requestAnimationFrame(draw);
  };
  const schedule=()=>{last=next=0;if(!dead&&!frame&&!hidden())frame=requestAnimationFrame(draw)};
  const clear=()=>{game.clearTransient();audio.stop();renderer.pointer=null;renderer.hoverId=null;persist();publish();render()};
  const visibility=()=>{cancelAnimationFrame(frame);frame=0;audio.stop();persist();if(!hidden()){publish();schedule()}};
  const hide=()=>{audio.stop();persist()};
  const observer=new ResizeObserver(resize);observer.observe(canvas.current);const stopScale=watchDeviceScale(resize);
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',hide);
  window.addEventListener('pointerdown',unlockSound,true);window.addEventListener('keydown',unlockSound,true);
  const off=window.pondDesktop?.onPointer(event=>event.type==='feed'?interact(event.x,event.y):pointer(event.x,event.y));
  runtime.current={game,renderer,interact,pointer,resize,schedule,clear,respond,updateSound,visibility,setSound,previewSound,
   saveDesign:(id,design)=>{const old=game.snapshot();const result=id?game.editCat(id,design):game.addCat(design);if(!result?.ok)return respond(result);if(!persist()){game.clearTransient();const restored=new CatGame(old);game.cats=restored.cats;game.props=restored.props;game.serial=restored.serial;publish();return {ok:false,message:'保存失败，编辑内容仍在，请先导出设计。'}}publish();render();return result},
   stats:()=>({...renderer.stats(),fps:latest.current.options.paused?0:fps,desktopMode:!!latest.current.options.desktopMode,activeCats:game.view().activeCount,props:game.props.length,fireflies:environment().fireflyCount}),
  };resize();publish();persist();schedule();
  return()=>{dead=true;game.clearTransient();persist();cancelAnimationFrame(frame);audio.destroy();renderer.destroy();observer.disconnect();stopScale?.();off?.();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hide);window.removeEventListener('pointerdown',unlockSound,true);window.removeEventListener('keydown',unlockSound,true);runtime.current=null};
 },[]);
 useEffect(()=>{runtime.current?.resize();runtime.current?.updateSound();runtime.current?.schedule()},[options,desktop?.display?.scaleFactor]);
 useEffect(()=>{runtime.current?.visibility()},[desktop?.visible,desktop?.minimized]);
 useEffect(()=>{if(editing)runtime.current?.clear();runtime.current?.schedule()},[editing]);
 useEffect(()=>{if(!tool&&!moveProp)runtime.current?.clear()},[tool,moveProp]);
 useImperativeHandle(ref,()=>({
  setSound:(enabled,volume)=>runtime.current?.setSound(enabled,volume),previewSound:kind=>runtime.current?.previewSound(kind),
  stats:()=>runtime.current?.stats(),feed:()=>latest.current.notify('先选小道具，再点猫咪或石板地面。'),
  clear:()=>runtime.current?.clear(),saveDesign:(id,value)=>runtime.current?.saveDesign(id,value),
  setActive:(id,active)=>runtime.current?.respond(runtime.current.game.setActive(id,active)),archiveCat:id=>runtime.current?.respond(runtime.current.game.archiveCat(id)),removeCat:id=>runtime.current?.respond(runtime.current.game.removeCat(id)),
  setEnvironment:patch=>{const r=runtime.current;if(!r)return;r.game.setEnvironment(patch);r.respond({ok:true});r.schedule()},
  removeProp:id=>runtime.current?.respond(runtime.current.game.removeProp(id)),visitFacility:id=>{const r=runtime.current;if(!r)return;return r.respond(r.game.visitFacility?.(id))},
 }),[]);
 return <div ref={stage} className="cat-stage" data-time="day"><canvas ref={background} className="living-background cat-background" aria-hidden="true"/><canvas ref={canvas} className="pond-canvas cat-canvas" data-tool={tool||''} aria-label="猫咪庭院，先选择道具，再轻点猫咪或石板地面" onPointerDown={e=>{if(e.button===0)runtime.current?.interact(e.clientX,e.clientY)}} onPointerMove={e=>runtime.current?.pointer(e.clientX,e.clientY)} onPointerLeave={()=>{if(runtime.current){runtime.current.renderer.pointer=null;runtime.current.renderer.hoverId=null}}}/><div className="cat-light"/></div>;
});
export default CatScene;
