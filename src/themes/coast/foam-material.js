// Natural transparent foam, split into small cached optical patches once.
// Patches follow the live swash / material edges; they never define habitat.
const ROOT=`${import.meta.env?.BASE_URL||'/'}assets/coast/art-reference-v2/`;
const TW=160,TH=80,COUNT=12;
let source=null,atlas=null;
function loadMaterials(){
  if(source||typeof Image==='undefined')return;
  source=new Image();source.decoding='async';
  source.onload=()=>{
    const read=document.createElement('canvas');read.width=source.naturalWidth;read.height=source.naturalHeight;
    const r=read.getContext('2d',{willReadFrequently:true});r.drawImage(source,0,0);
    const rgba=r.getImageData(0,0,read.width,read.height).data,sw=Math.round(read.width*.23);
    const contactMaterials=[];
    const materials=Array.from({length:COUNT},(_,i)=>{
      const sx=Math.round((read.width-sw)*i/(COUNT-1));let top=read.height,bottom=0;
      // Tolerate nearly transparent edge noise but retain translucent bubbles.
      for(let y=0;y<read.height;y+=2)for(let x=sx;x<sx+sw;x+=2)if(rgba[(y*read.width+x)*4+3]>12){top=Math.min(top,y);bottom=Math.max(bottom,y)}
      top=Math.max(0,top-4);bottom=Math.min(read.height,bottom+5);
      const c=document.createElement('canvas');c.width=TW;c.height=TH;const ctx=c.getContext('2d');
      // Dense leading foam faces the shore; the airy edge trails into the sea.
      ctx.save();ctx.translate(i%2?TW:0,TH);ctx.scale(i%2?-1:1,-1);
      ctx.drawImage(source,sx,top,sw,Math.max(1,bottom-top),0,0,TW,TH);ctx.restore();
      // Rock patches need a common visible leading edge. A whole-strip alpha
      // bounding box retains different amounts of padding in each column and
      // makes the same foam float offshore. Align the last visible source row
      // of every column to local y=0 once, preserving the trailing texture.
      const pinned=document.createElement('canvas');pinned.width=TW;pinned.height=TH;const p=pinned.getContext('2d');
      p.save();p.translate(0,TH);p.scale(1,-1);
      for(let dx=0;dx<TW;dx++){
        const sampleX=sx+(i%2?TW-1-dx:dx)*sw/TW,x=Math.min(read.width-1,Math.round(sampleX));let last=top;
        for(let y=bottom-1;y>=top;y--)if(rgba[(y*read.width+x)*4+3]>24){last=y;break}
        p.drawImage(source,sampleX,top,sw/TW,Math.max(1,last-top+1),dx,0,1,TH);
      }
      p.restore();
      for(const target of [ctx,p]){
        target.globalCompositeOperation='destination-in';
        const along=target.createLinearGradient(0,0,TW,0);along.addColorStop(0,'transparent');along.addColorStop(.18,'#fff');along.addColorStop(.82,'#fff');along.addColorStop(1,'transparent');target.fillStyle=along;target.fillRect(0,0,TW,TH);
        const across=target.createLinearGradient(0,0,0,TH);across.addColorStop(0,'rgba(255,255,255,.85)');across.addColorStop(.22,'#fff');across.addColorStop(.7,'rgba(255,255,255,.6)');across.addColorStop(1,'transparent');target.fillStyle=across;target.fillRect(0,0,TW,TH);
      }
      contactMaterials.push(pinned);
      return c;
    });
    // All patches share one upload / texture binding. Copy 1:1 so this changes
    // batching only; source pixels and both kinds of alpha alignment stay exact.
    atlas=document.createElement('canvas');atlas.width=TW*COUNT;atlas.height=TH*2;
    const a=atlas.getContext('2d');for(let i=0;i<COUNT;i++){a.drawImage(materials[i],i*TW,0);a.drawImage(contactMaterials[i],i*TW,TH)}
    read.width=1;
  };
  // Keep the existing crest visible if a texture fails, without a substitute
  // geometric mesh or a continuing retry loop.
  source.onerror=()=>{atlas=null};source.src=ROOT+'foam.webp';
}
export function drawFoamMaterial(ctx,{x,y,nx,ny,length,width,opacity,seed=0,pinLeading=false}){
  if(opacity<=.003)return;
  loadMaterials();if(!atlas)return;
  ctx.save();ctx.globalAlpha*=opacity;ctx.transform(ny,-nx,nx,ny,x,y);
  ctx.drawImage(atlas,(Math.abs(seed)%COUNT)*TW,pinLeading?TH:0,TW,TH,-length/2,0,length,width);ctx.restore();
}
/** One save/restore + base transform for the whole rock-foam pass. */
export function drawContactFoam(ctx,samples,time,reducedMotion){
  loadMaterials();if(!atlas)return;
  const m=ctx.getTransform(),baseAlpha=ctx.globalAlpha;
  const t=reducedMotion?0:time,sinPulse=Math.sin(t*.59),cosPulse=Math.cos(t*.59),sinSwell=Math.sin(t*.31),cosSwell=Math.cos(t*.31);
  ctx.save();
  for(const s of samples){
    // sin(t + phase) is evaluated analytically using the cached phase, not a
    // quantized clock or a lower animation rate.
    const pulse=.5+.5*(sinPulse*s.foamCos+cosPulse*s.foamSin),swell=.5+.5*(sinSwell*s.swellCos+cosSwell*s.swellSin);
    const distance=1.6+pulse*.3,x=s.x+s.nx*distance,y=s.y+s.ny*distance,opacity=s.strength*(.54+pulse*.22)*s.foamCluster;
    if(opacity<=.003)continue;
    ctx.setTransform(m.a*s.ny-m.c*s.nx,m.b*s.ny-m.d*s.nx,m.a*s.nx+m.c*s.ny,m.b*s.nx+m.d*s.ny,m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f);
    ctx.globalAlpha=baseAlpha*opacity;
    ctx.drawImage(atlas,s.foamSourceX,TH,TW,TH,-16,0,32,16+swell*7);
  }
  ctx.restore();
}
