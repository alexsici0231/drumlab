import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDrumHit,noteForHz} from '../dsp.js';
function synthesized(hz,sampleRate=48000,seconds=.49,harmonics=[1]){
  const signal=new Float32Array(Math.round(sampleRate*seconds));
  for(let i=0;i<signal.length;i++){
    const t=i/sampleRate;
    let total=0;
    for(let k=0;k<harmonics.length;k++)total+=harmonics[k]*Math.sin(2*Math.PI*hz*(k+1)*t);
    signal[i]=.33*Math.exp(-t*4.5)*total;
  }
  return signal;
}
test('recognizes A3 ~220 Hz',()=>{
  const result=analyzeDrumHit(synthesized(220),48000,{minHz:70,maxHz:500});
  assert.ok(result.ok);
  assert.ok(Math.abs(result.chosen.hz-220)<1.2,`found ${result.chosen.hz} Hz`);
});
test('recognizes low E2 ~82.4 Hz in bass range',()=>{
  const result=analyzeDrumHit(synthesized(82.4069),48000,{minHz:35,maxHz:250});
  assert.ok(result.ok);
  assert.ok(Math.abs(result.chosen.hz-82.4069)<1.2,`found ${result.chosen.hz} Hz`);
});
test('filter ±18% avoids octave jump to stronger harmonic',()=>{
  const signal=synthesized(200,48000,.49,[.47,1]);
  const raw=analyzeDrumHit(signal,48000,{minHz:80,maxHz:650});
  const locked=analyzeDrumHit(signal,48000,{minHz:80,maxHz:650,lockHz:200});
  assert.ok(raw.ok && locked.ok);
  assert.ok(Math.abs(raw.chosen.hz-400)<2,`raw=${raw.chosen.hz}`);
  assert.ok(Math.abs(locked.chosen.hz-200)<2,`locked=${locked.chosen.hz}`);
});
test('silence rejected',()=>{
  const result=analyzeDrumHit(new Float32Array(22000),48000,{minHz:70,maxHz:500});
  assert.equal(result.ok,false);
});
test('standard equal-tempered note conversion',()=>{
  assert.deepEqual(noteForHz(440),{note:'A4',cents:0});
  assert.deepEqual(noteForHz(261.6256),{note:'C4',cents:0});
});
