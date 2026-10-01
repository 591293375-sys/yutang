// The new artwork fills only space outside the original 16:9 scene. Both layers
// share one uniform scale, with no reflected strips or independent axis scaling.
export const BACKDROP_FILES={tall:'temple-outpaint-tall.webp',wide:'temple-outpaint-wide.webp'};
export function backdropPlacement(image,t,orientation){
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
 const scale=orientation==='tall'?t.width/iw:t.height/ih;
 const width=iw*scale,height=ih*scale;
 return{x:t.x+(t.width-width)/2,y:t.y+(t.height-height)/2,width,height,scale};
}
export function drawTempleBackdrop(ctx,image,t,width,height,extension){
 if(extension){
  const orientation=height>t.height+.5?'tall':'wide';
  const p=backdropPlacement(extension,t,orientation);
  ctx.drawImage(extension,p.x,p.y,p.width,p.height);
 }
 // Retain the original pixels, perspective, curtain anchors and all saved item
 // coordinates. Generated faces/lettering are never displayed in the scene.
 ctx.drawImage(image,t.x,t.y,t.width,t.height);
}
