import test from 'node:test';
import assert from 'node:assert/strict';
import {faceSettings,faceDefaults,faceSignedControls} from '../server/retouch-settings.mjs';
import {sourceSettings,sourceAudioFilters,sourceVideoFilters} from '../server/source-settings.mjs';
import {validateSettings} from '../server/core.mjs';
test('beauty size controls support reduction and enlargement with neutral defaults',()=>{for(const key of faceSignedControls){assert.equal(faceDefaults[key],0);assert.equal(faceSettings({[key]:-1})[key],-1);assert.equal(faceSettings({[key]:1})[key],1);assert.throws(()=>faceSettings({[key]:1.01}));assert.throws(()=>faceSettings({[key]:-1.01}));assert.throws(()=>faceSettings({[key]:NaN}));}assert.throws(()=>faceSettings({faceWrinkles:-.1}));assert.equal(validateSettings({faceEyeSize:-.4}).faceEyeSize,-.4);});
test('manual cleaning controls can be disabled independently and reject invalid values',()=>{assert.deepEqual(sourceAudioFilters({cleanAudio:false}),[]);assert.deepEqual(sourceAudioFilters({cleanAudio:true,audioNoiseReduction:0,audioHighpass:0,audioNormalize:false}),[]);assert.deepEqual(sourceVideoFilters({}),[]);assert.equal(sourceVideoFilters({videoDenoise:.5,videoSharpen:.3}).length,2);assert.throws(()=>sourceSettings({videoDenoise:5}));assert.throws(()=>sourceSettings({audioHighpass:'75;bad'}));assert.throws(()=>sourceSettings({audioNormalize:'true'}));});
