"""Build a calm rain loop from lukabea's CC0 Rain.WAV (Freesound 707672).
Input: source decoded to 48 kHz 16-bit stereo. No spectral gate or synthetic noise.
"""
import argparse,json,wave
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--baseline',type=Path);p.add_argument('--report',type=Path);args=p.parse_args()
def load(path):
 with wave.open(str(path),'rb') as f:
  rate,channels=f.getframerate(),f.getnchannels();data=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,channels)/32768
 return data,rate,channels
raw,rate,channels=load(args.source);assert rate==48000 and channels==2 and len(raw)>=68*rate
clip=raw[20*rate:68*rate];overlap=rate*3
# Complementary smooth weights avoid boosting rain energy during the loop overlap.
t=np.linspace(0,1,overlap)[:,None];fade=.5-.5*np.cos(np.pi*t)
loop=np.concatenate([clip[overlap:-overlap],clip[-overlap:]*(1-fade)+clip[:overlap]*fade])
freq=np.fft.rfftfreq(len(loop),1/rate)
# One fixed, smooth EQ has no changing per-bin gate to produce metallic musical noise.
eq=(1-np.exp(-(freq/150)**4))/np.sqrt(1+(freq/2100)**8)
for hum in [50,60,100,120]:eq*=1-.8*np.exp(-.5*((freq-hum)/5)**2)
filtered=np.fft.irfft(np.fft.rfft(loop,axis=0)*eq[:,None],n=len(loop),axis=0)
# Gentle peak rounding preserves continuous water while softening isolated taps.
output=.024*np.tanh(filtered/.024)
# Keep a modest average level; never amplify background noise to reach a loudness target.
output*=min(1,.005/np.sqrt(np.mean(output**2)))
# Suppress a residual boundary discontinuity across 10 ms without silencing the seam.
n=rate//100;difference=output[-1]-output[0];output[:n]+=difference[None,:]*np.linspace(.5,0,n)[:,None];output[-n:]-=difference[None,:]*np.linspace(0,.5,n)[:,None]
args.output.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(args.output),'wb') as f:f.setnchannels(channels);f.setsampwidth(2);f.setframerate(rate);f.writeframes(np.round(np.clip(output,-1,.999)*32768).astype('<i2').tobytes())
def metrics(a,r):
 spectrum=np.fft.rfft(a[:r*8],axis=0);f=np.fft.rfftfreq(min(len(a),r*8),1/r)
 return {'rms':float(np.sqrt(np.mean(a*a))),'peak':float(np.max(abs(a))),'highBandEnergy':float(np.sum(abs(spectrum[f>4000])**2)), 'sampleDeltaRMS':float(np.sqrt(np.mean(np.diff(a,axis=0)**2))),'loopEdge':float(np.max(abs(a[-1]-a[0])))}
result={'source':'https://freesound.org/people/lukabea/sounds/707672/','license':'CC0','segment':[20,68],'duration':len(output)/rate,'output':metrics(output,rate)}
if args.baseline:
 old,oldrate,_=load(args.baseline);before=metrics(old,oldrate);result['before']=before;result['levelReductionDb']=float(20*np.log10(result['output']['rms']/before['rms']));result['highBandReductionDb']=float(10*np.log10(result['output']['highBandEnergy']/before['highBandEnergy']))
print(json.dumps(result,indent=2));
if args.report:args.report.write_text(json.dumps(result,indent=2))
