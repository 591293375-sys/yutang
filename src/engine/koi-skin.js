export const SKIN_WIDTH=512,SKIN_HEIGHT=128;
const hex=rgb=>'#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,p)=>a.map((v,i)=>v*(1-p)+b[i]*p);
/** Convert saved paint to body coordinates. Legacy silhouettes contribute colors only,
 * never their cartoon eyes, outline or tail geometry. Original drawings stay saved. */
export function prepareKoiSkin(image,appearance='legacy'){
 const surface=document.createElement('canvas');surface.width=SKIN_WIDTH;surface.height=SKIN_HEIGHT;const c=surface.getContext('2d',{willReadFrequently:true});
 c.fillStyle='#fff6df';c.fillRect(0,0,SKIN_WIDTH,SKIN_HEIGHT);
 if(appearance==='skin-v2')c.drawImage(image,0,0,SKIN_WIDTH,SKIN_HEIGHT);
 else{
  const legacy=document.createElement('canvas');legacy.width=512;legacy.height=192;const lc=legacy.getContext('2d',{willReadFrequently:true});lc.drawImage(image,0,0,512,192);
  const data=lc.getImageData(0,0,512,192).data,output=c.getImageData(0,0,SKIN_WIDTH,SKIN_HEIGHT);
  for(let x=0;x<SKIN_WIDTH;x++){
   const sourceX=Math.min(423,128+Math.round(x/(SKIN_WIDTH-1)*295));let top=192,bottom=-1;
   for(let y=20;y<173;y++)if(data[(y*512+sourceX)*4+3]>100){top=Math.min(top,y);bottom=y}
   if(bottom<=top)continue;
   for(let y=0;y<SKIN_HEIGHT;y++){
    let sourceY=Math.round(top+(bottom-top)*y/(SKIN_HEIGHT-1));
    // The two template eyes belong to the old silhouette; redraw anatomically placed eyes later.
    if(Math.abs(sourceX-402)<6&&(Math.abs(sourceY-84)<6||Math.abs(sourceY-108)<6))sourceY+=8;
    const si=(sourceY*512+sourceX)*4,di=(y*SKIN_WIDTH+x)*4;
    if(data[si+3]>100){for(let k=0;k<3;k++)output.data[di+k]=data[si+k];output.data[di+3]=255}
   }
  }
  c.putImageData(output,0,0);legacy.width=legacy.height=0;
 }
 const pixels=c.getImageData(0,0,SKIN_WIDTH,SKIN_HEIGHT).data,buckets=new Map();
 for(let i=0;i<pixels.length;i+=64){const rgb=[pixels[i],pixels[i+1],pixels[i+2]],key=rgb.map(v=>Math.floor(v/24)).join(',');const b=buckets.get(key)||{count:0,sum:[0,0,0]};b.count++;rgb.forEach((v,k)=>b.sum[k]+=v);buckets.set(key,b)}
 const dominant=[...buckets.values()].sort((a,b)=>b.count-a.count)[0],base=dominant?dominant.sum.map(v=>v/dominant.count):[246,239,216];
 const palette={base:hex(base),light:hex(mix(base,[255,253,237],.6)),side:hex(mix(base,[34,74,61],.38)),fin:hex(mix(base,[227,233,195],.32)),spot:hex(base),accent:hex(base)};
 return {surface,palette};
}
