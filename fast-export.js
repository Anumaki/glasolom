/* GLASOLOM fast IN–OUT export. Processes files locally, without real-time playback.
   Mediabunny 1.61.3 (MPL-2.0) loaded on demand from a pinned CDN URL. */
'use strict';
const GLASOLOM_MEDIA_MODULE='https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs';
let activeFastExport=false;

// Streamed per-sample effects: small, bounded buffers even for hour-long recordings.
class OfflineVoiceDSP {
  constructor(config, sampleRate, channels) {
    this.sr=sampleRate;this.channels=channels;
    this.pitch=Math.pow(2,config.pitch/12);
    this.flange=config.flanger/100;
    this.ring=config.ring/100;
    this.flangeHz=config.flangeHz;
    this.ringHz=config.ringHz;
    this.trebleGain=Math.pow(10,config.treble/40);
    this.presenceGain=Math.pow(10,config.presence/60);
    this.len=65536;this.grain=Math.max(512,Math.round(.085*sampleRate));
    this.write=0;this.phase=0;this.sampleIndex=0;
    this.pitchBuffers=Array.from({length:channels},()=>new Float32Array(this.len));
    this.flangeBuffers=Array.from({length:channels},()=>new Float32Array(8192));
    this.highPass=Array.from({length:channels},()=>({x:0,y:0,low:0}));
    this.hpAlpha=1/(1+2*Math.PI*75/sampleRate);
    this.trebleAlpha=1-Math.exp(-2*Math.PI*1900/sampleRate);
  }
  process(inputBuffer) {
    const n=inputBuffer.length,c=this.channels,channels=[];
    const output=new AudioBuffer({length:n,numberOfChannels:c,sampleRate:this.sr});
    for(let k=0;k<c;k++)channels.push([inputBuffer.getChannelData(Math.min(k,inputBuffer.numberOfChannels-1)),output.getChannelData(k)]);
    const diff=Math.abs(this.pitch-1)*this.grain,len=this.len,grain=this.grain;
    const flangeLength=this.flangeBuffers[0].length,wet=this.flange*.84,ring=this.ring;
    const twoPi=2*Math.PI;
    for(let i=0;i<n;i++) {
      const time=this.sampleIndex/this.sr,p=this.phase/grain,p2=(p+.5)%1;
      const d1=256+(this.pitch>=1?(1-p):p)*diff,d2=256+(this.pitch>=1?(1-p2):p2)*diff;
      const w1=Math.sin(Math.PI*p)**2,w2=Math.sin(Math.PI*p2)**2,den=w1+w2+1e-10;
      const fDelay=this.sr*(.008+.005*Math.sin(twoPi*this.flangeHz*time));
      const flangeIndex=((this.sampleIndex-Math.round(fDelay))%flangeLength+flangeLength)%flangeLength;
      const rm=1-ring*.46+ring*.88*Math.sin(twoPi*this.ringHz*time);
      for(let k=0;k<c;k++){
        const [src,dst]=channels[k],x=src[i],b=this.pitchBuffers[k],fb=this.flangeBuffers[k],hp=this.highPass[k];b[this.write]=x;
        let y=x;
        if(Math.abs(this.pitch-1)>.003) {
          const a1=this.write-d1,a2=this.write-d2;
          const read=(v)=>{const z=((v%len)+len)%len,j=Math.floor(z),f=z-j;return b[j]*(1-f)+b[(j+1)%len]*f;};
          y=(read(a1)*w1+read(a2)*w2)/den;
        }
        const high=this.hpAlpha*(hp.y+y-hp.x);hp.x=y;hp.y=high;
        hp.low+=(high-hp.low)*this.trebleAlpha;
        y=(hp.low+(high-hp.low)*this.trebleGain)*this.presenceGain;
        const delayed=fb[flangeIndex];
        fb[this.sampleIndex%flangeLength]=y;
        y=(y+delayed*wet)*rm*.75;
        // Gentle soft limiting to avoid clipping across presets.
        dst[i]=Math.max(-1,Math.min(1,y/(1+Math.abs(y)*.18)));
      }
      this.write=(this.write+1)%len;
      this.phase=(this.phase+1)%grain;
      this.sampleIndex++;
    }
    return output;
  }
}
function safeBaseName(filename) {
  return filename.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u0400-\u04FF]+/g,'_').slice(0,130)||'glasolom';
}
function downloadBuffer(buffer,fileName,mime){
  const url=URL.createObjectURL(new Blob([buffer],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function runFastExport(state) {
  if(activeFastExport)return;
  activeFastExport=true;
  const {file,isVideo,selection,settings,onStatus,onBusy}=state;
  const start=selection.start,end=selection.end;
  const isWebm=isVideo&&/\.webm$/i.test(file.name);
  const ext=isVideo?(isWebm?'webm':'mp4'):'wav';
  const mime=isVideo?(isWebm?'video/webm':'video/mp4'):'audio/wav';
  const outName=safeBaseName(file.name)+'_GLASOLOM_FAST_'+start.toFixed(2)+'-'+end.toFixed(2)+'.'+ext;
  let saveStream=null,conv=null, input=null,output=null;
  let onDisk=false;
  onBusy(true);
  try {
    // For long or large files, stream to the disk instead of holding the full result in memory.
    // Request must happen before the first awaited network import (user activation).
    let fileHandle=null;
    if(window.showSaveFilePicker&&(file.size>50_000_000||(end-start)>180)){
      try{
        fileHandle=await window.showSaveFilePicker({
          suggestedName:outName,
          types:[{description:isVideo?'Processed video':'Processed audio',accept:{[mime]:['.'+ext]}}]
        });
      }catch(err){
        if(err.name==='AbortError'){onStatus(state.translate('fastCancelled'),true);return;}
        // Use in-memory fallback if picker is blocked; for large files this may fail.
        console.warn('GLASOLOM save picker fallback:',err);
      }
    }
    if(fileHandle){saveStream=await fileHandle.createWritable();onDisk=true;}
    onStatus(state.translate('fastLoading'));
    const mb=await import(GLASOLOM_MEDIA_MODULE);
    const {Input,Output,Conversion,BlobSource,ALL_FORMATS,BufferTarget,StreamTarget,
      Mp4OutputFormat,WebMOutputFormat,WavOutputFormat,AudioSample}=mb;
    input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
    const format=isVideo?(isWebm?new WebMOutputFormat():new Mp4OutputFormat()):new WavOutputFormat();
    const target=saveStream?new StreamTarget(saveStream):new BufferTarget();
    output=new Output({format,target});
    let engine=null;
    const p={...settings};
    const audioOpts={
      forceTranscode:true,
      process:(sample)=>{
        const buffer=sample.toAudioBuffer();
        if(!engine || engine.sr!==buffer.sampleRate || engine.channels!==buffer.numberOfChannels)
          engine=new OfflineVoiceDSP(p,buffer.sampleRate,buffer.numberOfChannels);
        const transformed=engine.process(buffer);
        return AudioSample.fromAudioBuffer(transformed,sample.timestamp);
      }
    };
    if(isVideo) audioOpts.codec=isWebm?'opus':'aac';
    const conversion=await Conversion.init({
      input,output,tracks:'primary',trim:{start,end},
      audio:audioOpts,
      video: isVideo?{}:{discard:true}
    });
    conv=conversion;
    if(!conversion.isValid){
      const details=conversion.discardedTracks.map(x=>x.reason).join(', ');
      throw Error(state.translate('fastCodec')+(details?' ('+details+')':''));
    }
    // A source with no audio isn't a voice remix. Prevent exporting unchanged sound.
    const sourceAudio=await input.getPrimaryAudioTrack();
    if(!sourceAudio)throw Error(state.translate('fastNoAudio'));
    conversion.onProgress=(progress)=>{
      const percent=Math.max(0,Math.min(99,Math.round(progress*100)));
      onStatus(state.translate('fastProgress',{progress:percent}));
    };
    await conversion.execute();
    onStatus(state.translate('fastFinalizing'));
    if(saveStream){
      try{await saveStream.close();}catch(err){
        // StreamTarget can finalize the writable automatically.
        if(!/closed|closing|invalid state/i.test(String(err)))console.warn(err);
      }
    }else{
      const data=output.target.buffer;
      if(!data || data.byteLength===0)throw Error(state.translate('noExportData'));
      downloadBuffer(data,outName,mime);
    }
    onStatus(state.translate('fastDone',{name:outName}));
  }catch(err){
    console.error('GLASOLOM fast export:',err);
    onStatus(state.translate('fastError',{message:err.message||String(err)}),true);
    if(saveStream)try{await saveStream.abort();}catch(e){}
  }finally{
    if(input)try{input.dispose();}catch(e){}
    if(output&&conv&&conv.state!=='done')try{await conv.cancel();}catch(e){}
    activeFastExport=false;onBusy(false);
  }
}
window.GLASOLOM_fastExport=runFastExport;
