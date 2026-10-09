import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const workerSource=fs.readFileSync(new URL('./detectors.worker.js',import.meta.url),'utf8');
let reply;
const sandbox={Float32Array,Float64Array,console};sandbox.self=sandbox;sandbox.postMessage=data=>reply=data;vm.createContext(sandbox);vm.runInContext(workerSource,sandbox);
function detect(method,mono,rate=22050,startSeconds=0,assisted=false){reply=null;sandbox.onmessage({data:{id:1,method,mono,rate,beatsPerBar:4,startSeconds,assisted}});return reply;}
const rate=22050;
function groove({bpm=120,start=0,seconds=24,hat=.8,kick=.3,sync=false}={}){const out=new Float32Array(seconds*rate);let seed=12;const noise=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32)*2-1;const hit=(t,gain,bass)=>{const from=Math.round(t*rate);for(let i=0;i<.08*rate&&from+i<out.length;i++){const s=i/rate;out[from+i]+=gain*Math.exp(-s*(bass?35:140))*(bass?Math.sin(2*Math.PI*65*s):noise());}};for(let k=0;start+k*60/bpm<seconds;k++){hit(start+k*60/bpm,kick,true);hit(start+(k+.5)*60/bpm,hat,false);if(sync&&k%4===3)hit(start+k*60/bpm,kick*4,true);}return out;}
const x=groove();const old=detect('original',x).result,newResult=detect('corrected',x).result;
assert.ok(Math.abs(old.origin)>.2,'Reproduce whole-spectrum grid locking to offbeat hats');assert.ok(Math.abs(newResult.origin)<.001,'Corrected phase follows kick at file boundary');assert.ok(Math.abs(newResult.bpm-120)<.03);
for(const bpm of [75,90,97.3,120,128]){const r=detect('corrected',groove({bpm})).result;assert.ok(Math.abs(r.bpm-bpm)<.03);assert.ok(Math.abs(r.origin)<.001);}
const sync=detect('corrected',groove({hat:.2,kick:.8,sync:true})).result;assert.ok(sync.origin<.001,'Loud later syncopated accent must not replace credible first kick');
for(const start of [.01,1.3]){const r=detect('corrected',groove({start})).result;assert.ok(Math.abs(r.origin-start)<.008,'Preserve leading silence');}
const manual=detect('corrected',x.subarray(4*rate),rate,4,true).result;assert.equal(manual.origin,4);assert.ok(manual.segments[0].time===4);
for(const method of ['original','corrected','music','web'])assert.ok(detect(method,new Float32Array(rate*4)).error,'Silence must yield failure, not a fake grid');
// Retain existing tempo/downbeat cases, including a quiet intro, on both TuneGod variants.
const upstream=fs.readFileSync(new URL('../../src/audio/song/beats.test.ts',import.meta.url),'utf8');
vm.runInContext(stripTypeScriptTypes(upstream.slice(upstream.indexOf('const RATE'),upstream.indexOf('describe('))),sandbox);
for(const method of ['original','corrected']){
 for(const [bpm,meter,start]of [[120,4,.5],[90,4,1.3],[75,4,.8],[128,4,.25],[100,3,.6]]){
  const data=vm.runInContext(`song(${bpm},${meter},${start},70)`,sandbox);
  sandbox.onmessage({data:{id:2,method,mono:data,rate,beatsPerBar:meter,startSeconds:0,assisted:false}});
  assert.ok(reply.result,JSON.stringify(reply));assert.ok(Math.abs(reply.result.bpm-bpm)<.05);assert.ok(Math.abs(reply.result.origin-start)<.008);
 }
 const data=vm.runInContext(`(()=>{const soft=song(120,4,.5,70),full=song(120,4,8.5,70);return soft.map((v,i)=>i<8.5*RATE?.1*v:full[i]);})()`,sandbox);
 const r=detect(method,data).result;assert.ok(Math.abs(r.origin-8.5)<.02);
}
console.log('PASS: regression reproduced; corrected kicks, non-integer tempos, syncopation, leading silence, exact manual anchor, silence rejection and existing tempo/intro cases.');
