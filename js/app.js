import { PM5 } from './pm5.js';
import { analyse, validStroke } from './coach.js';
import { Recording, csv } from './session.js';
import { RowerView } from './rower.js';
import { sessionScreens } from './screens.js';
const $ = id => document.getElementById(id);
const show = (id, value) => { $(id).textContent = value; };
const num = (v, digits = 0) => Number.isFinite(v) ? v.toFixed(digits) : '—';
const clock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const split = s => { if (!Number.isFinite(s) || s <= 0) return '—:—'; const rounded = Math.round(s * 10) / 10; return `${Math.floor(rounded / 60)}:${(rounded % 60).toFixed(1).padStart(4, '0')}`; };
let mode = 'offline', connecting = false, demoTimer = null, demoCount = 0, demoElapsed = 0, demoDistance = 0;
let live = {}, metricTime = 0, packetTime = 0, strokeTime = 0, windowStrokes = [], lastStroke = null, recording = null, saved = [], lastSpoken = 0, lastCue = '', wakeLock = null;
const rower = new RowerView($('rower-canvas'), phase => show('animation-phase',phase), message => { show('rower-error',message); $('rower-error').hidden=false; });
sessionScreens(name => { rower.visible=name==='rower'; if(rower.visible)rower.size(); });
let noticeTimer, curveTime=0, hrHistory=[], lastHRTime=0, curveDiagnostics=null;
const mirror = (key,value) => document.querySelectorAll(`[data-metric="${key}"]`).forEach(node => { node.textContent=value; });
const settings = () => ({ targetRate: Number($('target-rate').value), targetRatio: Number($('target-ratio').value) });
function notice(message, error = false) { show('notice', message); $('notice').classList.toggle('error', error); $('notice').hidden=false; show('connection-help',message); clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>{$('notice').hidden=true;},error?10000:5000); }
function loadSaved() {
  try { const data = JSON.parse(localStorage.getItem('erg-buddy-sessions') || '[]'); saved = Array.isArray(data) ? data.filter(s => s.version === 1 && Array.isArray(s.strokes) && s.strokes.length && typeof s.startedAt === 'string' && ['demo','PM5'].includes(s.source)).slice(0, 10) : []; }
  catch { saved = []; notice('Browser storage is unavailable. Sessions can still be downloaded during this visit.', true); }
}
async function acquireWakeLock() {
  if (mode === 'offline' || document.hidden || wakeLock || !navigator.wakeLock) return;
  try { const lock = await navigator.wakeLock.request('screen'); if (mode === 'offline' || document.hidden) { await lock.release(); return; } wakeLock = lock; lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; }); }
  catch { /* Browser/OS may refuse a screen lock. Telemetry remains usable. */ }
}
function setMode(next) {
  mode = next;
  if(next==='demo'){curveDiagnostics=null;show('curve-diagnostics','Demo session — no Bluetooth diagnostics.');}
  show('animation-source',next==='demo'?'Simulated stroke timing':next==='PM5'?'Live PM5 stroke phase':'Connect PM5 or try the demo');
  show('connection', next === 'demo' ? 'DEMO DATA' : next === 'PM5' ? 'PM5 CONNECTED' : 'OFFLINE');
  show('source', next === 'offline' ? ' · No data source' : ` · ${next === 'demo' ? 'Simulated data' : 'Live PM5 data'}`);
  show('session-state', next === 'offline' ? 'Ready to row' : next === 'demo' ? 'Demo session' : 'Ready · start rowing');
  $('live-dot').classList.toggle('active', next !== 'offline');
  show('connect', next === 'PM5' ? 'Disconnect PM5' : 'Connect PM5 ↗');
  show('demo', next === 'demo' ? 'Stop demo' : 'Try a demo session');
  $('record').disabled = next === 'offline';
  if (next === 'offline') { wakeLock?.release().catch(() => {}); wakeLock = null; }
  else acquireWakeLock();
}
function clearTelemetry() { live = {}; metricTime = packetTime = strokeTime = 0; windowStrokes = []; lastStroke = null; rower.motion.reset(); curveTime=0; hrHistory=[]; lastHRTime=0; paintHR(); paintCurve(null); show('monitor-time','00:00'); show('monitor-distance','0'); paint(); paintStroke(null); paintCoach(); }
function paint() {
  const fresh = mode === 'demo' || Date.now() - metricTime < 5000;
  const pace=fresh ? split(live.pace) : '—:—'; show('pace',pace); mirror('pace',pace);
  for (const k of ['rate','power','hr']) { const value=fresh ? num(live[k]) : '—'; show(k,value); mirror(k,value); }
  show('hr-status',fresh && Number.isFinite(live.hr)?(mode==='demo'?'Demo HR':'PM5 sensor'):'Pair sensor to PM5');
  show('drag', num(live.drag));
}
function paintStroke(s) {
  show('stroke-number', s ? `# ${s.count}` : '# —');
  for (const [id, key, suffix, digits] of [['drive','drive',' s drive',2],['recovery','recovery',' s recovery',2],['length','driveLength',' m',2],['work','work',' J',0]]) show(id, `${num(s?.[key],digits)}${suffix}`);
  show('force', s ? `${num(s.peakForceLbs * 4.44822)} N` : '— N');
  const portion = s ? s.drive / (s.drive + s.recovery) * 100 : 33;
  $('drive-bar').style.width = `${portion}%`; $('recovery-bar').style.width = `${100 - portion}%`;
}
function paintCoach() {
  const a = analyse(windowStrokes, settings());
  show('score', a.score ?? '—'); $('score-ring').style.setProperty('--score', `${a.score ?? 0}%`);
  show('cue-title', a.title); show('cue', a.cue); show('sample', `${a.sample} / 12 strokes`);
  show('consistency', a.consistency == null ? '—' : `${a.consistency} / 100`);
  show('rhythm', a.rhythm == null ? '—' : `${a.rhythm} / 100`);
  show('ratio', a.ratio ? `${a.ratio.toFixed(1)} : 1` : '—');
  if ($('voice').checked && a.score != null && a.title !== lastCue && Date.now() - lastSpoken >= 20000 && !document.hidden && 'speechSynthesis' in window) {
    speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(`${a.title}. ${a.cue}`)); lastSpoken = Date.now(); lastCue = a.title;
  }
  return a;
}
function paintRecording() {
  const result = (recording || pausedRecording)?.finish();
  show('time', clock(result?.duration || 0)); show('distance', num(result?.distance || 0)); show('strokes', recording?.strokes.length || 0);
  show('recording-badge', recording ? '● Recording' : 'Not recording');
  show('record', recording ? 'Pause recording' : 'Start recording');
  $('end').disabled = !recording;
}
function onStroke(s) {
  if (!validStroke(s)) return;
  if (lastStroke && (s.elapsed < lastStroke.elapsed || s.distance < lastStroke.distance || s.count < lastStroke.count)) {
    finishRecording(); windowStrokes = []; lastStroke = null; notice('PM5 workout counters reset. The previous recording was saved; start recording for this piece.');
  }
  if (lastStroke?.count === s.count) return;
  if (lastStroke && (s.elapsed - lastStroke.elapsed > 10 || Date.now() - strokeTime > 10000)) windowStrokes = [];
  lastStroke = s; strokeTime = Date.now(); rower.motion.timing(s); if(mode==='demo')rower.motion.demo(performance.now());
  const freshMetrics = Date.now() - metricTime < 5000;
  const snapshot = { ...s, pace: freshMetrics ? live.pace : null, rate: freshMetrics ? live.rate : null, power: freshMetrics ? live.power : null, hr: freshMetrics ? live.hr : null, drag: live.drag ?? null, receivedAt: new Date().toISOString() };
  windowStrokes.push(snapshot); windowStrokes = windowStrokes.slice(-40);
  const a = paintCoach(); snapshot.score = a.score;
  if (recording) { recording.add(snapshot); paintRecording(); }
  paintStroke(s); show('session-state', mode === 'demo' ? 'Demo session' : 'Rowing · live feedback');
}
function paintCurve(samples, source) {
  const valid=samples?.length>=5 && samples.every(v=>Number.isFinite(v)&&v>=0) && Math.max(...samples)>0;
  $('force-empty').style.display=valid?'none':'';
  if(!valid){$('force-line').setAttribute('d','');$('force-fill').setAttribute('d','');show('curve-source','NO CURVE YET');show('curve-status','Waiting for the next completed drive.');return;}
  const peak=Math.max(...samples);
  const path=samples.map((v,i)=>`${i?'L':'M'}${30+i*460/(samples.length-1)},${155-v/peak*140}`).join(' ');
  $('force-line').setAttribute('d',path);$('force-fill').setAttribute('d',`${path} L490,155 L30,155 Z`);
  show('curve-source',source==='demo'?'SIMULATED':'PM5 FORCE');
  show('curve-status',source==='demo'?'Simulated force profile · demo data':`${samples.length} measured samples · latest completed drive`);
  curveTime=Date.now();
}
function paintHR() {
  const now=Date.now(); hrHistory=hrHistory.filter(p=>now-p.time<=120000);
  if(hrHistory.length && now-hrHistory.at(-1).time>5000 && hrHistory.at(-1).value!==null)hrHistory.push({time:now,value:null});
  const values=hrHistory.filter(p=>p.value!==null).map(p=>p.value);
  show('hr-average',values.length?num(values.reduce((a,b)=>a+b,0)/values.length):'—');show('hr-max',values.length?num(Math.max(...values)):'—');
  const lo=values.length?Math.min(...values)-5:0,hi=values.length?Math.max(...values)+5:1;
  let path='',connected=false;
  for(const point of hrHistory){if(point.value===null){connected=false;continue;}const x=220-(now-point.time)/120000*220,y=58-(point.value-lo)/(hi-lo)*50;path+=`${connected?' L':' M'}${x},${y}`;connected=true;}
  $('hr-line').setAttribute('d',path);
}
function packet(type, data) {
  if(type==='curve-diagnostics'){
    curveDiagnostics=structuredClone(data);
    const current=recording||pausedRecording;if(current)current.curveDiagnostics=structuredClone(data);
    show('curve-diagnostics',JSON.stringify(data,null,2));
    return;
  }
  if(type==='curve-status'){show('curve-status',data.message);return;}
  if(type==='curve'){paintCurve(data.samples,mode);if(recording){recording.curves??=[];recording.curves.push({receivedAt:new Date().toISOString(),samples:data.samples});}return;}
  if(type==='error'){notice(data.message,true);return;}
  packetTime=Date.now();
  if(type==='35')onStroke(data);
  else {
    live={...live,...data};
    if(type==='32'){
      metricTime=Date.now();
      if(metricTime-lastHRTime>=1000){hrHistory.push({time:metricTime,value:data.hr});lastHRTime=metricTime;}else if(hrHistory.length){hrHistory[hrHistory.length-1]={time:metricTime,value:data.hr};}paintHR();
    }
    if(type==='31'){
      show('monitor-time',clock(data.elapsed));show('monitor-distance',num(data.distance));
      if(mode==='PM5')rower.motion.phase(data.strokeState,performance.now());
    }
    paint();
  }
}
const pm5 = new PM5(packet, () => {
  finishRecording(); setMode('offline'); clearTelemetry(); notice('PM5 disconnected. Received strokes have been saved. Reconnect to start another recording.', true);
});
function stopSource() { clearTimeout(demoTimer); demoTimer = null; pm5.disconnect(); finishRecording(); setMode('offline'); clearTelemetry(); window.speechSynthesis?.cancel(); }
$('connect').addEventListener('click', async () => {
  if (connecting) return;
  if (mode === 'PM5') { stopSource(); notice('PM5 disconnected.'); return; }
  stopSource(); connecting = true; $('connect').disabled = $('demo').disabled = true; show('connect','Connecting…');
  try { const name = await pm5.connect(); setMode('PM5'); $('settings-dialog').close(); notice(`Connected to ${name}. Begin rowing, then start recording when ready.`); }
  catch (e) { setMode('offline'); notice(e.name === 'NotFoundError' ? 'No monitor selected. Turn on PM5 wireless and try again.' : e.message, true); }
  finally { connecting = false; $('connect').disabled = $('demo').disabled = false; }
});
function demoStroke() {
  if (mode !== 'demo') return;
  const cycle = 60 / settings().targetRate;
  const wave = Math.sin(demoCount / 8), noisy = demoCount % 40 >= 20 && demoCount % 40 < 28;
  const drive = .82 + wave * .025, recovery = noisy ? Math.max(.6, cycle - drive - .4) : cycle - drive;
  const work = 470 + wave * 12 + (noisy ? Math.sin(demoCount * 2) * 120 : 0);
  const power = work / (drive + recovery), pace = 500 * (2.8 / power) ** (1/3), distance = (drive + recovery) * 500 / pace;
  demoElapsed += drive + recovery; demoDistance += distance; demoCount++;
  packet('32', { elapsed: demoElapsed, rate: Math.round(60 / (drive + recovery)), pace, power, hr: Math.round(132 + Math.sin(demoCount / 12) * 5) });
  packet('31', { elapsed: demoElapsed, distance: demoDistance, drag: 120 });
  packet('35', { elapsed: demoElapsed, distance: demoDistance, count: demoCount, drive, recovery, driveLength: 1.32 + wave * .02, work, strokeDistance: distance, peakForceLbs: 95 + wave * 4, averageForceLbs: 64 + wave * 3 });
  packet('curve',{samples:Array.from({length:50},(_,i)=>Math.round(Math.sin(Math.PI*i/49)**1.4*(1+(noisy?.15:0)*Math.sin(i*.5))*400))});
  demoTimer = setTimeout(demoStroke, (drive + recovery) * 1000);
}
$('demo').addEventListener('click', () => {
  if (mode === 'demo') { stopSource(); notice('Demo stopped. Any recorded simulated strokes have been saved.'); return; }
  stopSource(); demoCount = demoElapsed = demoDistance = 0; setMode('demo'); $('settings-dialog').close(); notice('DEMO · All metrics are simulated. Rhythm occasionally varies so you can explore the coaching.'); demoStroke();
});
let pausedRecording = null;
$('record').addEventListener('click', () => {
  if (recording) { pausedRecording = recording; recording = null; show('record','Resume recording'); show('recording-badge','Paused'); $('end').disabled = false; }
  else { recording = pausedRecording || new Recording(mode, settings()); if(mode==='PM5')recording.curveDiagnostics=structuredClone(curveDiagnostics); pausedRecording = null; paintRecording(); acquireWakeLock(); }
});
function finishRecording() {
  const current = recording || pausedRecording;
  if (!current) return;
  const result = current.finish(); recording = pausedRecording = null;
  if (result) {
    saved.unshift(result); saved = saved.slice(0,10);
    try { localStorage.setItem('erg-buddy-sessions', JSON.stringify(saved)); }
    catch { notice('Could not save to browser storage. Download the session from the rowing log before closing this page.', true); }
    renderSessions();
  }
  paintRecording();
}
$('end').addEventListener('click', () => { finishRecording(); notice('Recording finished. Download JSON or CSV from your rowing log.'); });
function download(session, format) {
  const blob = new Blob([format === 'json' ? JSON.stringify(session,null,2) : csv(session)], { type: format === 'json' ? 'application/json' : 'text/csv' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `erg-buddy-${session.source.toLowerCase()}-${session.startedAt.replace(/[:.]/g,'-')}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderSessions() {
  $('sessions').replaceChildren(); $('export').disabled = !saved.length;
  if (!saved.length) { const p = document.createElement('p'); p.className='subtle'; p.textContent='Your first session starts here.'; $('sessions').append(p); }
  for (const session of saved) {
    const row = document.createElement('div'); row.className='saved-session';
    const text = document.createElement('div'), title = document.createElement('strong'), small = document.createElement('small');
    title.textContent = `${new Date(session.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${clock(session.duration)} · ${num(session.distance)} m`;
    small.textContent = `${session.source === 'demo' ? 'DEMO · simulated' : 'PM5'} · ${session.strokes.length} strokes`;
    text.append(title,small); row.append(text);
    for (const format of ['json','csv']) { const button=document.createElement('button'); button.className='quiet'; button.textContent=format.toUpperCase(); button.setAttribute('aria-label',`Download ${format.toUpperCase()} for ${title.textContent}`); button.onclick=()=>download(session,format); row.append(button); }
    $('sessions').append(row);
  }
}
$('export').onclick = () => { if (saved[0]) download(saved[0],'json'); };
$('tools').onclick=()=>$('settings-dialog').showModal();
$('close-tools').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('click',event=>{if(event.target===$('settings-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('Fullscreen is unavailable. The session still fits the browser viewport.');}};
for (const id of ['target-rate','target-ratio']) $(id).addEventListener('change', () => {
  if (!$(id).checkValidity() || !$(id).value) $(id).value = id === 'target-rate' ? '22' : '2';
  if (recording || pausedRecording) finishRecording();
  paintCoach();
});
$('voice').addEventListener('change', () => { if (!('speechSynthesis' in window)) { $('voice').checked=false; notice('Speech coaching is unavailable in this browser.'); } else if (!$('voice').checked) speechSynthesis.cancel(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) acquireWakeLock(); });
window.addEventListener('pagehide', stopSource);
setInterval(() => {
  if(mode!=='offline') { paintHR(); if(curveTime && Date.now()-curveTime>10000){paintCurve(null);show('curve-status','No recent force curve. Waiting for the next drive.');curveTime=0;} }
  if (mode !== 'PM5') return;
  paint();
  if (packetTime && Date.now() - packetTime > 5000) { show('session-state','Waiting for PM5 data'); $('live-dot').classList.remove('active'); }
  else $('live-dot').classList.add('active');
  if (strokeTime && Date.now() - strokeTime > 10000 && windowStrokes.length) { windowStrokes = []; paintCoach(); paintStroke(null); }
},1000);
loadSaved(); renderSessions(); setMode('offline'); paintRecording();
