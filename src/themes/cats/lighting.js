// Light is evaluated in the same normalized courtyard coordinates as feet and
// foliage. It stays stable when a window is cropped or moved between displays.
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const field=(p,x,y,rx,ry)=>Math.exp(-2*(((p.x-x)/rx)**2+((p.y-y)/ry)**2));

export function courtyardLight(point,nightMix=0,canopyCoverage=0){
 const night=clamp(nightMix),coverage=clamp(canopyCoverage);
 // The overhanging crown casts a broad, soft penumbra beyond individual leaves.
 const tree=field(point,.325,.285,.235,.255),border=field(point,.25,.59,.11,.36);
 const shade=clamp(tree*.56+border*.18+coverage*.24,0,.72);
 return {night,shade,brightness:1-night*.36-shade*.21*(1-night*.45),
  saturation:1-night*.24,castOpacity:(.30*(1-shade*.80))*(1-night*.57),
  contactOpacity:.56*(1-night*.32),shadowX:.15*(1-night)-.10*night,shadowY:.055};
}

export function groundedBodyShadow(contacts,width,light,jump=0){
 if(!contacts.length)return{x:0,y:0,rx:width*.28,ry:width*.07,opacity:0};
 const xs=contacts.map(p=>p.groundX??p.x),ys=contacts.map(p=>p.groundY??p.y);
 const count=Math.max(1,contacts.length),height=Math.max(0,jump)/Math.max(1,width);
 // The support polygon, rather than the bitmap's bottom edge, locates the
 // ground beneath the torso in both facing directions.
 return {x:xs.reduce((sum,x)=>sum+x,0)/count,
  y:ys.reduce((sum,y)=>sum+y,0)/count+light.shadowY*width*.35,
  rx:clamp((Math.max(...xs)-Math.min(...xs))*.62+width*.07,width*.20,width*.39),
  ry:clamp((Math.max(...ys)-Math.min(...ys))*.52+width*.03,width*.05,width*.24)*(1+height*.5),
  opacity:light.castOpacity/(1+height*2)};
}

export function contactShadow(contact,width,light,jump=0){
 const lift=Math.max(0,contact.lift||0),height=Math.max(0,jump);
 // These ellipses are ground projections. A raised paw never drags its shadow
 // upward; it fades and widens while the three supporting paws remain firm.
 return {x:contact.groundX??contact.x,y:contact.groundY??contact.y,
  rx:width*(.039+lift*.10+height/Math.max(1,width)*.055),ry:width*.016,
  opacity:light.contactOpacity*(contact.planted?1:.25)/(1+height/Math.max(1,width)*9)};
}
