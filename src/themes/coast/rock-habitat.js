// The upgraded terrain's opaque rock alpha is the source of truth for both
// foreground occlusion and navigation. This module is DOM-free so the same
// clearance rules can be exercised in deterministic simulation tests.
export function makeRockHabitat(rgba,width,height,worldWidth=1600,worldHeight=900){
  const step=2,w=Math.ceil(worldWidth/step),h=Math.ceil(worldHeight/step),bits=new Uint8Array(w*h);
  // Max-pool solid alpha; transparent export dust and the soft sand/shadow
  // transition cannot create obstacles. The source has no baked wave foam.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=160){
    bits[Math.min(h-1,Math.floor(y/height*h))*w+Math.min(w-1,Math.floor(x/width*w))]=1;
  }
  // Ignore tiny loose grains, while retaining every substantial emergent
  // stone and the coastal plant banks. No dependency on the old coarse hulls.
  const seen=new Uint8Array(bits.length),queue=new Int32Array(bits.length);
  for(let start=0;start<bits.length;start++)if(bits[start]&&!seen[start]){
    let read=0,write=1;queue[0]=start;seen[start]=1;
    while(read<write){const i=queue[read++],x=i%w,y=Math.floor(i/w);
      for(const n of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(n>=0&&bits[n]&&!seen[n]){seen[n]=1;queue[write++]=n;}
    }
    if(write*step*step<48)for(let j=0;j<write;j++)bits[queue[j]]=0;
  }
  const distances=Float32Array.from(bits,v=>v?0:w+h),diag=Math.SQRT2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let d=distances[i];
    if(x)d=Math.min(d,distances[i-1]+1);if(y)d=Math.min(d,distances[i-w]+1);
    if(x&&y)d=Math.min(d,distances[i-w-1]+diag);if(y&&x+1<w)d=Math.min(d,distances[i-w+1]+diag);distances[i]=d;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let d=distances[i];
    if(x+1<w)d=Math.min(d,distances[i+1]+1);if(y+1<h)d=Math.min(d,distances[i+w]+1);
    if(x+1<w&&y+1<h)d=Math.min(d,distances[i+w+1]+diag);if(x&&y+1<h)d=Math.min(d,distances[i+w-1]+diag);distances[i]=d;
  }
  const sample=(x,y)=>Math.min(h-1,Math.max(0,Math.floor(y/step)))*w+Math.min(w-1,Math.max(0,Math.floor(x/step)));
  const crevices=[];
  for(let y=4;y<h-4;y+=3)for(let x=4;x<w-4;x+=3){const i=y*w+x;
    if(!bits[i]||bits[i-1]&&bits[i+1]&&bits[i-w]&&bits[i+w])continue;
    const dx=distances[i+3]-distances[i-3],dy=distances[i+w*3]-distances[i-w*3],length=Math.hypot(dx,dy);
    if(length)crevices.push({anchor:{x:x*step+step/2,y:y*step+step/2},nx:dx/length,ny:dy/length});
  }
  return {width:w,height:h,step,bits,distances,crevices,
    blocked:(x,y)=>!!bits[sample(x,y)],
    // The octile field can overestimate Euclidean distance by <8.3%. Divide
    // by 1.083 and subtract one cell diagonal, guaranteeing a conservative
    // whole-body margin without per-frame pixel scans or angle-dependent gaps.
    clearance:(x,y)=>Math.max(0,distances[sample(x,y)]*step/1.083-step*Math.SQRT2),
  };
}

export function fishRockRadius(species){
  // Normalized fish art is at most size*.92 across; its full turning envelope
  // (including tail bend and shadow) needs more than the old 13px center ring.
  return species?.kind==='fish'?species.size*.67+2:species?.kind==='shrimp'?species.size*.55+2:0;
}
