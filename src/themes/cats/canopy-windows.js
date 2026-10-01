// Merge overlapping see-through rectangles so each canopy pixel is drawn once.
export function mergeWindowRects(windows){
 let rects=windows.map(w=>({x:w.cx-w.rx,y:w.cy-w.ry,w:w.rx*2,h:w.ry*2,windows:[w]}));
 for(let merged=true;merged;){merged=false;
  outer:for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];
   if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);rects[i]={x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y,windows:[...a.windows,...b.windows]};rects.splice(j,1);merged=true;break outer}}
 }
 return rects;
}
