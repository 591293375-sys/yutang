import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CAT_CUSTOMIZATION,normalizeCustomization,validateCustomization,normalizePersonality,PERSONALITY_IDS} from '../src/themes/cats/customization.js';
test('legacy cats without parameters receive a detached safe default design',()=>{
 const a=normalizeCustomization(),b=validateCustomization(null);assert.deepEqual(a,DEFAULT_CAT_CUSTOMIZATION);a.build=.8;assert.equal(b.build,1);assert.equal(DEFAULT_CAT_CUSTOMIZATION.build,1);
});
test('safe normalization rejects unknown versions and clamps nonfinite or extreme display values',()=>{
 assert.deepEqual(normalizeCustomization({version:77,size:1.3}),DEFAULT_CAT_CUSTOMIZATION);
 const normalized=normalizeCustomization({version:1,size:99,build:NaN,earSize:-100,earShape:'pointed',eyeColor:'#ABCDEF'});
 assert.deepEqual(normalized,{version:1,size:1.35,build:1,earSize:.75,earShape:'pointed',eyeColor:'#abcdef'});
 for(const value of [{version:2},{version:1,size:NaN},{version:1,build:3},{version:1,earShape:'bat'},{version:1,eyeColor:'url(http://invalid)'}])assert.throws(()=>validateCustomization(value));
});
test('all eight personalities include the three existing saved ids and distinct new choices',()=>{
 assert.deepEqual(PERSONALITY_IDS,['friendly','active','relaxed','curious','shy','independent','playful','sleepy']);for(const id of PERSONALITY_IDS)assert.equal(normalizePersonality(id),id);assert.equal(normalizePersonality('unknown'),'friendly');
});
