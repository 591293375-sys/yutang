from pathlib import Path
import wave,array,math,json
out=Path(__file__).resolve().parents[1]/'public/assets'
for name in ['rain','wind','thunder']:
 with wave.open('work/'+name+'-source.wav','rb') as src:
  rate,channels,n=src.getframerate(),src.getnchannels(),src.getnframes()
  if name!='thunder':src.setpos(12*rate);samples=array.array('h',src.readframes(48*rate))
  else:samples=array.array('h',src.readframes(n))
 if name!='thunder':
  overlap=3*rate;middle=samples[overlap*channels:-overlap*channels];blend=array.array('h')
  for f in range(overlap):
   a=math.cos(f/(overlap-1)*math.pi/2);b=math.sin(f/(overlap-1)*math.pi/2)
   for c in range(channels):
    v=samples[(len(samples)//channels-overlap+f)*channels+c]*a+samples[f*channels+c]*b
    blend.append(max(-32768,min(32767,round(v))))
  samples=middle+blend
 else:
  for f in range(len(samples)//channels):
   fade=min(1,f/(rate*.15),(len(samples)//channels-f)/(rate*1.2))
   for c in range(channels):samples[f*channels+c]=round(samples[f*channels+c]*fade)
 gain=.65*32767/max(abs(v) for v in samples);samples=array.array('h',(round(v*gain) for v in samples))
 with wave.open(str(out/(name+'.wav')),'wb') as dst:
  dst.setnchannels(channels);dst.setsampwidth(2);dst.setframerate(rate);dst.writeframes(samples.tobytes())
 print(json.dumps({'name':name,'duration':len(samples)/rate/channels,'channels':channels,'peak':max(abs(v) for v in samples)/32768}))
