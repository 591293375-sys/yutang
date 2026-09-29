import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {CoastGame} from '../themes/coast/game.js';
import {loadCoast,saveCoast} from '../themes/coast/storage.js';
import {CoastRenderer} from '../themes/coast/renderer.js';
import {renderScale,watchDeviceScale} from '../engine/rendering.js';
import {SandDrawing,SandDrawingInput} from '../themes/coast/sand-drawing.js';
import {surfCoverageAt} from '../themes/coast/surf.js';
import {BottleDrift} from '../themes/coast/bottles.js';
import {hitTestBottle,drawBottleLaunches} from '../themes/coast/bottle-renderer.js';
import {BottleLaunchEffects,BottlePointerInput} from '../themes/coast/bottle-interaction.js';

const CoastScene=forwardRef(function CoastScene({options,desktop,mode,onChange,notify,onBottle},ref){
  const canvas=useRef(null),background=useRef(null),runtime=useRef(null);
  const latest=useRef({options,desktop,mode,onChange,notify,onBottle});latest.current={options,desktop,mode,onChange,notify,onBottle};
  useEffect(()=>{
    const game=new CoastGame(loadCoast(),Date.now());
    const renderer=new CoastRenderer(canvas.current,background.current);
    const drawing=new SandDrawing({coverageAt:surfCoverageAt});game.sandDrawing=drawing;
    const bottles=new BottleDrift({getTide:now=>game.clock.bottleArrival(now),persistTide:()=>saveCoast(game.snapshot())});game.bottles=bottles;
    const launches=new BottleLaunchEffects();bottles.launchEffects=launches;
    let sandInput=null,bottleInput=null;const cancelInput=pointerId=>{sandInput?.cancel(pointerId);bottleInput?.cancel(pointerId)};
    let frame=0,dead=false,last=0,next=0,lastUi=0,lastSave=0,fps=0,sampleStart=0,sampleFrames=0;
    let debugHabitat=false,simTime=0,saveWarning=false,weather=null,nextThunder=Infinity;
    const publish=()=>latest.current.onChange({...game.view(),bottles:bottles.view(),debug:import.meta.env.DEV?{habitat:debugHabitat}:null});
    const persist=()=>{bottles.persist();if(!saveCoast(game.snapshot())&&!saveWarning){saveWarning=true;latest.current.notify('赶海记录暂未写入本机，请留意可用存储空间。')}};
    const render=()=>{
      const o=latest.current.options;if(o.paused)launches.clear();launches.update(simTime,bottles.bottles);
      renderer.render(game,{...o,debugHabitat},simTime);
      if(launches.items.size){renderer.ctx.save();renderer.worldTransform(renderer.ctx);drawBottleLaunches(renderer.ctx,bottles,launches,simTime);renderer.ctx.restore()}
    };
    const clearEffects=()=>{if(launches.items.size){launches.clear();if(!dead)render()}};
    const resize=()=>{
      if(dead)return;cancelInput();
      const bounds=canvas.current.getBoundingClientRect(),o=latest.current.options;
      const dpr=renderScale(bounds.width,bounds.height,window.devicePixelRatio||1,o.quality,o.desktopMode,latest.current.desktop?.display?.scaleFactor);
      renderer.resize({width:bounds.width,height:bounds.height,scale:dpr});
      render();
    };
    const draw=t=>{
      frame=0;if(dead||document.hidden)return;
      const o=latest.current.options,interval=o.quality==='low'||o.reducedMotion?1000/30:1000/60;
      if(next&&t+2<next){frame=requestAnimationFrame(draw);return}
      next=t+interval-2;
      const dt=last?Math.min(.05,(t-last)/1000):1/60;last=t;
      if(!o.paused){
        simTime+=dt;
        if(o.weather!==weather){weather=o.weather;nextThunder=weather==='stormy'?simTime+10+Math.random()*5:Infinity}
        if(weather==='stormy'&&simTime>=nextThunder){o.onThunder?.({delay:1000+Math.random()*1000});nextThunder=simTime+25+Math.random()*25}
        game.update(dt,Date.now());bottles.update(dt,Date.now(),game.tide.level);drawing.update(dt,game.tide.level,simTime,o);render()
      }
      if(!sampleStart)sampleStart=t;
      sampleFrames++;
      if(t-sampleStart>=1000){fps=Math.round(sampleFrames*1000/(t-sampleStart));sampleFrames=0;sampleStart=t}
      if(t-lastUi>500){publish();lastUi=t}
      if(t-lastSave>5000){persist();lastSave=t}
      if(!o.paused)frame=requestAnimationFrame(draw);
    };
    const schedule=()=>{last=next=0;if(!frame&&!dead&&!document.hidden)frame=requestAnimationFrame(draw)};
    const respond=result=>{if(result?.message)latest.current.notify(result.message);if(result?.action!=='read-sent')persist();publish();render();return result};
    const hitBottle=(x,y)=>{const p=renderer.screenToWorld(x,y);return hitTestBottle(p.x,p.y,bottles,{cover:renderer.cover,time:simTime,reducedMotion:latest.current.options.reducedMotion,launches})};
    const pickupBottle=id=>{const result=respond(bottles.pickup(id,Date.now()));if(result?.ok)latest.current.onBottle?.(result.letter);return result};
    const interact=(x,y)=>{
      if(dead||latest.current.options.paused||!insideCanvas(x,y))return;
      const now=Date.now();game.refresh(now);
      const bottleId=hitBottle(x,y);
      if(bottleId)return pickupBottle(bottleId)
      const entity=renderer.hitTest(x,y,game);
      if(entity)return respond(game.interact(typeof entity==='string'?entity:entity.id,latest.current.mode,now));
    };
    const pointer=(x,y)=>{
      if(typeof game.pointer==='function'){
        const p=renderer.screenToWorld(x,y);game.pointer(p.x,p.y);
      }
    };
    const insideCanvas=(x,y)=>{
      const bounds=canvas.current?.getBoundingClientRect();
      return !!bounds&&x>=bounds.left&&x<bounds.right&&y>=bounds.top&&y<bounds.bottom&&document.elementFromPoint(x,y)===canvas.current;
    };
    sandInput=new SandDrawingInput({drawing,toWorld:(x,y)=>renderer.screenToWorld(x,y),getLevel:()=>game.tide.level,getTime:()=>simTime,
      getMode:()=>latest.current.mode,isPaused:()=>dead||latest.current.options.paused,isInside:insideCanvas,
      hasTarget:(x,y)=>!!hitBottle(x,y)||!!renderer.hitTest(x,y,game),onTap:interact,
      capture:id=>{try{canvas.current?.setPointerCapture(id)}catch{}},
      release:id=>{try{if(canvas.current?.hasPointerCapture(id))canvas.current.releasePointerCapture(id)}catch{}},
    });
    bottleInput=new BottlePointerInput({hitTest:hitBottle,isInside:insideCanvas,isPaused:()=>dead||latest.current.options.paused,onTap:pickupBottle,
      capture:id=>{try{canvas.current?.setPointerCapture(id)}catch{}},
      release:id=>{try{if(canvas.current?.hasPointerCapture(id))canvas.current.releasePointerCapture(id)}catch{}},
    });
    const onBlur=()=>{cancelInput();clearEffects()};
    const onVisibility=()=>{cancelInput();clearEffects();cancelAnimationFrame(frame);frame=0;persist();if(!document.hidden){if(!latest.current.options.paused)game.update(0,Date.now());publish();schedule()}};
    const onPageHide=()=>{cancelInput();clearEffects();persist()};
    const observer=new ResizeObserver(resize);observer.observe(canvas.current);
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onPageHide);window.addEventListener('blur',onBlur);
    const stopScale=watchDeviceScale(resize);
    const offPointer=window.pondDesktop?.onPointer(e=>e.type==='feed'?interact(e.x,e.y):pointer(e.x,e.y));
    runtime.current={game,renderer,interact,pointer,resize,schedule,cancelInput,clearEffects,
      bottles:{draft:value=>{const result=bottles.setDraft(value);publish();return result},send:value=>{
        const result=bottles.sendLetter(value,Date.now(),game.tide.level),o=latest.current.options;
        if(result?.ok&&!result.alreadySent&&result.bottle&&!o.paused&&!document.hidden){
          const bounds=canvas.current.getBoundingClientRect(),origin=renderer.screenToWorld(bounds.left+bounds.width*.62,bounds.top+bounds.height*.78);
          launches.start(result.bottle,origin,simTime,{reducedMotion:!!o.reducedMotion});schedule();
        }
        return respond(result);
      }},
      pointerDown:event=>{if(!sandInput.active&&!bottleInput.active&&(bottleInput.down(event)||sandInput.down(event)))event.preventDefault()},
      pointerMove:event=>{if(bottleInput.active)bottleInput.move(event);else sandInput.move(event);pointer(event.clientX,event.clientY)},
      pointerUp:event=>bottleInput.active?bottleInput.up(event):sandInput.up(event),
      stats:()=>({...renderer.getStats(),sandSegments:drawing.segments.length,sandDrawingActive:sandInput.active,bottleLaunches:launches.items.size,fps:latest.current.options.paused?0:fps,desktopMode:!!latest.current.options.desktopMode,...game.view()}),
      release:value=>respond(game.release(value,Date.now())),
      tideDirection:direction=>{const now=Date.now(),result=game.setTideDirection(direction,now);if(result.ok)bottles.update(0,now,game.tide.level);return respond(result)},
      ...(import.meta.env.DEV?{debug:(action,value)=>{
        const now=Date.now();
        if(action==='habitat')debugHabitat=!!value;
        if(action==='pause')game.clock.setPaused(!!value,now);
        if(action==='speed')game.clock.setSpeed(value,now);
        if(action==='level')game.clock.setLevel(value,now);
        if(action==='phase')game.clock.jump(value,now);
        if(action==='reset')game.clock.reset(now);
        game.update(0,now);publish();render();
      }}:{}),
    };
    resize();publish();schedule();
    return()=>{
      dead=true;cancelInput();clearEffects();drawing.clear();persist();cancelAnimationFrame(frame);observer.disconnect();stopScale?.();offPointer?.();
      window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('blur',onBlur);
      renderer.destroy();runtime.current=null;
    };
  },[]);
  useEffect(()=>{runtime.current?.resize();runtime.current?.schedule()},[options,desktop?.display?.scaleFactor]);
  useEffect(()=>{runtime.current?.cancelInput();if(options.paused||options.reducedMotion)runtime.current?.clearEffects()},[mode,options.paused,options.reducedMotion]);
  useImperativeHandle(ref,()=>({
    bottles:{draft:value=>runtime.current?.bottles.draft(value),send:value=>runtime.current?.bottles.send(value)},
    stats:()=>runtime.current?.stats(),release:v=>runtime.current?.release(v),tideDirection:direction=>runtime.current?.tideDirection(direction),
    feed:()=>latest.current.notify('短点发现小住客；在空沙滩长按拖动，可以留下会被海浪抹去的画。'),
    ...(import.meta.env.DEV?{debug:(action,value)=>runtime.current?.debug(action,value)}:{}),
  }),[]);
  return <><canvas ref={background} className="living-background coast-background" aria-hidden="true"/><canvas ref={canvas} className="pond-canvas coast-canvas" data-coast-mode={mode} aria-label={mode==='catch'?'赶海钳子捕捉模式，轻点已经露出的小动物':'赶海手形观察模式，长按拖动在沙滩绘画，轻点漂流瓶读信'} onPointerMove={e=>runtime.current?.pointerMove(e)} onPointerDown={e=>runtime.current?.pointerDown(e)} onPointerUp={e=>runtime.current?.pointerUp(e)} onPointerCancel={e=>runtime.current?.cancelInput(e.pointerId)} onLostPointerCapture={e=>runtime.current?.cancelInput(e.pointerId)} onPointerLeave={e=>runtime.current?.cancelInput(e.pointerId)}/></>;
});
export default CoastScene;
