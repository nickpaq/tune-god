'use strict';
const $ = id => document.getElementById(id);
const names = {corrected:'Corrected TuneGod',music:'Music Tempo',web:'Web Audio Beat Detector',original:'Original TuneGod'};
const order = ['corrected','music','web','original'];
let audioContext, buffer, mono, filename='', fileGeneration=0, generation=0, busy=false, anchor=null, cursor=0, selected={method:'corrected',mode:'automatic'}, results={}, worker, workerUrl, pending, requestId=0, source, playing=false, playAt=0, playCursor=0, clickTimer, nextClick=0, oscillators=new Set(), activeView=8, recordingReady=false;
const seconds = time => `${Math.floor(Math.max(0,time)/60)}:${(Math.max(0,time)%60).toFixed(3).padStart(6,'0')}`;
const meter = () => Number($('meter').value);
const selectedResult = () => results[selected.method]?.[selected.mode]?.result;
const status = text => $('status').textContent=text;
const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getContext = async () => {audioContext ||= new AudioContext();if(audioContext.state!=='running')await audioContext.resume();return audioContext;};
function cancelWorker(){if(worker)worker.terminate();worker=null;if(workerUrl)URL.revokeObjectURL(workerUrl);workerUrl=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Analysis cancelled'));pending=null;}}
function askWorker(method,samples,rate,startSeconds,assisted){
  if(!worker){workerUrl=URL.createObjectURL(new Blob([JSON.parse($('worker-source').textContent)],{type:'text/javascript'}));worker=new Worker(workerUrl);worker.onmessage=({data})=>{if(pending&&pending.id===data.id){const p=pending;pending=null;clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.result);}};worker.onerror=e=>{if(pending){pending.reject(new Error(e.message||'Detector worker failed'));clearTimeout(pending.timer);pending=null;}cancelWorker();};}
  const copy=samples.slice();const id=++requestId;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pending?.id===id){cancelWorker();status('Detector took too long. Try a shorter excerpt or set a later downbeat.');}},120000);pending={id,resolve,reject,timer};worker.postMessage({id,method,mono:copy,rate,beatsPerBar:meter(),startSeconds,assisted},[copy.buffer]);});
}
async function prepare(samples,rate,targetRate=rate,filter=false){
  const ctx=new OfflineAudioContext(1,Math.max(1,Math.ceil(samples.length*targetRate/rate)),targetRate);
  const b=ctx.createBuffer(1,samples.length,rate);b.copyToChannel(samples,0);const node=ctx.createBufferSource();node.buffer=b;
  if(filter){const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=240;node.connect(low).connect(ctx.destination);}else node.connect(ctx.destination);
  node.start();return (await ctx.startRendering()).getChannelData(0);
}
async function run(mode='automatic'){
  if(!buffer)return;
  const runGeneration=++generation;cancelWorker();stop();busy=true;recordingReady=false;updateControls();
  const begin=mode==='assisted'?Math.round(anchor*buffer.sampleRate):0;
  const startSeconds=begin/buffer.sampleRate;
  const samples=mono.subarray(begin);
  for(const method of order){results[method] ||= {};results[method][mode]={state:'running'};}
  renderCards();
  for(const method of order){
    if(runGeneration!==generation)return;
    status(`Running ${names[method]} · ${mode==='assisted'?'with your downbeat':'automatic'}…`);
    const started=performance.now();
    try{
      let data=samples;let rate=buffer.sampleRate;
      if(samples.length<rate*2)throw new Error('Choose a downbeat with at least two seconds of audio remaining.');
      if(method==='music'){rate=44100;data=buffer.sampleRate===44100?samples:await prepare(samples,buffer.sampleRate,44100);}
      if(method==='web')data=await prepare(samples,buffer.sampleRate,buffer.sampleRate,true);
      if(runGeneration!==generation)return;
      const result=await askWorker(method,data,rate,startSeconds,mode==='assisted');
      if(runGeneration!==generation)return;
      results[method][mode]={state:'done',result,elapsedMs:performance.now()-started};
    }catch(error){if(runGeneration!==generation)return;results[method][mode]={state:'error',error:error.message,elapsedMs:performance.now()-started};}
    renderCards();draw();
  }
  busy=false;recordingReady=true;updateControls();
  const succeeded=order.filter(m=>results[m][mode]?.state==='done');
  if(!results[selected.method]?.[selected.mode]?.result&&succeeded.length)selected={method:succeeded[0],mode};
  renderCards();draw();status(`${succeeded.length} of 4 results ready, including the original baseline. Choose a grid and listen at the beginning and later in the file.`);
}
function renderCards(){
  const card=method=>{
    const modes=['automatic',...(anchor!==null?['assisted']:[])];
    return `<section class="card ${selected.method===method?'selected':''}"><h2>${names[method]}</h2><div class="comparison">${modes.map(mode=>{
      const entry=results[method]?.[mode];const r=entry?.result;const active=selected.method===method&&selected.mode===mode;
      let content=entry?.state==='running'?'<p>Analyzing…</p>':r?`<span class="metric">${r.bpm.toFixed(3)} <small style="font-size:11px">BPM</small></span><div class="origin">${r.origin.toFixed(4)} s</div><div class="muted">${escapeHtml(r.originKind)}</div><p class="muted">${(entry.elapsedMs/1000).toFixed(2)} s to analyze${r.matches!==undefined?` · ${r.matches} transient matches, ${r.relocks} relocks`:''}</p>`:entry?.error?`<p class="error">${escapeHtml(entry.error)}</p>`:'<p class="muted">Waiting for audio.</p>';
      return `<div><strong class="muted">${mode==='automatic'?'Automatic':'Assisted'}</strong>${content}<button data-method="${method}" data-mode="${mode}" ${!r?'disabled':''} class="${active?'active':''}">${active?'Selected grid':'Hear this grid'}</button></div>`;
    }).join('')}</div>${method==='music'?'<p class="muted">Native beat tracker; first tracked beat used as provisional bar 1.</p>':method==='web'?'<p class="muted">Native default range: 90–180 BPM. Rounded BPM; offset is not a downbeat classification.</p>':'<p class="muted">Initial song detector + existing drift correction.</p>'}</section>`;
  };
  $('cards').innerHTML=order.slice(0,3).map(card).join('');$('baseline-card').innerHTML=card('original');
  for(const button of document.querySelectorAll('[data-method]'))button.onclick=()=>{const wasPlaying=playing;const now=position();stop();cursor=now;selected={method:button.dataset.method,mode:button.dataset.mode};renderCards();draw();if(wasPlaying)start();};
  $('grid-name').textContent=selectedResult()?`${names[selected.method]} · ${selected.mode}`:'Waveform & grid';assessment();
}
function updateControls(){const loaded=!!buffer;for(const id of ['play','seek','back','forward','nudge-left','nudge-right','set-position'])$(id).disabled=!loaded;
  $('anchor').disabled=!loaded||busy;$('clear').disabled=anchor===null||busy;$('go-anchor').disabled=anchor===null;$('cancel').disabled=!busy;$('download').disabled=!loaded||busy;$('meter').disabled=busy;$('demo').disabled=busy;
  $('anchor-info').textContent=anchor===null?'No manual downbeat. Place one anywhere, including after a quiet intro.':`Manual downbeat: ${anchor.toFixed(6)} s. Assisted results are anchored exactly here.`;
}
function position(){return playing?Math.min(buffer.duration,playCursor+Math.max(0,audioContext.currentTime-playAt)):cursor;}
function move(time){const wasPlaying=playing;stop();cursor=Math.max(0,Math.min(buffer?.duration||0,time));draw();if(wasPlaying&&cursor<buffer.duration)start();}
function stop(){if(playing)cursor=position();playing=false;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}clearInterval(clickTimer);for(const osc of oscillators){try{osc.stop();}catch{}}oscillators.clear();$('play').textContent='▶ Play + click';}
function beatTime(k,r){if(r.segments){let s=r.segments[0];for(const next of r.segments){if(next.line>k)break;s=next;}return s.time+(k-s.line)*s.period;}return r.origin+k*60/r.bpm;}
function beatIndex(time,r){if(r.segments){let s=r.segments[0];for(const next of r.segments){if(next.time>time)break;s=next;}return s.line+Math.floor((time-s.time)/s.period);}return Math.floor((time-r.origin)*r.bpm/60);}
function click(at,bar){const osc=audioContext.createOscillator(),gain=audioContext.createGain();oscillators.add(osc);osc.type='sine';osc.frequency.value=bar?1500:1000;const value=Number($('volume').value)*0.4;gain.gain.setValueAtTime(value,at);gain.gain.exponentialRampToValueAtTime(0.0001,at+0.04);osc.connect(gain).connect(audioContext.destination);osc.start(at);osc.stop(at+0.045);osc.onended=()=>{oscillators.delete(osc);osc.disconnect();gain.disconnect();};}
function schedule(){const r=selectedResult();if(!playing||!r)return;const to=playCursor+Math.max(0,audioContext.currentTime-playAt)+0.13;let limit=0;while(beatTime(nextClick,r)<=to&&limit++<40){const t=beatTime(nextClick,r);const at=playAt+t-playCursor;if(t>=playCursor&&t<=buffer.duration&&at>=audioContext.currentTime-0.006)click(Math.max(at,audioContext.currentTime),((nextClick%meter())+meter())%meter()===0);nextClick++;}}
async function start(){if(!buffer||playing)return;await getContext();if(cursor>=buffer.duration)cursor=0;playCursor=cursor;playAt=audioContext.currentTime+0.05;source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);playing=true;source.start(playAt,playCursor);source.onended=()=>{stop();cursor=buffer.duration;draw();};const r=selectedResult();nextClick=r?beatIndex(playCursor,r):0;while(r&&beatTime(nextClick,r)<playCursor-0.001)nextClick++;schedule();clickTimer=setInterval(schedule,25);$('play').textContent='❚❚ Pause';}
$('anchor-time').onfocus=()=>stop();
let peakLevels;
function makePeaks(){const step=256;peakLevels=new Float32Array(Math.ceil(mono.length/step));for(let i=0;i<mono.length;i++)peakLevels[Math.floor(i/step)]=Math.max(peakLevels[Math.floor(i/step)],Math.abs(mono[i]));}
function draw(){
  const canvas=$('wave'),rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);const width=rect.width,height=rect.height;ctx.clearRect(0,0,width,height);ctx.fillStyle='#151a1e';ctx.fillRect(0,0,width,height);
  const time=position();$('position').value=seconds(time);$('seek').value=time;$('anchor-time').value=time.toFixed(6);if(!buffer)return;
  const from=time-activeView/2;const x=t=>(t-from)/activeView*width;const r=selectedResult();
  if(r){let k=beatIndex(from,r)-1;for(let guard=0;guard<500;guard++,k++){const t=beatTime(k,r);if(t>from+activeView)break;if(t<0||t>buffer.duration||t<from)continue;const bar=((k%meter())+meter())%meter()===0;ctx.strokeStyle=bar?'#8cc09d':'#35494b';ctx.lineWidth=bar?1.5:1;ctx.beginPath();ctx.moveTo(x(t),0);ctx.lineTo(x(t),height);ctx.stroke();if(bar){ctx.fillStyle='#abd5b1';ctx.font='10px system-ui';ctx.fillText(String(Math.floor(k/meter())+1)+'.1',x(t)+3,14);}}}
  ctx.strokeStyle='#9bafb9';ctx.lineWidth=1;const visiblePeak=Math.max(1e-5,...peakLevels.subarray(Math.max(0,Math.floor(from*buffer.sampleRate/256)),Math.min(peakLevels.length,Math.ceil((from+activeView)*buffer.sampleRate/256))));
  ctx.beginPath();for(let px=0;px<width;px++){const a=Math.floor((from+px/width*activeView)*buffer.sampleRate);const b=Math.ceil((from+(px+1)/width*activeView)*buffer.sampleRate);if(b<0||a>=mono.length)continue;let v=0;if(b-a<512){for(let i=Math.max(0,a);i<Math.min(mono.length,b);i++)v=Math.max(v,Math.abs(mono[i]));}else for(let i=Math.max(0,Math.floor(a/256));i<Math.min(peakLevels.length,Math.ceil(b/256));i++)v=Math.max(v,peakLevels[i]);const dy=v/visiblePeak*height*0.37;ctx.moveTo(px,height/2-dy);ctx.lineTo(px,height/2+dy);}ctx.stroke();
  if(anchor!==null&&x(anchor)>=0&&x(anchor)<=width){ctx.strokeStyle='#ffd38c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(anchor),0);ctx.lineTo(x(anchor),height);ctx.stroke();ctx.fillStyle='#ffd38c';ctx.fillText('Your downbeat',Math.min(width-85,Math.max(0,x(anchor)+4)),height-8);}
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);ctx.stroke();ctx.fillStyle='#f5f6f6';ctx.font='11px system-ui';ctx.fillText(seconds(Math.max(0,from)),6,height-7);ctx.fillText(seconds(Math.min(buffer.duration,from+activeView)),width-62,height-7);
}
function frame(){if(playing)draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
async function loadAudio(file){const thisLoad=++fileGeneration;++generation;cancelWorker();stop();busy=false;buffer=null;mono=null;results={};anchor=null;cursor=0;filename=file.name;updateControls();renderCards();draw();status('Decoding audio…');try{const ctx=await getContext();const decoded=await ctx.decodeAudioData(await file.arrayBuffer());if(thisLoad!==fileGeneration)return;buffer=decoded;mono=new Float32Array(buffer.length);for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)mono[i]+=data[i]/buffer.numberOfChannels;}makePeaks();$('seek').max=buffer.duration;$('anchor-time').max=buffer.duration;$('file-info').textContent=`${filename} · ${seconds(buffer.duration)} · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} channel(s)`;selected={method:'corrected',mode:'automatic'};updateControls();draw();await run();}catch(error){if(thisLoad!==fileGeneration)return;status(`Unable to load audio: ${error.message}`);updateControls();}}
$('file').onchange=()=>{const file=$('file').files[0];if(file)loadAudio(file);};
$('play').onclick=()=>playing?(stop(),draw()):start();$('seek').oninput=()=>move(Number($('seek').value));$('zoom').onchange=()=>{activeView=Number($('zoom').value);draw();};$('set-position').onclick=()=>move(Number($('anchor-time').value));
$('back').onclick=()=>move(position()-60/(selectedResult()?.bpm||120)*meter());$('forward').onclick=()=>move(position()+60/(selectedResult()?.bpm||120)*meter());$('nudge-left').onclick=()=>move(position()-0.001);$('nudge-right').onclick=()=>move(position()+0.001);
let drag;
$('wave').onpointerdown=e=>{if(!buffer)return;stop();e.currentTarget.setPointerCapture(e.pointerId);drag={x:e.clientX,time:cursor};};$('wave').onpointermove=e=>{if(!drag)return;cursor=Math.max(0,Math.min(buffer.duration,drag.time+(drag.x-e.clientX)/$('wave').getBoundingClientRect().width*activeView));draw();};$('wave').onpointerup=$('wave').onpointercancel=()=>drag=null;
$('anchor').onclick=()=>{stop();if(buffer.duration-cursor<2){status('Place the downbeat with at least two seconds of audio after it.');return;}anchor=Math.round(cursor*buffer.sampleRate)/buffer.sampleRate;selected.mode='assisted';updateControls();draw();run('assisted');};
$('clear').onclick=()=>{stop();anchor=null;for(const method of order)delete results[method]?.assisted;selected.mode='automatic';updateControls();renderCards();draw();status('Manual downbeat cleared. Original automatic results restored.');};$('go-anchor').onclick=()=>move(anchor);
$('cancel').onclick=()=>{++generation;cancelWorker();busy=false;for(const method of order)for(const mode of ['automatic','assisted'])if(results[method]?.[mode]?.state==='running')results[method][mode]={state:'error',error:'Cancelled'};updateControls();renderCards();status('Analysis cancelled. You can choose a new file or place a downbeat and rerun.');};
$('meter').onchange=()=>{if(buffer){anchor=null;results={};selected.mode='automatic';run();}};
function volumeChanged(){const value=Number($('volume').value);$('knob').style.setProperty('--angle',`${-135+value*270}deg`);$('knob').setAttribute('aria-valuenow',Math.round(value*100));}let knobDrag;
$('knob').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);knobDrag={y:e.clientY,value:Number($('volume').value)};};$('knob').onpointermove=e=>{if(knobDrag){$('volume').value=Math.max(0,Math.min(1,knobDrag.value+(knobDrag.y-e.clientY)/120));volumeChanged();}};$('knob').onpointerup=$('knob').onpointercancel=()=>knobDrag=null;$('volume').oninput=volumeChanged;volumeChanged();
function assessment(){const known=Number($('known-bpm').value);const text=[];for(const method of order)for(const mode of ['automatic','assisted']){const r=results[method]?.[mode]?.result;if(!r)continue;const items=[];if(known>0)items.push(`BPM error ${(r.bpm-known).toFixed(3)}`);if(anchor!==null&&mode==='automatic'){const k=Math.round((anchor-r.origin)*r.bpm/60);items.push(`nearest beat ${(1000*(beatTime(k,r)-anchor)).toFixed(1)} ms from your mark`);}if(items.length)text.push(`${names[method]} (${mode}): ${items.join('; ')}`);}$('assessment').textContent=text.join(' | ');}
$('known-bpm').oninput=assessment;
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download').onclick=()=>download(JSON.stringify({build:'auto-chopper-lab-1',baselineCommit:'26d2c61a6509cdd27dcccd9a7cb36f022387107c',filename,duration:buffer.duration,sampleRate:buffer.sampleRate,beatsPerBar:meter(),manualDownbeatSeconds:anchor,knownBpm:Number($('known-bpm').value)||null,winner:$('winner').value,notes:$('notes').value,results},null,2),'application/json','auto-chopper-results.json');
$('html-download').onclick=()=>{const clean=document.documentElement.cloneNode(true);clean.querySelector('#file').value='';clean.querySelector('#cards').innerHTML='';clean.querySelector('#baseline-card').innerHTML='';clean.querySelector('#status').textContent='Ready for audio.';clean.querySelector('#file-info').textContent='Choose audio supported by your browser.';download('<!doctype html>\n'+clean.outerHTML,'text/html','auto-chopper-lab.html');};
$('demo').onclick=async()=>{const ctx=await getContext();const rate=ctx.sampleRate;const length=24*rate;const b=ctx.createBuffer(1,length,rate);const data=b.getChannelData(0);let seed=12;const noise=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32)*2-1;for(let k=0;k<48;k++){const kick=Math.round(k*0.5*rate),hat=Math.round((k*0.5+0.25)*rate);for(let i=0;i<0.08*rate;i++){const t=i/rate;if(kick+i<length)data[kick+i]+=0.3*Math.exp(-35*t)*Math.sin(2*Math.PI*65*t);if(hat+i<length)data[hat+i]+=0.8*Math.exp(-140*t)*noise();}}let wav=new ArrayBuffer(44+length*2),view=new DataView(wav);const str=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,36+length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*2,true);for(let i=0;i<length;i++)view.setInt16(44+2*i,Math.max(-1,Math.min(1,data[i]))*32767,true);await loadAudio(new File([wav],'Demo — 120 BPM, first beat at zero.wav',{type:'audio/wav'}));};
new ResizeObserver(draw).observe($('wave'));renderCards();updateControls();
