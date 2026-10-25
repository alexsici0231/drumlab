import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// Package existing offline web tuner without copying secrets or tests into Android.
const root=resolve(process.cwd());
const www=join(root,'www');
const assets=['index.html','privacy.html','styles.css','app.js','kit.js','dsp.js','capture-worklet.js','sw.js','manifest.webmanifest'];
await rm(www,{recursive:true,force:true});
await mkdir(www,{recursive:true});
for(const f of assets)await copyFile(join(root,f),join(www,f));
await cp(join(root,'icons'),join(www,'icons'),{recursive:true});
console.log('Packaged web assets into www/');
