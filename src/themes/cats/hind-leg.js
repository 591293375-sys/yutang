// The away portraits hide a complete rear leg. A mesh cannot animate missing
// pixels: reuse this same cat's planted-paw artwork as an independent far limb.
// The torso stays opaque and occludes the upper joint; no whole-cat frame swap.
import {pawCycle} from './continuous-rig.js';
// These source poses already expose the far paw. Their source-rectangle
// landmarks were checked at enlarged scale; never add a third hind leg.
const originalFarLegs={
 'domestic-calico':{hip:[.59,.60],knee:[.55,.75],paw:[.54,.82]},
 'domestic-tuxedo':{hip:[.81,.56],knee:[.875,.70],paw:[.90,.78]},
 'norwegian-forest':{hip:[.50,.62],knee:[.455,.73],paw:[.445,.79]},
 siamese:{hip:[.565,.64],knee:[.52,.77],paw:[.507,.85]},
 bengal:{hip:[.60,.59],knee:[.56,.73],paw:[.54,.80]},
};
export const needsExtraRearLeg=presetId=>!originalFarLegs[presetId];
const cache=new WeakMap();
const clamp=v=>Math.max(0,Math.min(1,v));
export function rearLegFoot(data,width,height,bounds,mapping){
 let weight=0,xsum=0,ysum=0,bottom=.97;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const qx=(bounds[0]+(x+.5)*bounds[2]/width-mapping.x)/mapping.width,qy=(bounds[1]+(y+.5)*bounds[3]/height-mapping.y)/mapping.height,a=data[(y*width+x)*4+3];
  if(a<80||qy<.88||qy>1.03||qx<.3||qx>.85)continue;
  const w=a/255;weight+=w;xsum+=qx*w;ysum+=qy*w;bottom=Math.max(bottom,qy);
 }
 return weight?{x:xsum/weight,y:Math.min(1,bottom),centerY:ysum/weight}:{x:.61,y:.98,centerY:.94};
}
export function rearLegTargets(foot,presetId){
 return {near:{hip:[foot.x-.075,foot.y-.29],knee:[foot.x-.02,foot.y-.15],paw:[foot.x,foot.y-.025]},far:originalFarLegs[presetId]||{hip:[foot.x-.23,foot.y-.31],knee:[foot.x-.21,foot.y-.17],paw:[foot.x-.21,foot.y-.045]}};
}
export function rearLegMotion(phase,strength=1,reducedMotion=false){
 const s=strength*(reducedMotion?.4:1),cycle=pawCycle(phase+.75);
 return {x:.72*cycle.travel*.18*s,y:(-.32*cycle.travel*.18-cycle.lift*.09)*s,lift:cycle.lift,planted:cycle.planted};
}
export function prepareRearLeg(frame,presetId){
 const prior=cache.get(frame.image);if(prior?.revision===(frame.materialRevision||0))return prior;
 const image=frame.image,context=image.getContext?.('2d',{willReadFrequently:true});if(!context)return null;
 const pixels=context.getImageData(0,0,image.width,image.height),map=frame.sourceMapping||{x:0,y:0,width:1,height:1},foot=rearLegFoot(pixels.data,image.width,image.height,frame.bounds,map),targets=rearLegTargets(foot,presetId);
 const result={foot,targets,addFar:needsExtraRearLeg(presetId),image:null,revision:frame.materialRevision||0};
 if(!result.addFar){cache.set(image,result);return result}
 // Copy only fur/foot belonging to this cat and its current custom appearance.
 // Pixels above the knee form a tapered overlap, hidden underneath the torso.
 const surface=document.createElement('canvas');surface.width=image.width;surface.height=image.height;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const qx=(frame.bounds[0]+(x+.5)/frame.cellWidth-map.x)/map.width,qy=(frame.bounds[1]+(y+.5)/frame.cellHeight-map.y)/map.height;
  const t=clamp((qy-(foot.y-.31))/.29),center=foot.x-.055*(1-t),half=.043+.034*(1-t),edge=clamp((half-Math.abs(qx-center))/.012),top=clamp((qy-(foot.y-.31))/.04);
  pixels.data[(y*image.width+x)*4+3]*=edge*top;
 }
 surface.getContext('2d').putImageData(pixels,0,0);result.image=surface;
 cache.set(image,result);return result;
}
