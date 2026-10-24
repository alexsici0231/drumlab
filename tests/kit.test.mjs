import test from 'node:test';
import assert from 'node:assert/strict';
import {DRUMS,KIT_DRUM_IDS,PRESETS,applyPresetTargets} from '../kit.js';

test('user kit has only the four requested main drums and keeps 13 inch as optional',()=>{
  assert.deepEqual(KIT_DRUM_IDS,['tom12','tom16','kick20','snare14']);
  assert.equal(DRUMS.find(d=>d.id==='snare14').label,'Ludwig Snare · 14″ × 8″');
  assert.equal(DRUMS.find(d=>d.id==='tom13').primary,undefined);
});

test('all presets have sensible independent batter and reso targets for all drums',()=>{
  assert.equal(PRESETS.length,3);
  for(const preset of PRESETS){
    assert.deepEqual(Object.keys(preset.values).sort(),[...KIT_DRUM_IDS].sort());
    for(const [drumId,targets] of Object.entries(preset.values)){
      assert.ok(DRUMS.some(d=>d.id===drumId));
      assert.equal(targets.length,2);
      assert.ok(targets.every(hz=>Number.isInteger(hz)&&hz>=30&&hz<=400));
    }
  }
});

test('applying a preset preserves all existing measurements and other profiles',()=>{
  const recorded={hz:151.3,time:120,quality:'good'};
  const center={hz:80.1,time:130,quality:'medium'};
  const profiles={
    tom12:{lugCount:8,heads:{batter:{lugs:[recorded],target:201,center,centerTarget:100},reso:{lugs:[],target:202,center:null,centerTarget:null}}},
    tom13:{lugCount:6,heads:{batter:{lugs:[recorded],target:155},reso:{target:160,lugs:[]}}}
  };
  applyPresetTargets(profiles,'worship-deep');
  assert.equal(profiles.tom12.lugCount,8);
  assert.equal(profiles.tom12.heads.batter.lugs[0],recorded);
  assert.equal(profiles.tom12.heads.batter.center,center);
  assert.equal(profiles.tom12.heads.batter.centerTarget,100);
  assert.equal(profiles.tom12.heads.batter.target,185);
  assert.equal(profiles.tom12.heads.reso.target,185);
  assert.equal(profiles.tom13.heads.batter.target,155);
  assert.equal(profiles.tom16.lugCount,8);
  assert.equal(profiles.tom16.heads.batter.target,121);
  assert.equal(profiles.kick20.heads.batter.target,64);
  assert.equal(profiles.kick20.heads.reso.target,96);
  assert.equal(profiles.snare14.heads.batter.target,240);
  assert.equal(profiles.snare14.heads.reso.target,360);
});

test('unknown preset does not modify profiles',()=>{
  const profiles={tom12:{heads:{batter:{target:151}}}};
  const before=structuredClone(profiles);
  assert.throws(()=>applyPresetTargets(profiles,'bad-value'));
  assert.deepEqual(profiles,before);
});
