// The four paintings share these banks. Coordinates describe the water side of
// the shore, not the underwater stones. Snow must not turn a bank into water.
const SHORE = [
  [.24,0],[.85,0],[.875,.12],[.94,.205],[1,.28],
  [1,.555],[.925,.565],[.845,.575],[.795,.63],[.755,.735],
  [.71,.81],[.69,.90],[.70,1],[.295,1],[.27,.935],
  [.237,.865],[.19,.81],[.15,.73],[.116,.66],[.078,.565],
  [.055,.46],[.029,.395],[.018,.30],[0,.22],[.075,.195],
  [.13,.16],[.175,.108],[.205,.093],
];
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export class PondHabitat {
  constructor(width,height) { this.resize(width,height); }
  resize(width,height) {
    this.width=width;this.height=height;
    this.scale=Math.max(width/16,height/9);
    this.ox=(width-this.scale*16)/2;this.oy=(height-this.scale*9)/2;
    this.points=SHORE.map(([u,v])=>this.fromArtwork(u,v));
  }
  fromArtwork(u,v) { return {x:this.ox+u*this.scale*16,y:this.oy+v*this.scale*9}; }
  boundary(x,y) {
    let inside=false,distance2=Infinity,px=0,py=0;
    for(let i=0,j=this.points.length-1;i<this.points.length;j=i++) {
      const a=this.points[j],b=this.points[i];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
      const qx=a.x+t*dx,qy=a.y+t*dy,d2=(x-qx)**2+(y-qy)**2;
      if(d2<distance2){distance2=d2;px=qx;py=qy;}
    }
    let distance=Math.sqrt(distance2),nx=(x-px)/(distance||1),ny=(y-py)/(distance||1);
    if(!inside){distance=-distance;nx=-nx;ny=-ny;}
    // Clipping a cover image changes the visible water, so viewport edges also
    // form boundaries. No pixel reads or GPU readbacks occur during animation.
    for(const [d,vx,vy] of [[x,1,0],[this.width-x,-1,0],[y,0,1],[this.height-y,0,-1]]) {
      if(d<distance){distance=d;nx=vx;ny=vy;}
    }
    return {distance,nx,ny};
  }
  contains(x,y,margin=0) { return Number.isFinite(x)&&Number.isFinite(y)&&this.boundary(x,y).distance>=margin-1e-6; }
  project(x,y,margin=0) {
    let p={x,y};
    for(let i=0;i<18;i++) {
      const edge=this.boundary(p.x,p.y);
      if(edge.distance>=margin) return p;
      const offset=margin-edge.distance+.1;
      p.x+=edge.nx*offset;p.y+=edge.ny*offset;
    }
    // Degenerate corner / very small window recovery is bounded and deterministic.
    let nearest=Infinity,best={x:this.width*.5,y:this.height*.5};
    for(let u=.1;u<1;u+=.08)for(let v=.1;v<1;v+=.08){const q={x:u*this.width,y:v*this.height},d=(q.x-x)**2+(q.y-y)**2;if(d<nearest&&this.contains(q.x,q.y,margin)){nearest=d;best=q;}}
    return best;
  }
  routeClear(x,y,tx,ty,margin) {
    for(let i=1;i<=8;i++)if(!this.contains(x+(tx-x)*i/8,y+(ty-y)*i/8,margin))return false;
    return true;
  }
}
