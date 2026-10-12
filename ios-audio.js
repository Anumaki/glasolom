/* GLASOLOM iOS microphone/audio compatibility path.
   Safari sometimes bypasses Web Audio effects on a hidden <video> backed by MediaRecorder MP4.
   For audio-only media we decode the original file, apply the selected DSP offline, and
   play/export the processed PCM as WAV. Video is left on the existing playback path. */
(function(){
'use strict';
const iphone=/iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
let decoded=null,decodedFile=null,previewUrl=null,previewSignature='',pending=false,version=0;
function handles(f,video){return !!(iphone && f && !video);}
function status(key,vars={},warn=false){setStatus(t(key,vars),warn);}
function markDirty(){
  if(!handles(file,isVideo))return;
  previewSignature='';
  if(!media.paused){media.pause();status('iosEffectChanged');}
}
function reset(){
  version++;decoded=null;decodedFile=null;previewSignature='';pending=false;
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
}
function settings(){
  const base=presets[currentPreset];
  return {pitch:+controls.pitch.value,flanger:+controls.flanger.value/100,
    ring:+controls.ring.value/100,presence:base.presence,treble:base.treble,
    flangeHz:base.flangeHz,ringHz:base.ringHz};
}
async function decodeOriginal(){
  if(decodedFile===file&&decoded)return decoded;
  const requestedFile=file;
  status('iosDecoding');
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)throw Error(t('iosUnavailable'));
  const context=new C();
  try {
    // Avoid piping Safari's MediaRecorder output through MediaElementAudioSourceNode.
    const array=await requestedFile.arrayBuffer();
    const result=await context.decodeAudioData(array);
    if(requestedFile!==file)throw Error(t('iosFileChanged'));
    decoded=result;decodedFile=requestedFile;
    return result;
  }finally{try{await context.close();}catch(e){}}
}
function signature(){
  const v=settings();return JSON.stringify([v.pitch,v.flanger,v.ring,
    v.presence,v.treble,v.flangeHz,v.ringHz]);
}
function pcmToWav(buffer,spec,startTime,endTime,callback){
  const sr=buffer.sampleRate,channels=Math.min(2,buffer.numberOfChannels);
  const first=Math.floor(Math.max(0,startTime)*sr);
  const last=Math.min(buffer.length,Math.ceil(endTime*sr));
  const length=Math.max(0,last-first);
  if(length<=0)throw Error(t('invalidRange'));
  // Keep peak mobile memory predictable. For long source media use a desktop.
  if(44+length*channels*2>180*1024*1024)throw Error(t('iosTooLong'));
  const arr=new ArrayBuffer(44+length*channels*2),view=new DataView(arr);
  const w=(p,v)=>{for(let i=0;i<v.length;i++)view.setUint8(p+i,v.charCodeAt(i));};
  w(0,'RIFF');view.setUint32(4,arr.byteLength-8,true);w(8,'WAVE');
  w(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,channels,true);view.setUint32(24,sr,true);
  view.setUint32(28,sr*channels*2,true);view.setUint16(32,channels*2,true);
  view.setUint16(34,16,true);w(36,'data');view.setUint32(40,length*channels*2,true);
  const sources=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  const ratio=Math.pow(2,spec.pitch/12),grain=Math.max(128,Math.round(sr*.085));
  const ringSize=65536, pitchBuffers=Array.from({length:channels},()=>new Float32Array(ringSize));
  const flangeSize=Math.max(4096,Math.round(sr*.07));
  const flangeBuffers=Array.from({length:channels},()=>new Float32Array(flangeSize));
  const states=Array.from({length:channels},()=>({prevX:0,prevHP:0,low:0}));
  const hpAlpha=1/(1+2*Math.PI*75/sr),lpAlpha=1-Math.exp(-2*Math.PI*1900/sr);
  const hiGain=Math.pow(10,spec.treble/40),midGain=Math.pow(10,spec.presence/60);
  const twoPi=2*Math.PI;
  let writePos=0;
  function sampleRead(b,index){
    const v=((index%ringSize)+ringSize)%ringSize,lo=Math.floor(v),frac=v-lo;
    return b[lo]*(1-frac)+b[(lo+1)%ringSize]*frac;
  }
  async function work(){
    const stride=32768;
    for(let batch=0;batch<length;batch+=stride){
      const stop=Math.min(length,batch+stride);
      for(let i=batch;i<stop;i++){
        const phase=(i%grain)/grain,phase2=(phase+.5)%1;
        const delta=Math.abs(ratio-1)*grain;
        const delay1=256+(ratio>=1?1-phase:phase)*delta;
        const delay2=256+(ratio>=1?1-phase2:phase2)*delta;
        const weight1=Math.sin(Math.PI*phase)**2,weight2=Math.sin(Math.PI*phase2)**2;
        const totalWeight=weight1+weight2+1e-8;
        const time=i/sr;
        const flangeDelay=Math.round(sr*(.008+.005*Math.sin(twoPi*spec.flangeHz*time)));
        const flangeReadIndex=((i-flangeDelay)%flangeSize+flangeSize)%flangeSize;
        const ringGain=(1-spec.ring*.46)+spec.ring*.88*Math.sin(twoPi*spec.ringHz*time);
        for(let ch=0;ch<channels;ch++){
          const src=sources[ch],b=pitchBuffers[ch],fb=flangeBuffers[ch];
          const state=states[ch],x=src[first+i]||0;
          b[writePos]=x;
          const y=Math.abs(ratio-1)<.003 ? x :
            (sampleRead(b,writePos-delay1)*weight1+sampleRead(b,writePos-delay2)*weight2)/totalWeight;
          const hp=hpAlpha*(state.prevHP+y-state.prevX);
          state.prevX=y;state.prevHP=hp;
          state.low+=(hp-state.low)*lpAlpha;
          const eq=(state.low+(hp-state.low)*hiGain)*midGain;
          const delayed=fb[flangeReadIndex];
          fb[i%flangeSize]=eq;
          const value=(eq+delayed*spec.flanger*.84)*ringGain*.78;
          // Soft limiter and PCM 16-bit.
          const limited=Math.max(-1,Math.min(1,value/(1+.18*Math.abs(value))));
          view.setInt16(44+(i*channels+ch)*2,Math.round(limited*(limited<0?32768:32767)),true);
        }
        writePos=(writePos+1)%ringSize;
      }
      if(callback)callback(Math.round(stop/length*100));
      // Yield to Safari to keep the page interactive throughout longer recordings.
      if(stop<length)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return new Blob([arr],{type:'audio/wav'});
  }
  return work();
}
async function render(start,end){
  const data=await decodeOriginal();
  const params=settings();
  return pcmToWav(data,params,start,end,percent=>status('iosProcessing',{progress:percent}));
}
function waitMeta(){
  return new Promise((resolve,reject)=>{
    if(media.readyState>=1&&Number.isFinite(media.duration))return resolve();
    const timeout=setTimeout(()=>{cleanup();reject(Error(t('mediaNotReady')));},10000);
    function cleanup(){clearTimeout(timeout);media.removeEventListener('loadedmetadata',done);media.removeEventListener('error',fail);}
    function done(){cleanup();resolve();}
    function fail(){cleanup();reject(Error(t('decodeError')));}
    media.addEventListener('loadedmetadata',done);media.addEventListener('error',fail);
  });
}
async function preview(){
  if(!handles(file,isVideo)||pending)return;
  if(!media.paused&&previewSignature===signature()){media.pause();return;}
  const key=signature(),token=version;
  pending=true;$('play').disabled=true;
  try{
    const data=await decodeOriginal();
    if(key!==previewSignature || !previewUrl) {
      const wav=await render(0,data.duration);
      if(token!==version || key!==signature())return;
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=URL.createObjectURL(wav);
      media.pause();media.src=previewUrl;media.load();
      await waitMeta();
      previewSignature=key;
    }
    if(token===version){
      const start=Math.min(Math.max(0,media.currentTime),Math.max(0,media.duration-.05));
      media.currentTime=start;
      await media.play();
      status('iosReady');
    }
  }catch(err){console.error('GLASOLOM iOS audio:',err);status('iosError',{message:err.message},true);}
  finally{pending=false;$('play').disabled=false;}
}
async function exportAudio(onlyRange){
  if(!handles(file,isVideo)||pending)return;
  pending=true;$('export').disabled=true;$('exportRange').disabled=true;
  try{
    const data=await decodeOriginal();
    const start=onlyRange?Math.max(0,rangeIn):0;
    const end=onlyRange?(rangeOut===null?data.duration:Math.min(rangeOut,data.duration)):data.duration;
    if(end-start<.1)throw Error(t('invalidRange'));
    const wav=await render(start,end);
    const name=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u0400-\u04FF]+/g,'_');
    const a=document.createElement('a');const url=URL.createObjectURL(wav);
    a.href=url;a.download=(name||'glasolom')+'_GLASOLOM'+(onlyRange?'_IN-OUT':'')+'.wav';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('iosSaved');
  }catch(err){console.error('GLASOLOM iOS export:',err);status('iosError',{message:err.message},true);}
  finally{pending=false;$('export').disabled=false;$('exportRange').disabled=false;}
}
window.GLASOLOM_iOS={handles,reset,markDirty,preview,exportAudio};
})();