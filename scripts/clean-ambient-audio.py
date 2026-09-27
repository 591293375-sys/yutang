from pathlib import Path
import wave,json,shutil
import numpy as np
import argparse
parser=argparse.ArgumentParser(description='Denoise the three original pond field recordings; retain loop length and stereo.')
parser.add_argument('input_dir',type=Path,help='Directory containing the original healing-stream.wav, rain.wav and wind.wav')
parser.add_argument('output_dir',type=Path)
args=parser.parse_args();args.output_dir.mkdir(parents=True,exist_ok=True)
results=[]
for name,cutoff,strength in [('healing-stream',2400,1.55),('rain',2900,1.35),('wind',1600,1.4)]:
 file=args.output_dir/f'{name}.wav';original=args.input_dir/file.name
 with wave.open(str(original),'rb') as f:
  rate,channels=f.getframerate(),f.getnchannels();raw=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,channels).astype(np.float64)/32768
 nfft,hop=2048,512;window=np.sqrt(np.hanning(nfft));freq=np.fft.rfftfreq(nfft,1/rate);tone=1/np.sqrt(1+(freq/cutoff)**8)*(1-np.exp(-(freq/75)**2))
 output=np.zeros_like(raw)
 for channel in range(channels):
  # Circular padding and overlap-add retain the already crossfaded loop seam.
  a=np.pad(raw[:,channel],(nfft,nfft),mode='wrap');frames=np.lib.stride_tricks.sliding_window_view(a,nfft)[::hop].copy();spec=np.fft.rfft(frames*window,axis=1);power=np.abs(spec)**2
  floor=np.quantile(power,.22,axis=0);gain=np.clip(1-strength*floor[None,:]/(power+1e-12),.055,1)**.7
  # Smooth the mask in time/frequency to avoid isolated musical-noise bins.
  gain=(gain+np.roll(gain,1,axis=0)+np.roll(gain,-1,axis=0))/3
  gain=(gain+np.roll(gain,1,axis=1)+np.roll(gain,-1,axis=1))/3
  cleaned=np.fft.irfft(spec*gain*tone,n=nfft,axis=1)*window
  signal=np.zeros(len(a));weight=np.zeros(len(a));w2=window**2
  for i,frame in enumerate(cleaned):start=i*hop;signal[start:start+nfft]+=frame;weight[start:start+nfft]+=w2
  output[:,channel]=(signal/np.maximum(weight,1e-8))[nfft:nfft+len(raw)]
 gain=min(1,.62/max(1e-9,np.max(np.abs(output))));output*=gain
 def high_energy(x):
  segment=x[:min(len(x),rate*8),0];s=np.fft.rfft(segment);f=np.fft.rfftfreq(len(segment),1/rate);return np.sum(np.abs(s[f>4000])**2)
 reduction=10*np.log10(high_energy(output)/high_energy(raw));assert reduction < -12
 pcm=np.round(np.clip(output,-1,.9999)*32768).astype('<i2')
 with wave.open(str(file),'wb') as dst:dst.setnchannels(channels);dst.setsampwidth(2);dst.setframerate(rate);dst.writeframes(pcm.tobytes())
 results.append(dict(track=name,duration=len(raw)/rate,highBandReductionDb=round(float(reduction),2),beforeRMS=round(float(np.sqrt(np.mean(raw**2))),5),afterRMS=round(float(np.sqrt(np.mean(output**2))),5),peak=round(float(np.max(np.abs(output))),4),maxLoopEdge=round(float(np.max(np.abs(output[0]-output[-1]))),5)))
print(json.dumps(results,ensure_ascii=False,indent=2));(args.output_dir/'audio-cleanup-1.5.json').write_text(json.dumps(results,indent=2))
