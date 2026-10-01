// The breeze is a separate, quiet bed. This does not use the one-shot cue channel.
export const CAT_WIND_FILE='assets/cats/audio/wind-bed.wav';

export function catWindGain(outputGain,clock=0,{night=false,duck=false}={}){
 const breath=.78+.14*Math.sin(clock*.17)+.08*Math.sin(clock*.051+1.2);
 return outputGain*.07*breath*(night?.85:1)*(duck?.58:1);
}

/** Overlap the end into the beginning, then start beyond that overlap. */
export function prepareCatWindSample(sample){
 const input=sample?.data,rate=sample?.sampleRate;
 if(!(input instanceof Float32Array)||!Number.isFinite(rate)||rate<8000||rate>96000||input.length<rate*.5||input.length>rate*30)throw new Error('Invalid breeze sample');
 const blend=Math.min(Math.floor(rate*.4),Math.floor(input.length/4)),data=input.slice(blend);
 let peak=0;for(const value of input){if(!Number.isFinite(value))throw new Error('Invalid breeze PCM');peak=Math.max(peak,Math.abs(value))}
 const gain=peak>.23?.23/peak:1;
 for(let i=0;i<data.length;i++)data[i]*=gain;
 for(let i=0;i<blend;i++){
  const t=i/(blend-1),a=t*t*(3-2*t),at=data.length-blend+i;
  data[at]=gain*(input[input.length-blend+i]*(1-a)+input[i]*a);
 }
 return {data,sampleRate:rate};
}

// Missing field recordings remain silent; never substitute a noise generator.
