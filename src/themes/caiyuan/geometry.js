import {ITEMS} from './catalog.js';
export const TABLE=[{x:.025,y:.792},{x:.976,y:.792},{x:.99,y:.895},{x:.012,y:.895}];
export function sceneTransform(width,height){const s=Math.min(width/1600,height/900);return{x:(width-1600*s)/2,y:(height-900*s)/2,width:1600*s,height:900*s,scale:s}}
export const toScreen=(p,t)=>({x:t.x+p.x*t.width,y:t.y+p.y*t.height});
export const toWorld=(p,t)=>({x:(p.x-t.x)/t.width,y:(p.y-t.y)/t.height});
export function inPolygon(p,poly=TABLE){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
export function bounds(item){const a=ITEMS[item.kind],depth=.97+(item.y-.8)*.6,w=a.width*item.scale*depth,h=w/a.ratio*1600/900;return{x:item.x-w/2,y:item.y-h*a.foot,w,h}}
export function validPlacement(item){if(!ITEMS[item?.kind]||![item.x,item.y,item.scale].every(Number.isFinite))return false;const a=ITEMS[item.kind],b=bounds(item);return item.scale>=a.min&&item.scale<=a.max&&b.y>=.57&&b.x>=.006&&b.x+b.w<=.994&&[-1,0,1].every(s=>inPolygon({x:item.x+s*b.w*a.base/2,y:item.y}))}
export function fitPlacement(item){if(validPlacement(item))return{...item};const safe={...item,x:Math.max(.04,Math.min(.96,Number.isFinite(item.x)?item.x:.5)),y:Math.max(.801,Math.min(.884,Number.isFinite(item.y)?item.y:.85))};const a=ITEMS[safe.kind];safe.scale=Math.max(a.min,Math.min(a.max,Number.isFinite(safe.scale)?safe.scale:1));for(let i=0;i<30&&!validPlacement(safe);i++){safe.x+=(.5-safe.x)*.12;safe.y+=(.85-safe.y)*.12;if(safe.scale>a.min)safe.scale=Math.max(a.min,safe.scale-.015)}return safe}
export function incenseGeometry(item,progress=0){const b=bounds(item),rim={x:item.x,y:b.y+b.h*.18},height=b.w*.76*1600/900*(1-.78*progress);return[-1,0,1].map((s)=>({x:item.x+s*b.w*.096,baseY:rim.y,tipY:rim.y-height,width:b.w*.012,height}))}
export function lampAnchor(item){const b=bounds(item),w=ITEMS.lamp.wick;return{x:b.x+b.w*w.x,y:b.y+b.h*w.y}}
