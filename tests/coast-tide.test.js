import test from 'node:test';
import assert from 'node:assert/strict';
import { tideAt, TideClock } from '../src/themes/coast/tide.js';

test('tide has exact 600/300/600/300 phases and repeats continuously', () => {
  for (const [seconds, phase, level, remaining] of [[0,'rising',0,600],[300,'rising',.5,300],[600,'high',1,300],[900,'falling',1,600],[1200,'falling',.5,300],[1500,'low',0,300],[1800,'rising',0,600]]) {
    const tide = tideAt(1000, 1000 + seconds * 1000);
    assert.equal(tide.phase, phase); assert.ok(Math.abs(tide.level - level) < 1e-10); assert.equal(tide.remainingSeconds, remaining);
  }
  for (const seconds of [600,900,1500,1800]) assert.ok(Math.abs(tideAt(0,seconds*1000-1).level-tideAt(0,seconds*1000).level)<1e-6);
  assert.equal(tideAt(0,1800000).cycle, 1);
  assert.equal(tideAt(1000,-1000).level,0);
});

test('offline clock directly computes a bounded level without replay', () => {
  const tide=tideAt(0,5000*1800000+1200000);
  assert.equal(tide.cycle,5000);assert.equal(tide.phase,'falling');assert.ok(Math.abs(tide.level-.5)<1e-10);
  for(let time=0;time<=1800000;time+=1000){const t=tideAt(0,time);assert.ok(t.level>=0&&t.level<=1);assert.ok(t.remainingSeconds>0&&t.remainingSeconds<=600);}
});

test('debug pause, sixtyfold speed, manual level and phase jump preserve epoch', () => {
  const clock=new TideClock(0,0);
  clock.setSpeed(60,0);assert.equal(clock.snapshot(10000).phase,'high');
  clock.setPaused(true,10000);assert.deepEqual(clock.snapshot(10000),clock.snapshot(20000));
  clock.setPaused(false,20000);assert.equal(clock.snapshot(25000).phase,'falling');
  clock.setLevel(.37,25000);assert.ok(Math.abs(clock.snapshot(99999).level-.37)<1e-12);assert.equal(clock.paused,true);
  clock.jump('low',99999);assert.equal(clock.snapshot(100000).level,0);
  clock.reset(100000);assert.equal(clock.speed,1);assert.equal(clock.paused,false);assert.deepEqual(clock.snapshot(100000),{...tideAt(0,100000),manual:false,paused:false,speed:1});assert.equal(clock.epochMs,0);
});
