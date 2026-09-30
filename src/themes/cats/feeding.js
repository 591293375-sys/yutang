import {getPreset} from './catalog.js';
import {normalizeCustomization} from './customization.js';
import {catLandmarks,deformCatPoint} from './morphology.js';
import {rigVertexWeights,rigControls,applyRigWeights} from './continuous-rig.js';
import {CAT_FEEDING_POSES} from './feeding-landmarks.js';
const ASPECT=9/16;
export const FOOD_GEOMETRY=Object.freeze({referenceWidth:1600,lipY:-3,seatX:10,edibleRx:13,edibleRy:6});
export function feedingMouthLocal(cat,{frame,atlas,time=null,reducedMotion=false,settle=0}={}){
 const preset=getPreset(cat.presetId),source=CAT_FEEDING_POSES[cat.presetId];if(!source||!preset)return null;
 frame=frame||source;const config=normalizeCustomization(cat.customization),map=frame.sourceMapping;
 const p=deformCatPoint({x:map.x+source.mouth.x*map.width,y:map.y+source.mouth.y*map.height},catLandmarks(preset,frame),config);
 const motion=time===null?{x:0,y:0}:applyRigWeights(rigVertexWeights(p,frame,'eat'),rigControls('eat',time,{reducedMotion}));
 const scale=(frame.scale||1)/(atlas?.referenceWidth||source.referenceWidth);
 return {x:(p.x-frame.anchor.x+motion.x)*scale,y:((p.y-frame.anchor.y)*(1-settle*.018)+motion.y)*scale*frame.cellHeight/frame.cellWidth};
}
export function feedingMouthWorld(cat,options={}){
 const local=feedingMouthLocal(cat,options);if(!local)return null;
 const width=(getPreset(cat.presetId).scale||.068)*normalizeCustomization(cat.customization).size*(.88+cat.y*.18),flip=options.flip??(cat.facing===1?-1:1);
 return {x:cat.x+local.x*width*flip,y:cat.y+local.y*width/ASPECT};
}
export function foodContact(bowl,seat){
 const scale=bowl.foodScale||1,offset=bowl.capacity===2?seat*(bowl.foodSeatX||FOOD_GEOMETRY.seatX):0;
 return {x:bowl.x+offset*scale/FOOD_GEOMETRY.referenceWidth,y:bowl.y+FOOD_GEOMETRY.lipY*scale/FOOD_GEOMETRY.referenceWidth/ASPECT};
}
export function feedingDock(cat,bowl,seat){
 const local=feedingMouthLocal(cat);if(!local)return null;
 const width=(getPreset(cat.presetId).scale||.068)*normalizeCustomization(cat.customization).size,contact=foodContact(bowl,seat),flip=seat<0?-1:1;
 // Perspective depends on the final foot y; solve it rather than using the
 // cat's starting size and stopping short after a walk across the courtyard.
 const y=(contact.y-local.y*width*.88/ASPECT)/(1+local.y*width*.18/ASPECT);
 return {x:contact.x-flip*local.x*width*(.88+.18*y),y,seat,facing:-flip,contact};
}
export function foodBowlLayout(cats,point){
 const bowl={...point,capacity:cats.length>1?2:1,foodScale:1};if(cats.length<2)return bowl;
 const sizes=cats.map(cat=>normalizeCustomization(cat.customization).size),required=.054*(sizes[0]+sizes[1])/2;
 // A shared bowl is created wider once, never moved or expanded as a cat eats.
 // Its two edible stations leave the normal amount of room for both bodies.
 for(let i=0;i<5;i++){
  const a=feedingDock(cats[0],bowl,-1),b=feedingDock(cats[1],bowl,1),gap=Math.hypot(a.x-b.x,(a.y-b.y)*ASPECT);
  if(gap>=required+.001)break;
  bowl.foodScale=Math.min(2.8*Math.max(...sizes),bowl.foodScale+(required+.001-gap)/(2*FOOD_GEOMETRY.seatX/FOOD_GEOMETRY.referenceWidth));
 }
 return bowl;
}
export function mouthInsideFood(mouth,bowl,padding=0){
 const scale=bowl.foodScale||1,c=foodContact(bowl,0),rx=(FOOD_GEOMETRY.edibleRx*scale+padding)/1600,ry=(FOOD_GEOMETRY.edibleRy*scale+padding)/1600/ASPECT;
 return ((mouth.x-c.x)/rx)**2+((mouth.y-c.y)/ry)**2<=1;
}
