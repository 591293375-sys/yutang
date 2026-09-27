"""Re-edit the existing CC0 brook recording to space out its low-pitched calls.
No generated noise, time stretching, or time-varying spectral noise gate.
Usage: python prepare-sparse-stream.py source.wav previous.wav output.wav metrics.json
"""
import argparse,json,wave
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('previous',type=Path);p.add_argument('output',type=Path);p.add_argument('metrics',type=Path);a=p.parse_args()
def read(file):
 with wave.open(str(file),'rb') as w:
  assert w.getsampwidth()==2
  return w.getframerate(),np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,w.getnchannels()).astype(np.float64)/32768
rate,source=read(a.source)
# Source spectrogram: repeated low calls occur around 73–84 and 107–120s.
# Keep just 75–79s once, between much longer sections of flowing water.
segments=[(25,42),(119,134),(331,364),(75,79),(366,389),(395,411),(226,248.5)]
join=int(1.5*rate);blend=(.5-.5*np.cos(np.linspace(0,np.pi,join)))[:,None]
track=None
for start,end in segments:
 clip=source[round(start*rate):round(end*rate)].copy()
 if (start,end)==(75,79):clip*=.72
 if track is None:track=clip
 else:track=np.concatenate((track[:-join],track[-join:]*(1-blend)+clip[:join]*blend,clip[join:]))
# A complementary crossfade closes the loop without the old equal-power volume lift.
track=np.concatenate((track[join:-join],track[-join:]*(1-blend)+track[:join]*blend))
freq=np.fft.rfftfreq(len(track),1/rate)
eq=(1-np.exp(-(freq/130)**4))/np.sqrt(1+(freq/2300)**8)
for c in range(track.shape[1]):
 track[:,c]=np.fft.irfft(np.fft.rfft(track[:,c])*eq,n=len(track))*2.2
# Match the former quiet-water level; soften isolated handling/bubble peaks.
track=.045*np.tanh(track/.045)
# Smooth only the end-point offset over 20ms, preserving the crossfade itself.
n=round(.02*rate);correction=(track[-1]-track[0]).copy();ramp=(.5-.5*np.cos(np.linspace(0,np.pi,n)))[:,None];track[-n:]-=ramp*correction
pcm=np.round(np.clip(track,-1,.9999)*32768).astype('<i2');a.output.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(a.output),'wb') as w:w.setnchannels(track.shape[1]);w.setsampwidth(2);w.setframerate(rate);w.writeframes(pcm.tobytes())
def measure(x,r):
 m=x.mean(axis=1)[::6];sr=r/6;n=1024;hop=256;frames=np.lib.stride_tricks.sliding_window_view(m,n)[::hop];power=abs(np.fft.rfft(frames*np.hanning(n),axis=1))**2;f=np.fft.rfftfreq(n,1/sr)
 ratio=power[:,(f>=465)&(f<=585)].mean(axis=1)/np.maximum(1e-12,power[:,(f>=800)&(f<=1600)].mean(axis=1))
 active=ratio>1.6;events=[];start=None
 for i,yes in enumerate(active):
  if yes and start is None:start=i
  if start is not None and (not yes or i==len(active)-1):
   if (i-start)*hop/sr>=.16:events.append([round(start*hop/sr,2),round(i*hop/sr,2)])
   start=None
 return {'duration':round(len(x)/r,3),'rms':float(np.sqrt(np.mean(x*x))),'peak':float(np.max(abs(x))),'loopEdgeDelta':float(np.max(abs(x[-1]-x[0]))),'lowCallEvents':events,'lowCallEventsPerMinute':round(len(events)/(len(x)/r)*60,3),'callBandRatioQuantiles':[float(v) for v in np.quantile(ratio,[.5,.9,.95,.99,1])]}
old_rate,old=read(a.previous);before=measure(old,old_rate);after=measure(pcm.astype(np.float64)/32768,rate)
result={'sourceSegmentsSeconds':segments,'crossfadeSeconds':1.5,'definition':'465–585 Hz / 800–1600 Hz spectral-power-density ratio > 1.6 for at least 160ms; proxy for repeated low calls, not an animal species classifier','before':before,'after':after}
assert after['duration']==120 and after['loopEdgeDelta']==0
assert after['lowCallEventsPerMinute']<=before['lowCallEventsPerMinute']*.25, 'Repeated low call activity must be substantially lower'
assert after['peak']<.06
a.metrics.parent.mkdir(parents=True,exist_ok=True);a.metrics.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
