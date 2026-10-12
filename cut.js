/* GLASOLOM Cut editor — client-side, no uploads. */
'use strict';
const CUT_MIN = 0.10; // seconds
const cut = { start: 0, end: 0, duration: 0, ready: false };
let cutSeekTimeout = null;
const cutIds = ['cutStart','cutEnd','cutStartNumber','cutEndNumber','markIn','markOut','previewCut','resetCut'];
const cutEl = id => document.getElementById(id);
const cutClamp = (v,lo,hi) => Math.min(hi,Math.max(lo,Number(v)||0));
function cutStamp(v) {
  const mins = Math.floor(v/60), secs = Math.floor(v%60), cs = Math.floor((v%1)*100);
  return String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0')+'.'+String(cs).padStart(2,'0');
}
function cutControls(recordingNow) {
  for(const id of cutIds) cutEl(id).disabled = !cut.ready || !!recordingNow;
  const exportButton=cutEl('exportCut');if(exportButton)exportButton.disabled=!cut.ready || !!recordingNow || exportStarting;
}
function syncCutUI() {
  const d=cut.duration, start=cut.start, end=cut.end;
  if(!cut.ready) {
    cutEl('cutSummary').textContent=t('cutAwaiting');
    cutEl('cutHighlight').style.left='0%';
    cutEl('cutHighlight').style.width='0%';
    cutControls(false);
    return;
  }
  for(const id of ['cutStart','cutEnd']) {cutEl(id).max=String(d);}
  cutEl('cutStart').value=String(start);
  cutEl('cutEnd').value=String(end);
  cutEl('cutStartNumber').max=String(d);
  cutEl('cutEndNumber').max=String(d);
  cutEl('cutStartNumber').value=start.toFixed(2);
  cutEl('cutEndNumber').value=end.toFixed(2);
  cutEl('cutSummary').textContent=cutStamp(start)+' – '+cutStamp(end)+' ('+cutStamp(end-start)+')';
  cutEl('cutHighlight').style.left=(100*start/d)+'%';
  cutEl('cutHighlight').style.width=(100*(end-start)/d)+'%';
  cutControls(recording);
}
function initializeCut() {
  const d=media.duration;
  if(!Number.isFinite(d)||d<=0) {resetCutForFile();return;}
  cut.ready=true;
  cut.duration=d;cut.start=0;cut.end=d;
  syncCutUI();
}
function resetCutForFile() {
  cut.ready=false;cut.start=0;cut.end=0;cut.duration=0;
  syncCutUI();
}
function updateCut(side,value) {
  if(!cut.ready||recording) return;
  const min=Math.min(CUT_MIN,cut.duration/2);
  if(side==='start') cut.start=cutClamp(value,0,cut.end-min);
  else cut.end=cutClamp(value,cut.start+min,cut.duration);
  syncCutUI();
}
function getCutSelection() {
  if(!cut.ready||cut.end-cut.start<Math.min(CUT_MIN,cut.duration/2)-.001) throw Error(t('cutUnavailable'));
  return {start:cut.start,end:cut.end};
}
async function jumpToCutStart(){
  const range=getCutSelection();
  if(Math.abs(media.currentTime-range.start)<.015&&!media.seeking)return;
  await new Promise((resolve,reject)=>{
    let finished=false;
    const cleanup=()=>{
      if(finished)return false;
      finished=true;clearTimeout(timer);media.removeEventListener('seeked',done);
      media.removeEventListener('error',fail);return true;
    };
    const done=()=>{if(cleanup())resolve();};
    const fail=()=>{if(cleanup())reject(Error(t('cutSeekError')));};
    const timer=setTimeout(fail,10000);
    media.addEventListener('seeked',done);
    media.addEventListener('error',fail);
    try {media.currentTime=range.start;}catch(e){if(cleanup())reject(e);}
    if(!media.seeking && Math.abs(media.currentTime-range.start)<.015)done();
  });
}
function enforceCutEnd(){
  if(!cut.ready||media.paused||media.seeking)return;
  if(recording && exportMode==='manual')return;
  if(media.currentTime>=cut.end-.015) {
    if(recording && exportMode==='cut')stopRecording();
    else if(!recording)media.pause();
  }
}
for(const [id,side] of [['cutStart','start'],['cutEnd','end'],['cutStartNumber','start'],['cutEndNumber','end']]) {
  cutEl(id).addEventListener(id.includes('Number')?'change':'input',event=>updateCut(side,event.target.value));
}
cutEl('markIn').addEventListener('click',()=>updateCut('start',media.currentTime));
cutEl('markOut').addEventListener('click',()=>updateCut('end',media.currentTime));
cutEl('resetCut').addEventListener('click',()=>{
  if(!cut.ready||recording)return;
  cut.start=0;cut.end=cut.duration;syncCutUI();
});
cutEl('previewCut').addEventListener('click',async()=>{
  if(!cut.ready||recording)return;
  try{
    await initAudio();media.pause();await jumpToCutStart();await media.play();
  }catch(e){setStatus(t('playError',{message:e.message}),true);}
});
media.addEventListener('timeupdate',enforceCutEnd);
syncCutUI();