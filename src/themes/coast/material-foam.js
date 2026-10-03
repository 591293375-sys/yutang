import {contactWave} from './contact-contours.js';
import {drawFoamMaterialBatch} from './foam-material.js';

/** Flowing optical crests follow the painted boundary, rather than rotated
 * rectangular fragments of a shore texture. All paths are clipped to water
 * and to the exterior of the original rock alpha by RockContact. */
export function drawMaterialContactFoam(ctx,contours,time,reducedMotion=false){
  const t=reducedMotion?0:time;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const soft=Array.from({length:4},()=>new Path2D()),crests=Array.from({length:4},()=>new Path2D()),fragments=[];
  for(const contour of contours){
    const points=contour.points;
    const repeats=Math.max(2,Math.round(contour.length/135));
    // Sparse clusters have a smoothly fading envelope. Every closed contour
    // has real gaps, including small rocks: there is no complete glowing ring.
    for(let i=0;i<points.length;i++){
      const p=points[i],q=points[(i+1)%points.length];
      if(p.strength<.055||q.strength<.055)continue;
      const around=p.arc/contour.length*Math.PI*2*repeats;
      const patch=Math.max(0,Math.sin(around+contour.phase+Math.sin(t*.22)*.45));
      const envelope=patch*patch*(.5+.5*Math.sin(p.arc*.057+contour.phase)**2);
      if(envelope<.045)continue;
      const wave=contactWave(p.arc,t,contour.phase,reducedMotion),next=contactWave(q.arc,t,contour.phase,reducedMotion);
      const distance=.35+wave.distance*.3,qd=.35+next.distance*.3;
      const x=p.x+p.nx*distance,y=p.y+p.ny*distance;
      const endX=q.x+q.nx*qd,endY=q.y+q.ny*qd;
      const softIndex=Math.min(3,Math.floor(p.strength*envelope*4));
      const crestIndex=Math.min(3,Math.floor(p.strength*envelope*(.1+wave.opacity*.22)/.164*4));
      soft[softIndex].moveTo(x,y);soft[softIndex].lineTo(endX,endY);
      crests[crestIndex].moveTo(x,y);crests[crestIndex].lineTo(endX,endY);
      // Existing natural foam is used at a tiny, short-lived scale, following
      // the contour; the material exterior clip removes its rock-facing half.
      if(i%2===0)fragments.push({x,y,nx:p.nx,ny:p.ny,length:13,width:4.5+wave.distance*.5,opacity:p.strength*envelope*.24,seed:i+Math.floor(contour.phase*9)});
    }
  }
  // A few batched paths replace thousands of tiny strokes. Mid-bin opacity
  // preserves the fading envelope while keeping the same animated geometry.
  for(let i=0;i<4;i++){
    const alpha=(i+.5)/4;
    ctx.lineWidth=2.2;ctx.strokeStyle=`rgba(165,213,213,${alpha*.065})`;ctx.stroke(soft[i]);
    ctx.lineWidth=.65;ctx.strokeStyle=`rgba(223,242,237,${alpha*.164})`;ctx.stroke(crests[i]);
  }
  drawFoamMaterialBatch(ctx,fragments);
  ctx.restore();
}
