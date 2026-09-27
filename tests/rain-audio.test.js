import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AUDIO_TRACKS,ambientMix} from '../src/audio/ambient.js';
function readRain(){
 const b=fs.readFileSync(new URL('../public/assets/rain.wav',import.meta.url));let data,channels,rate,bits;
 assert.equal(b.toString('ascii',0,4),'RIFF');
 for(let i=12;i+8<=b.length;){const n=b.readUInt32LE(i+4),id=b.toString('ascii',i,i+4);if(id==='fmt '){channels=b.readUInt16LE(i+10);rate=b.readUInt32LE(i+12);bits=b.readUInt16LE(i+22)}if(id==='data')data=b.subarray(i+8,i+8+n);i+=8+n+(n%2)}
 assert.equal(bits,16);return {channels,rate,samples:new Int16Array(data.buffer,data.byteOffset,data.length/2)};
}
test('rain replacement has restrained peaks, quiet average level and no loop click',()=>{
 const {channels,rate,samples}=readRain();let peak=0,power=0,deltaPower=0;
 for(let i=0;i<samples.length;i++){const x=samples[i]/32768;peak=Math.max(peak,Math.abs(x));power+=x*x;if(i>=channels)deltaPower+=((samples[i]-samples[i-channels])/32768)**2}
 const rms=Math.sqrt(power/samples.length);assert.equal(samples.length/rate/channels,45);
 assert.ok(peak<.09,`rain transients too loud: ${peak}`);assert.ok(rms>.0008&&rms<.008,`quiet but audible rain RMS: ${rms}`);
 assert.ok(Math.sqrt(deltaPower/samples.length)<.0012,'avoid sharp, crackling energy');
 for(let c=0;c<channels;c++)assert.ok(Math.abs(samples[c]-samples[samples.length-channels+c])/32768<.0002,'loop seam must not click');
});
test('gentle rain cache and mix load the replacement without raising the noise bed',()=>{
 assert.equal(AUDIO_TRACKS.find(t=>t.id==='rain').file,'rain.wav?v=1.7');
 assert.ok(ambientMix('rainy','summer').rain<=.36);assert.ok(ambientMix('stormy','summer').rain<=.42);
});
