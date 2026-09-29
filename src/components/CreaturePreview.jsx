import {useEffect,useRef} from 'react';
import {KoiRenderer} from '../engine/koi-renderer.js';
import {prepareKoiSkin} from '../engine/koi-skin.js';
import {TurtleRenderer} from '../engine/turtles.js';
export function studioFish(size=1){const length=300*size;return{x:320+length*.115,y:160,length,width:.125,heading:0,phase:0,turn:0,swimAmplitude:0,bodyBend:0,depth:1,variant:0,seed:7,custom:{texture:'preview'}}}
export function paintKoiPreview(canvas,skin,size=1,compact=false){
 const c=canvas.getContext('2d');c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,640,320);
 const painter=new KoiRenderer(c);painter.options.skinStrips=512;painter.images.set('preview',{skin});
 const fish=studioFish(compact?Math.min(size,1.5):size);painter.drawFish(fish,false);return {painter,fish};
}
export function KoiPreview({fish}){
 const canvas=useRef(null),skin=useRef(null),size=useRef(fish.size??1);size.current=fish.size??1;
 useEffect(()=>{let cancelled=false;const img=new Image();img.onload=()=>{if(cancelled)return;try{skin.current=prepareKoiSkin(img,fish.appearance);paintKoiPreview(canvas.current,skin.current,size.current,true)}catch{}};img.src=fish.texture;return()=>{cancelled=true;img.onload=null;skin.current=null}},[fish.texture,fish.appearance]);
 useEffect(()=>{if(skin.current)paintKoiPreview(canvas.current,skin.current,size.current,true)},[fish.size]);
 return <canvas className="koi-thumbnail" ref={canvas} width="1280" height="640" role="img" aria-label={`${fish.name}的锦鲤预览`}/>;
}
export function TurtlePreview(){
 const canvas=useRef(null);
 useEffect(()=>{const renderer=new TurtleRenderer(),c=canvas.current.getContext('2d');let frame,last=0;const draw=t=>{if(t-last>32){last=t;c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,320,180);renderer.draw(c,{x:160,y:90,length:132,heading:-.24,phase:t*.0013,seed:.4},{scale:1})}frame=requestAnimationFrame(draw)};frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);renderer.destroy()}},[]);
 return <canvas ref={canvas} className="turtle-preview" width="640" height="360" role="img" aria-label="缓缓划水的小乌龟"/>;
}
