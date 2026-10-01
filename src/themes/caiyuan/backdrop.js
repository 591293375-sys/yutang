// Keep the complete painted scene and its interaction projection intact. Only
// architecture/cloth at the outer edge supplies the extra viewport coverage;
// these narrow samples cannot contain a face or the plaque's lettering.
export function drawTempleBackdrop(ctx,image,t,width,height){
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
 const top=Math.max(0,t.y),bottom=Math.max(0,height-t.y-t.height);
 const left=Math.max(0,t.x),right=Math.max(0,width-t.x-t.width);
 if(top>0){
  ctx.save();ctx.translate(t.x,t.y);ctx.scale(1,-1);
  ctx.drawImage(image,0,0,iw,ih*.024,0,-.5,t.width,top+.5);ctx.restore();
 }
 if(bottom>0){
  ctx.save();ctx.translate(t.x,t.y+t.height);ctx.scale(1,-1);
  ctx.drawImage(image,0,ih*.91,iw,ih*.09,0,-bottom,t.width,bottom+.5);ctx.restore();
 }
 if(left>0){
  const crop=iw*Math.min(.05,left/t.width);
  ctx.save();ctx.translate(t.x,t.y);ctx.scale(-1,1);
  ctx.drawImage(image,0,0,crop,ih,0,0,left+.5,t.height);ctx.restore();
 }
 if(right>0){
  const crop=iw*Math.min(.05,right/t.width);
  ctx.save();ctx.translate(t.x+t.width,t.y);ctx.scale(-1,1);
  ctx.drawImage(image,iw-crop,0,crop,ih,-right,0,right+.5,t.height);ctx.restore();
 }
 ctx.drawImage(image,t.x,t.y,t.width,t.height);
}
