import { analyzeDrumHit, noteForHz } from './dsp.js';

const DRUMS = [
  {id:'kick22',label:'Бочка · 22″',type:'kick',lugs:10},
  {id:'kick20',label:'Бочка · 20″',type:'kick',lugs:8},
  {id:'snare14',label:'Малый барабан · 14″',type:'snare',lugs:10},
  {id:'tom8',label:'Том · 8″',type:'tom',lugs:6},
  {id:'tom10',label:'Том · 10″',type:'tom',lugs:6},
  {id:'tom12',label:'Том · 12″',type:'tom',lugs:6},
  {id:'tom13',label:'Том · 13″',type:'tom',lugs:6},
  {id:'tom14',label:'Том · 14″',type:'tom',lugs:8},
  {id:'tom16',label:'Том · 16″',type:'tom',lugs:8},
  {id:'other',label:'Другой барабан',type:'tom',lugs:8}
];
const DB_KEY='drumlab-personal-v1';
const $=id=>document.getElementById(id);
const dom = Object.fromEntries([
  'drumSelect','lugsSelect','headSegments','modeSegments','micStatus','frequencyValue','pitchNote','qualityText',
  'readingFeedback','needle','microphoneButton','lockButton','activityIcon','activityText','drumInterface',
  'circleTitle','circleFrequency','lugButtons','progressTag','centerModeDescription','lugReadings',
  'referenceValue','spreadValue','toleranceSummary','autoAdvance','clearReadingsButton','targetInput',
  'targetFromCurrentButton','toleranceInput','rangeSelect','sensitivitySlider','sensitivityValue',
  'filterText','spectrum','peakChoices','minSpectrumLabel','maxSpectrumLabel','exportButton',
  'importButton','importFile','toast'
].map(id=>[id,$(id)]));
const state={
  db:loadDb(),drumId:'tom12',head:'batter',mode:'lugs',selectedLug:0,micOn:false,
  stream:null,ctx:null,nodes:[],latest:null,spectrum:null,lockedHz:null,
  noiseRms:.001,capture:null,cooldownUntil:0,processing:false,toastTimer:0,
  lastMeasurementContext:null
};

function loadDb(){
  try{
    const value=JSON.parse(localStorage.getItem(DB_KEY));
    if (value && value.version===1 && value.profiles && typeof value.profiles==='object') return value;
  }catch(_err){}
  return {version:1,profiles:{},prefs:{sensitivity:65,tolerance:2,autoAdvance:false,range:'auto',lastDrum:'tom12'},history:[]};
}
function persist(){
  state.db.prefs.lastDrum=state.drumId;
  try{localStorage.setItem(DB_KEY,JSON.stringify(state.db));}catch(_err){ toast('Не удалось сохранить данные браузера. Проверьте свободное место.'); }
}
function headInit(){return {lugs:[],target:null,center:null,centerTarget:null};}
function getProfile(drumId=state.drumId){
  const base=DRUMS.find(d=>d.id===drumId)||DRUMS[0];
  if(!state.db.profiles[drumId])state.db.profiles[drumId]={lugCount:base.lugs,heads:{batter:headInit(),reso:headInit()}};
  const p=state.db.profiles[drumId];
  if (!p.heads || typeof p.heads!=='object') p.heads={batter:headInit(),reso:headInit()};
  for(const head of ['batter','reso']){
    if(!p.heads[head] || typeof p.heads[head]!=='object')p.heads[head]=headInit();
    if(!Array.isArray(p.heads[head].lugs))p.heads[head].lugs=[];
  }
  if(![4,6,8,10,12].includes(Number(p.lugCount)))p.lugCount=base.lugs;
  return p;
}
function getData(){return getProfile().heads[state.head];}
function getDrum(){return DRUMS.find(d=>d.id===state.drumId)||DRUMS[0];}
function getTarget(){
  const v=state.mode==='center'?getData().centerTarget:getData().target;
  return Number.isFinite(v)&&v>=30?Number(v):null;
}
function setTarget(value){
  const target=Number.isFinite(value)&&value>=30&&value<=1200?value:null;
  if(state.mode==='center')getData().centerTarget=target;
  else getData().target=target;
  persist();render();
}
function validReading(x){return x && Number.isFinite(x.hz) && x.hz>0&&x.hz<=1200;}
function getValues(){return getData().lugs.slice(0,getProfile().lugCount).filter(validReading).map(v=>v.hz);}
function median(values){
  if(!values.length)return null;
  const v=[...values].sort((a,b)=>a-b);
  return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;
}
function getReference(){
  const target=getTarget();
  if(target!=null)return {hz:target,source:'Цель'};
  if(state.mode==='center')return null;
  const values=getValues();
  if(!values.length)return null;
  return {hz:median(values),source:values.length>1?'Медиана':'Первый винт'};
}
const hzFmt=(hz)=>Number.isFinite(hz)?Number(hz).toFixed(1):'—';
const signed=(v)=>`${v>0?'+':'−'}${hzFmt(Math.abs(v))}`;
function tolerance(){const v=Number(state.db.prefs.tolerance);return Number.isFinite(v)?Math.min(20,Math.max(.5,v)):2;}
function toast(message){
  dom.toast.textContent=message;
  dom.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer=setTimeout(()=>dom.toast.classList.remove('show'),3800);
}
function updateSegment(id,value){
  for(const btn of dom[id].querySelectorAll('button')){
    const active=btn.dataset.value===value;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',String(active));
  }
}
function updateTargetControl(){
  dom.targetInput.value=getTarget()==null?'':String(getTarget());
  const label=dom.targetInput.closest('label').querySelector('span');
  label.textContent=state.mode==='center'?'Целевой общий тон (Гц)':'Целевая частота у винта (Гц)';
  const hint=dom.targetInput.closest('label').querySelector('small');
  hint.textContent=state.mode==='center'?'Задайте желаемую частоту общего тона.':'Оставьте пустым, чтобы сравнивать винты с медианой измеренных значений.';
}
function changeContext(){
  state.latest=null;
  state.spectrum=null;
  state.lockedHz=null;
  state.lastMeasurementContext=null;
  state.capture=null;
  state.selectedLug=0;
  updateTargetControl();
  render();
}
function readModeReference(reading){
  if(state.mode==='center')return getData().center;
  return getData().lugs[reading];
}
function render(){
  const profile=getProfile(),data=getData();
  dom.lugsSelect.value=profile.lugCount;
  dom.drumSelect.value=state.drumId;
  dom.sensitivitySlider.value=state.db.prefs.sensitivity;
  dom.sensitivityValue.textContent=`${state.db.prefs.sensitivity}%`;
  dom.toleranceInput.value=String(tolerance());
  dom.rangeSelect.value=state.db.prefs.range||'auto';
  dom.autoAdvance.checked=!!state.db.prefs.autoAdvance;
  updateSegment('headSegments',state.head);
  updateSegment('modeSegments',state.mode);

  dom.micStatus.classList.toggle('online',state.micOn);
  dom.micStatus.lastChild.textContent=state.micOn?'Микрофон включён':'Микрофон выключен';
  dom.microphoneButton.classList.toggle('active',state.micOn);
  dom.microphoneButton.innerHTML=state.micOn?'<span class="button-icon" aria-hidden="true">■</span> Остановить микрофон':'<span class="button-icon" aria-hidden="true">◉</span> Включить микрофон';
  dom.activityIcon.classList.toggle('active',state.micOn);
  if(!state.processing){dom.activityText.textContent=state.micOn?'Слушаю · ударьте по пластику':'Микрофон не активен';}
  dom.lockButton.disabled=state.lockedHz==null&&(!state.latest||!Number.isFinite(state.latest.hz));
  dom.lockButton.textContent=state.lockedHz!=null?'× Снять фильтр':'⌁ Зафиксировать тон';
  dom.filterText.textContent=state.lockedHz==null?'Пока отключён. Зафиксируйте правильный тон, чтобы снизить риск скачков на обертоны.':`Включён: ${hzFmt(state.lockedHz)} Гц (от ${hzFmt(state.lockedHz*.82)} до ${hzFmt(state.lockedHz*1.18)} Гц).`;

  if(state.latest){
    dom.frequencyValue.textContent=hzFmt(state.latest.hz);
    const info=noteForHz(state.latest.hz);
    dom.pitchNote.textContent=`Нота: ${info.note} · ${info.cents>0?'+':''}${info.cents} центов`;
    const names={good:'Выраженный пик',medium:'Средняя уверенность',low:'Слабый пик'};
    dom.qualityText.textContent=names[state.latest.quality]||'Измерено';
    dom.qualityText.className=`quality ${state.latest.quality}`;
  }else{
    dom.frequencyValue.textContent='—';dom.pitchNote.textContent='Нота: —';
    dom.qualityText.textContent='Ожидает измерения';dom.qualityText.className='quality';
  }
  const ref=getReference();
  dom.referenceValue.textContent=ref?`${hzFmt(ref.hz)} Гц`:'—';
  const vals=getValues();
  dom.spreadValue.textContent=vals.length>1?`${hzFmt(Math.max(...vals)-Math.min(...vals))} Гц`:'—';
  dom.toleranceSummary.textContent=`±${hzFmt(tolerance())} Гц`;
  updateFeedback(ref);
  const isCenter=state.mode==='center';
  dom.centerModeDescription.hidden=!isCenter;
  dom.lugReadings.hidden=isCenter;
  dom.drumInterface.classList.toggle('center-mode',isCenter);
  dom.progressTag.textContent=isCenter?'Общий тон':`${vals.length} / ${profile.lugCount} измерено`;
  $('drumHeading').querySelector('span').textContent=isCenter?'Общий строй барабана':'Настройка по винтам';
  dom.clearReadingsButton.textContent=isCenter?'Сбросить общий тон':'Сбросить замеры пластика';
  dom.autoAdvance.closest('label').hidden=isCenter;
  dom.circleTitle.textContent=isCenter?'ОБЩИЙ ТОН':`ВИНТ №${state.selectedLug+1}`;
  const current=isCenter?data.center:data.lugs[state.selectedLug];
  dom.circleFrequency.textContent=validReading(current)?hzFmt(current.hz):'—';
  renderLugs(ref);
  renderSpectrum();
  renderCandidates();
}
function updateFeedback(ref){
  if(!state.latest){
    dom.readingFeedback.textContent=state.micOn?'Легко ударьте рядом с выбранным винтом.':'Включите микрофон, затем легко ударьте по пластику.';
    dom.readingFeedback.className='reading-feedback';
    dom.needle.style.left='50%';return;
  }
  if(!ref){
    dom.readingFeedback.textContent='Частота определена. Для сравнения задайте целевой тон.';
    dom.readingFeedback.className='reading-feedback';
    const note=noteForHz(state.latest.hz);
    dom.needle.style.left=`${Math.min(95,Math.max(5,50+note.cents/50*45))}%`;
    return;
  }
  const difference=state.latest.hz-ref.hz;
  const near=Math.abs(difference)<=tolerance();
  const isLower=difference<-tolerance();
  dom.readingFeedback.textContent=near?`В допуске · ${signed(difference)} Гц относительно эталона`:isLower?`${signed(difference)} Гц · Подтяните соответствующий винт`:`${signed(difference)} Гц · Немного ослабьте винт`;
  if(state.mode==='center'&&!near)dom.readingFeedback.textContent=`${signed(difference)} Гц от целевого общего тона`;
  dom.readingFeedback.className=`reading-feedback ${near?'ok':isLower?'up':'down'}`;
  const span=Math.max(12,tolerance()*6);
  dom.needle.style.left=`${Math.max(5,Math.min(95,50+difference/span*45))}%`;
}
function renderLugs(ref){
  dom.lugButtons.replaceChildren();dom.lugReadings.replaceChildren();
  const profile=getProfile(),data=getData();
  for(let i=0;i<profile.lugCount;i++){
    const entry=data.lugs[i],has=validReading(entry);
    const difference=has&&ref?entry.hz-ref.hz:null;
    const ok=difference!==null&&Math.abs(difference)<=tolerance();
    const category=has?(ok?'within':'outside'):'';
    const selected=i===state.selectedLug;
    const btn=document.createElement('button');
    btn.type='button';btn.className=`lug-node ${has?'measured':''} ${category} ${selected?'selected':''}`;
    btn.textContent=String(i+1);
    const angle=-Math.PI/2+i*2*Math.PI/profile.lugCount;
    btn.style.left=`${50+43.8*Math.cos(angle)}%`;
    btn.style.top=`${50+43.8*Math.sin(angle)}%`;
    btn.setAttribute('aria-label',`Винт ${i+1}${has?', '+hzFmt(entry.hz)+' Гц':''}`);
    btn.setAttribute('aria-pressed',String(selected));
    btn.disabled=state.mode==='center';
    btn.addEventListener('click',()=>selectLug(i));
    dom.lugButtons.append(btn);
    const row=document.createElement('button');
    row.type='button';row.className=`lug-reading ${selected?'selected':''} ${has?(ok?'ok':'bad'):''}`;
    const left=document.createElement('span');left.className='reading-number';
    const circle=document.createElement('span');circle.className='number-box';circle.textContent=String(i+1);
    const label=document.createElement('span');
    const freq=document.createElement('strong');freq.textContent=has?`${hzFmt(entry.hz)} Гц`:'—';
    const small=document.createElement('small');small.textContent=has?'Измерено':'Без замера';
    label.append(freq,small);left.append(circle,label);
    const delta=document.createElement('span');delta.className='delta';delta.textContent=difference===null?'':`${signed(difference)} Гц`;
    row.append(left,delta);
    row.addEventListener('click',()=>selectLug(i));
    dom.lugReadings.append(row);
  }
}
function selectLug(i){state.selectedLug=i;render();}
function range(){
  const pref=state.db.prefs.range;
  if(pref==='low')return {minHz:35,maxHz:250};
  if(pref==='mid')return {minHz:100,maxHz:500};
  if(pref==='high')return {minHz:200,maxHz:1000};
  if(pref==='wide')return {minHz:35,maxHz:1000};
  const type=getDrum().type;
  if(state.mode==='center')return type==='kick'?{minHz:35,maxHz:210}:type==='snare'?{minHz:75,maxHz:420}:{minHz:40,maxHz:350};
  if(type==='kick')return {minHz:40,maxHz:260};
  if(type==='snare')return {minHz:145,maxHz:850};
  return {minHz:65,maxHz:700};
}
function renderSpectrum(){
  const canvas=dom.spectrum,c=canvas.getContext('2d');
  if(!c)return;
  const dpr=Math.min(2,devicePixelRatio||1),w=canvas.clientWidth||350,h=canvas.clientHeight||150;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const left=10,right=w-10,top=12,bottom=h-16;
  c.strokeStyle='#243950';c.lineWidth=1;
  for(let n=0;n<4;n++){
    const y=top+n*(bottom-top)/3;
    c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();
  }
  const spectrum=state.spectrum;
  const limits=spectrum?{minHz:spectrum.minHz,maxHz:spectrum.maxHz}:range();
  dom.minSpectrumLabel.textContent=`${Math.round(limits.minHz)} Hz`;
  dom.maxSpectrumLabel.textContent=`${Math.round(limits.maxHz)} Hz`;
  if(!spectrum?.curve?.length){
    c.fillStyle='#728ca4';c.font='12px system-ui';c.textAlign='center';
    c.fillText('Здесь появится спектр последнего удара',w/2,h/2);return;
  }
  const curve=spectrum.curve;
  const grad=c.createLinearGradient(0,top,0,bottom);grad.addColorStop(0,'rgba(77,222,205,.24)');grad.addColorStop(1,'rgba(77,222,205,0)');
  c.beginPath();c.moveTo(left,bottom);
  for(let i=0;i<curve.length;i++)c.lineTo(left+(right-left)*i/(curve.length-1),bottom-(bottom-top)*curve[i]);
  c.lineTo(right,bottom);c.closePath();c.fillStyle=grad;c.fill();
  c.beginPath();
  for(let i=0;i<curve.length;i++){
    const x=left+(right-left)*i/(curve.length-1),y=bottom-(bottom-top)*curve[i];
    if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
  }
  c.strokeStyle='#4ce0d1';c.lineWidth=1.8;c.stroke();
  if(state.latest?.hz>0){
    const pct=Math.log(state.latest.hz/limits.minHz)/Math.log(limits.maxHz/limits.minHz);
    if(pct>=0&&pct<=1){
      const x=left+(right-left)*pct;
      c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.strokeStyle='#ffce85';c.lineWidth=1.5;c.stroke();
      c.textAlign=x>w*.75?'right':'left';c.fillStyle='#ffce85';c.font='bold 12px system-ui';
      c.fillText(`${hzFmt(state.latest.hz)} Hz`,Math.min(w-10,Math.max(10,x+(x>w*.75?-5:5))),top+12);
    }
  }
}
function renderCandidates(){
  dom.peakChoices.replaceChildren();
  const peaks=state.spectrum?.peaks||[];
  if(!peaks.length){const t=document.createElement('span');t.className='empty-peaks';t.textContent='Пики появятся после первого удара';dom.peakChoices.append(t);return;}
  for(const peak of peaks){
    const btn=document.createElement('button');btn.type='button';
    btn.className=`peak-button ${state.latest&&Math.abs(peak.hz-state.latest.hz)<.15?'active':''}`;
    btn.textContent=`${hzFmt(peak.hz)} Hz`;
    btn.title=`Относительная сила пика: ${peak.strength}%`;
    btn.addEventListener('click',()=>selectPeak(peak));
    dom.peakChoices.append(btn);
  }
}
function selectPeak(peak){
  if(!state.lastMeasurementContext)return;
  const locked=state.lockedHz;
  if(locked!==null&&Math.abs(peak.hz-locked)/locked>.18){state.lockedHz=null;toast('Фильтр снят: выбран другой спектральный пик.');}
  commitMeasurement(peak.hz,state.spectrum.quality,state.lastMeasurementContext,true);
}
function commitMeasurement(hz,quality,where,override=false){
  if(!Number.isFinite(hz)||hz<=0)return;
  const data=getData();
  if(where.drumId!==state.drumId||where.head!==state.head||where.mode!==state.mode)return;
  const value={hz,time:Date.now(),quality};
  if(where.mode==='center') data.center=value;
  else data.lugs[where.lug]=value;
  state.latest=value;
  state.lastMeasurementContext={...where};
  if(override && state.db.history.length){
    const last=state.db.history[0];
    if(last.drumId===where.drumId&&last.head===where.head&&last.mode===where.mode&&last.lug===where.lug)last.hz=hz;
  }else{
    state.db.history.unshift({...where,hz,time:Date.now()});
    state.db.history=state.db.history.slice(0,40);
  }
  if(!override&&state.db.prefs.autoAdvance&&where.mode==='lugs'){
    state.selectedLug=(where.lug+1)%getProfile().lugCount;
  }
  persist();render();
}
function onHit(samples){
  state.processing=true;dom.activityText.textContent='Анализирую звук…';
  // Releasing the UI thread before the FFT allows the status to repaint.
  setTimeout(()=>{
    if(!state.micOn){state.processing=false;return;}
    try{
      const where={drumId:state.drumId,head:state.head,mode:state.mode,lug:state.selectedLug};
      const result=analyzeDrumHit(samples,state.ctx.sampleRate,{...range(),lockHz:state.lockedHz});
      if(result.ok){
        state.spectrum=result;
        commitMeasurement(result.chosen.hz,result.quality,where,false);
      }else{
        if(result.curve){state.spectrum=result;renderSpectrum();renderCandidates();}
        toast(result.reason||'Не удалось определить частоту. Повторите удар.');
      }
    }catch(err){console.error('DrumLab FFT',err);toast('Ошибка анализа: повторите удар.');}
    finally{state.processing=false;dom.activityText.textContent=state.micOn?'Слушаю · ударьте по пластику':'Микрофон не активен';}
  },0);
}
function onAudioChunk(chunk){
  if(!state.micOn||state.processing)return;
  if(state.capture){
    state.capture.chunks.push(new Float32Array(chunk));
    state.capture.count+=chunk.length;
    if(state.capture.count>=state.capture.required){
      const record=state.capture;state.capture=null;
      const samples=new Float32Array(record.count);let offset=0;
      for(const a of record.chunks){samples.set(a,offset);offset+=a.length;}
      state.cooldownUntil=performance.now()+530;
      onHit(samples);
    }
    return;
  }
  let power=0,peak=0;
  for(let i=0;i<chunk.length;i++){
    const a=Math.abs(chunk[i]);power+=a*a;if(a>peak)peak=a;
  }
  const rms=Math.sqrt(power/chunk.length);
  const sens=Number(state.db.prefs.sensitivity)||65;
  const base=.0035+(.023*(100-sens)/90);
  const threshold=Math.max(base,state.noiseRms*3.6);
  if(performance.now()>state.cooldownUntil&&rms>threshold&&peak>Math.max(.018,threshold*1.8)){
    state.capture={chunks:[new Float32Array(chunk)],count:chunk.length,required:Math.ceil(state.ctx.sampleRate*.46)};
    dom.activityText.textContent='Удар обнаружен · собираю сигнал…';
  }else if(rms<threshold*.85){
    state.noiseRms=.94*state.noiseRms+.06*rms;
  }
}
async function startMic(){
  if(!navigator.mediaDevices?.getUserMedia){toast('Микрофон доступен только по HTTPS или localhost. Откройте приложение как сайт.');return;}
  dom.microphoneButton.disabled=true;
  dom.microphoneButton.textContent='Запрашиваю микрофон…';
  let newStream=null,newCtx=null;
  try{
    newStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw new Error('Web Audio API недоступен');
    newCtx=new AudioContextClass({latencyHint:'interactive'});
    await newCtx.resume();
    const source=newCtx.createMediaStreamSource(newStream);
    const highpass=newCtx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=27;
    const lowpass=newCtx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=1600;
    const mute=newCtx.createGain();mute.gain.value=0;
    source.connect(highpass);highpass.connect(lowpass);
    let captureNode;
    if(newCtx.audioWorklet?.addModule){
      try{
        await newCtx.audioWorklet.addModule('./capture-worklet.js');
        captureNode=new AudioWorkletNode(newCtx,'drum-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
        captureNode.port.onmessage=(e)=>onAudioChunk(e.data);
      }catch(err){console.warn('AudioWorklet fallback',err);}
    }
    if(!captureNode){
      // Older browsers: ScriptProcessorNode is deprecated but widely supported.
      captureNode=newCtx.createScriptProcessor(2048,1,1);
      captureNode.onaudioprocess=e=>onAudioChunk(e.inputBuffer.getChannelData(0));
    }
    lowpass.connect(captureNode);captureNode.connect(mute);mute.connect(newCtx.destination);
    state.ctx=newCtx;state.stream=newStream;state.nodes=[source,highpass,lowpass,captureNode,mute];
    state.noiseRms=.001;state.micOn=true;state.capture=null;state.cooldownUntil=performance.now()+400;
    render();toast('Микрофон включён. Можно измерять.');
  }catch(err){
    if(newStream)newStream.getTracks().forEach(t=>t.stop());
    if(newCtx)try{await newCtx.close();}catch(_ignored){}
    console.warn('Microphone start failed',err);
    if(err.name==='NotAllowedError'||err.name==='PermissionDeniedError')toast('Нет разрешения на микрофон. Разрешите доступ в настройках сайта.');
    else if(err.name==='NotFoundError')toast('Микрофон не найден. Проверьте устройство.');
    else toast(`Не удалось запустить микрофон: ${err.message||'ошибка браузера'}`);
  }finally{dom.microphoneButton.disabled=false;render();}
}
async function stopMic(){
  state.micOn=false;state.capture=null;state.processing=false;
  state.nodes.forEach(n=>{try{n.disconnect();}catch(_ignored){}});
  state.nodes=[];
  if(state.stream)state.stream.getTracks().forEach(track=>track.stop());
  state.stream=null;
  const ctx=state.ctx;state.ctx=null;
  if(ctx)try{await ctx.close();}catch(_ignored){}
  render();
}
function initEvents(){
  dom.drumSelect.addEventListener('change',e=>{state.drumId=e.target.value;getProfile();persist();changeContext();});
  dom.lugsSelect.addEventListener('change',e=>{
    const profile=getProfile(),count=Number(e.target.value);
    if(![4,6,8,10,12].includes(count))return;
    if(count<profile.lugCount){
      const hasExtra=Object.values(profile.heads).some(h=>h.lugs.slice(count).some(validReading));
      if(hasExtra&&!confirm('Уменьшить число винтов? Скрытые измерения останутся сохранёнными.')){e.target.value=profile.lugCount;return;}
    }
    profile.lugCount=count;state.selectedLug=Math.min(state.selectedLug,count-1);persist();render();
  });
  for(const [id,property] of [['headSegments','head'],['modeSegments','mode']]){
    dom[id].addEventListener('click',e=>{
      const button=e.target.closest('button[data-value]');
      if(button&&state[property]!==button.dataset.value){state[property]=button.dataset.value;changeContext();}
    });
  }
  dom.microphoneButton.addEventListener('click',()=>state.micOn?stopMic():startMic());
  dom.lockButton.addEventListener('click',()=>{
    if(state.lockedHz!==null){state.lockedHz=null;toast('Фильтр обертонов выключен.');}
    else if(state.latest?.hz>0){state.lockedHz=state.latest.hz;toast(`Фильтр зафиксирован: ${hzFmt(state.lockedHz)} Гц ±18%.`);}
    render();
  });
  dom.targetInput.addEventListener('change',e=>{
    const str=e.target.value.trim();
    const n=str===''?null:Number(str);
    if(n!==null&&(n<30||n>1200||!Number.isFinite(n))){toast('Эталон: укажите от 30 до 1200 Гц.');updateTargetControl();return;}
    setTarget(n);
  });
  dom.targetFromCurrentButton.addEventListener('click',()=>{
    if(state.latest?.hz>0){setTarget(Number(state.latest.hz.toFixed(1)));updateTargetControl();toast('Последний замер установлен как эталон.');}
    else toast('Сначала измерьте хотя бы один удар.');
  });
  dom.toleranceInput.addEventListener('change',e=>{
    const v=Number(e.target.value);
    if(!Number.isFinite(v)||v<.5||v>20){toast('Допуск: от 0.5 до 20 Гц.');render();return;}
    state.db.prefs.tolerance=v;persist();render();
  });
  dom.rangeSelect.addEventListener('change',e=>{state.db.prefs.range=e.target.value;state.lockedHz=null;persist();render();});
  dom.sensitivitySlider.addEventListener('input',e=>{state.db.prefs.sensitivity=Number(e.target.value);dom.sensitivityValue.textContent=`${e.target.value}%`;});
  dom.sensitivitySlider.addEventListener('change',()=>persist());
  dom.autoAdvance.addEventListener('change',e=>{state.db.prefs.autoAdvance=e.target.checked;persist();});
  dom.clearReadingsButton.addEventListener('click',()=>{
    const text=state.mode==='center'?'Удалить последнее измерение общего тона?':'Удалить все измерения винтов для этого пластика?';
    if(!confirm(text))return;
    if(state.mode==='center')getData().center=null;
    else getData().lugs=[];
    state.latest=null;state.spectrum=null;state.lockedHz=null;state.lastMeasurementContext=null;persist();render();toast('Измерения очищены.');
  });
  dom.exportButton.addEventListener('click',()=>{
    const json=JSON.stringify(state.db,null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`drumlab-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  dom.importButton.addEventListener('click',()=>dom.importFile.click());
  dom.importFile.addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      if(f.size>500_000)throw new Error('Файл слишком большой.');
      const obj=JSON.parse(await f.text());
      if(obj.version!==1||!obj.profiles||typeof obj.profiles!=='object'||!obj.prefs||typeof obj.prefs!=='object')throw new Error('Неподдерживаемый формат данных.');
      if(!confirm('Заменить текущие настройки данными из резервной копии?'))return;
      state.db={version:1,profiles:obj.profiles,prefs:{sensitivity:65,tolerance:2,autoAdvance:false,range:'auto',...obj.prefs},history:Array.isArray(obj.history)?obj.history.slice(0,40):[]};
      state.drumId=DRUMS.some(d=>d.id===state.db.prefs.lastDrum)?state.db.prefs.lastDrum:'tom12';
      getProfile();persist();changeContext();toast('Резервная копия импортирована.');
    }catch(err){toast(`Импорт не выполнен: ${err.message}`);}
    finally{e.target.value='';}
  });
  window.addEventListener('resize',renderSpectrum);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&state.micOn&&state.ctx?.state==='suspended')state.ctx.resume().catch(()=>{});
  });
  window.addEventListener('pagehide',()=>{
    if(state.stream)state.stream.getTracks().forEach(t=>t.stop());
  });
}
function init(){
  for(const drum of DRUMS){
    const o=document.createElement('option');o.value=drum.id;o.textContent=drum.label;dom.drumSelect.append(o);
  }
  state.drumId=DRUMS.some(d=>d.id===state.db.prefs.lastDrum)?state.db.prefs.lastDrum:'tom12';
  state.db.prefs.sensitivity=Number(state.db.prefs.sensitivity)||65;
  state.db.prefs.sensitivity=Math.max(10,Math.min(100,state.db.prefs.sensitivity));
  if(!['auto','low','mid','high','wide'].includes(state.db.prefs.range))state.db.prefs.range='auto';
  getProfile();initEvents();updateTargetControl();render();
  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline cache:',err));
  }
}
init();
