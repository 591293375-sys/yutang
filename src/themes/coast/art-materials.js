// Coast scene caches only. Source PNGs (also used by the guide and bucket UI)
// stay untouched. These passes never resample geometry or change one alpha byte.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const gaussian=(x,y)=>Math.exp(-(x*x+y*y)*2);

/** Resolve coarse pigment speckles into a restrained lit surface at cache size.
 * Neighbours are alpha- and colour-weighted, so transparent RGB cannot bleed
 * into fine legs/fins, and eyes, stripes and shell grooves retain their edges. */
export function shadeAnimalPixels(source,width,height,artWidth,artHeight,pad,species){
 const output=new Uint8ClampedArray(source),fish=species.aquatic,crab=species.kind==='crab',shell=species.kind==='shell';
 const pigment=fish?.3:crab?.38:.28;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,alpha=source[i+3];if(!alpha)continue;
  const r=source[i],g=source[i+1],b=source[i+2],luma=r*.2126+g*.7152+b*.0722;
  let rr=0,gg=0,bb=0,total=0;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
   const nx=x+ox,ny=y+oy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
   const j=(ny*width+nx)*4,a=source[j+3];if(!a)continue;
   const delta=(Math.abs(source[j]-r)+Math.abs(source[j+1]-g)+Math.abs(source[j+2]-b))/3;
   const weight=(ox===0?2:1)*(oy===0?2:1)*(a/255)*Math.exp(-delta*delta/900);
   rr+=source[j]*weight;gg+=source[j+1]*weight;bb+=source[j+2]*weight;total+=weight;
  }
  const u=(x-pad)/Math.max(1,artWidth),v=(y-pad)/Math.max(1,artHeight);
  // Broad highlights follow the existing body, rather than shiny dots painted
  // over the whole sprite. Thin appendages retain their original shading.
  const body=gaussian((u-.53)/(fish?.53:.46),(v-.5)/(fish?.37:.43));
  const upperLight=gaussian((u-.42)/.54,(v-.30)/.47);
  const lowerShade=gaussian((u-.60)/.52,(v-.80)/.38);
  const light=1+body*(upperLight*.055-lowerShade*.075);
  const darkDetail=clamp((luma-28)/90),wetHighlight=body*upperLight*darkDetail*(shell?2.4:fish?3.2:2);
  const rim=lowerShade*body*darkDetail;
  output[i]=((1-pigment)*r+pigment*rr/total)*light+wetHighlight-rim*3.2;
  output[i+1]=((1-pigment)*g+pigment*gg/total)*light+wetHighlight*.97+rim*.7;
  output[i+2]=((1-pigment)*b+pigment*bb/total)*light+wetHighlight*.9+rim*2.5;
 }
 return output;
}

/** Blue-water transmission, cached per animation frame. Channel attenuation
 * preserves the source's local markings and highlights instead of a flat green
 * source-atop paint layer. Depth/opacity and all hit masks remain renderer-owned. */
export function submergeAnimalPixels(source){
 const output=new Uint8ClampedArray(source);
 for(let i=0;i<source.length;i+=4){
  if(!source[i+3])continue;
  const luma=source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722;
  const scatter=.28+(1-luma/255)*.06,transmission=1-scatter;
  output[i]=source[i]*.79*transmission+48*scatter;
  output[i+1]=source[i+1]*.96*transmission+125*scatter;
  output[i+2]=source[i+2]*1.015*transmission+153*scatter;
 }
 return output;
}
