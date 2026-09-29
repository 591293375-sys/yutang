import test from 'node:test';
import assert from 'node:assert/strict';
import { habitatAt, findHabitat, isHabitatValid, pathIsHabitatValid, waterBoundary, pointInPolygon, shoreLine, ROCKS, PAINTED_WATER_BOUNDARY } from '../src/themes/coast/geometry.js';
import { SPECIES, SPECIES_BY_ID } from '../src/themes/coast/catalog.js';

test('the painted water polygon and habitat queries share the tide footprint', () => {
  let changes = 0;
  for (let y = 60; y < 860; y += 17) for (let x = 60; x < 1560; x += 19) {
    const low = habitatAt(x, y, 0), high = habitatAt(x, y, 1);
    if (!low.blocked && !low.pool) {
      assert.equal(low.water, pointInPolygon(x, y, waterBoundary(0)));
      assert.equal(high.water, pointInPolygon(x, y, waterBoundary(1)));
      if (low.water) assert.equal(high.water, true, 'rising tide must not uncover permanent water');
      if (!low.water && high.water) changes++;
    }
  }
  assert.ok(changes > 100, 'low tide exposes a substantial curved beach');
});

test('low tide exposes a broad beach and high tide surrounds emergent rocks',()=>{
  let total=0,lowWater=0,highWater=0,sand=0;
  for(let y=5;y<900;y+=10)for(let x=5;x<1600;x+=10){
    total++;const low=habitatAt(x,y,0),high=habitatAt(x,y,1);
    if(low.blocked)continue;
    if(low.water){lowWater++;if(!low.pool)assert.ok(pointInPolygon(x,y,PAINTED_WATER_BOUNDARY),'permanent water must retain its original sea texture');}
    else sand++;
    if(high.water)highWater++;
  }
  // Emergent stone faces are land at every tide, not part of the sea area.
  assert.ok(lowWater/total>.24&&lowWater/total<.26,'low tide leaves approximately 25 percent open sea');
  assert.ok(sand/total>.35,'low tide exposes more than 35 percent beach in addition to rocks');
  assert.ok(highWater/total>.58&&highWater/total<.61,'high tide fills the beach while preserving exposed rock faces');
  assert.ok(highWater>lowWater*2,'the sea still expands substantially at high tide');
});

test('rocks never become water or valid fish habitat', () => {
  for (const rock of ROCKS) {
    // Concave foreground silhouettes can have a vertex mean outside the rock.
    let inside;
    for(let y=12;y<890&&!inside;y+=9) for(let x=12;x<1590&&!inside;x+=9) {
      if(pointInPolygon(x,y,rock))inside={x,y};
    }
    assert.ok(inside,'each painted rock has an on-screen interior');
    const {x,y}=inside;
    for (const tide of [0, .5, 1]) {
      assert.equal(habitatAt(x,y,tide).blocked, true);
      assert.equal(isHabitatValid('fish_silver',x,y,tide), false);
    }
  }
});

test('a rising curved shoreline does not fold back into crossing foam loops',()=>{
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(const level of [0,.25,.5,.75,1]){
    const line=shoreLine(level);
    for(let i=1;i<line.length;i++)for(let j=i+2;j<line.length;j++){
      const a=line[i-1],b=line[i],c=line[j-1],d=line[j];
      assert.equal(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0,false,`crossing at level ${level}`);
    }
  }
});

test('every supplied species can spawn and release into legal habitat at every tide', () => {
  let seed=91023;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  assert.equal(SPECIES.length,17);
  for(const species of SPECIES) for(const level of [0,.25,.5,.75,1]) {
    const p=findHabitat(species,level,random);
    assert.ok(p, `${species.id} must have habitat at tide ${level}`);
    assert.ok(isHabitatValid(species,p.x,p.y,level));
    const near=findHabitat(species,level,random,{x:-500,y:-500});
    assert.ok(near && isHabitatValid(species,near.x,near.y,level));
  }
  assert.equal(SPECIES_BY_ID.shell.bucketable,false);
  assert.equal(SPECIES_BY_ID.shrimp.rescuable,true);
});

test('the whole swimming route is checked, preventing tunnelling through rocks', () => {
  let crossedRock=false;
  for(let y=80;y<760;y+=10) for(let x=100;x<1350;x+=10) {
    if(!isHabitatValid('fish_silver',x,y,1)||!isHabitatValid('fish_silver',x+160,y,1))continue;
    if(habitatAt(x+80,y,1).blocked) {
      assert.equal(pathIsHabitatValid('fish_silver',x,y,x+160,y,1),false);
      crossedRock=true;break;
    }
  }
  assert.equal(crossedRock,true,'fixture must actually straddle a visible rock');
});

test('high tide covers almost all exposed beach while retaining some safe shore',()=>{
  let sand=0,flooded=0;
  for(let y=25;y<890;y+=12)for(let x=25;x<1590;x+=12){
    const low=habitatAt(x,y,0),high=habitatAt(x,y,1);
    if(!low.blocked&&!low.pool&&!low.water){sand++;if(high.water)flooded++;}
  }
  assert.ok(flooded/sand>.88,`only ${Math.round(flooded/sand*100)}% of beach flooded`);
  assert.ok(flooded<sand,'a small refuge above the high-water line remains');
});
