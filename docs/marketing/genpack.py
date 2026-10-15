import numpy as np, wave, os, sys, random
SR=44100; random.seed(3); np.random.seed(3)
root=sys.argv[1]
def save(path,x):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    x=np.clip(x/ max(1e-9,np.abs(x).max())*0.8,-1,1)
    w=wave.open(path,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype('<i2').tobytes()); w.close()
t=lambda d: np.arange(int(SR*d))/SR
def kick(i):
    d=0.5; tt=t(d); f=40+ (90+i*6)*np.exp(-tt*28); ph=2*np.pi*np.cumsum(f)/SR; return np.sin(ph)*np.exp(-tt*(6+i%3))
def snare(i):
    d=0.35; tt=t(d); n=np.random.randn(len(tt))*np.exp(-tt*(14+i%4)); return n*0.7+np.sin(2*np.pi*(180+i*8)*tt)*np.exp(-tt*20)*0.6
def clap(i):
    tt=t(0.3); e=sum(np.exp(-np.clip(tt-k*0.012,0,None)*60)*(tt>=k*0.012) for k in range(4)); return np.random.randn(len(tt))*e*np.exp(-tt*10)
def hat(i,open_=False):
    d=0.7 if open_ else 0.12; tt=t(d); n=np.random.randn(len(tt)); n=n-np.convolve(n,np.ones(6)/6,'same'); return n*np.exp(-tt*(6 if open_ else 40+i))
def crash(i):
    tt=t(1.8); n=np.random.randn(len(tt)); n=n-np.convolve(n,np.ones(4)/4,'same'); return n*np.exp(-tt*2.2)
def b808(i):
    d=1.4; tt=t(d); f=32.7*2**((i%8)/12)*(1+ 0.5*np.exp(-tt*25)); return np.tanh(2.5*np.sin(2*np.pi*np.cumsum(f)/SR))*np.exp(-tt*2.4)
def tom(i):
    tt=t(0.5); f=100+i*14; return np.sin(2*np.pi*f*tt*(1-0.25*tt))*np.exp(-tt*9)
def piano(i):
    tt=t(1.6); f=220*2**((i*2)/12); x=sum(np.sin(2*np.pi*f*h*tt)*np.exp(-tt*(2+h))/h for h in range(1,7)); return x
def pluck(i):
    tt=t(0.8); f=330*2**((i*3)/12); x=sum(np.sin(2*np.pi*f*h*tt)/h**1.4 for h in range(1,5))*np.exp(-tt*6); return x
def bell(i):
    tt=t(2.0); f=523*2**((i)/12); return sum(np.sin(2*np.pi*f*r*tt)*np.exp(-tt*(1.5+r)) for r in (1,2.76,5.4,8.9))
def vox(i):
    tt=t(0.7); f=160+i*20; return sum(np.sin(2*np.pi*f*h*tt+h)*np.exp(-((h-3)**2)/4) for h in range(1,9))*np.sin(np.pi*tt/0.7)
def fx(i):
    tt=t(1.5); f=200*np.exp(tt*2); n=np.random.randn(len(tt))*0.3; return (np.sin(2*np.pi*np.cumsum(f)/SR)+n)*np.sin(np.pi*tt/1.5)
def dloop(i):
    d=60/92*4; tt=t(d); out=np.zeros(len(tt)); 
    for k,(tm,fn) in enumerate([(0,kick),(0.4,snare),(0.6,kick),(1.0,snare)]):
        s=(kick(i) if fn is kick else snare(i)); a=int(tm*SR*(d/ 1.6)); out[a:a+len(s)]+=s[:len(out)-a]
    return out
def mloop(i):
    d=60/92*4; tt=t(d); return sum(np.sin(2*np.pi*(220*2**(n/12))*tt)*np.exp(-((tt*2)%1)*3) for n in (0,3,7,10)) 
P="Rio - "
for i in range(1,12): save(f"{root}/Rio/Drums/Kicks/{P}Kick {i:02d}.wav",kick(i))
for i in range(1,12): save(f"{root}/Rio/Drums/Snares/{P}Snare {i:02d}.wav",snare(i))
for i in range(1,12): save(f"{root}/Rio/Drums/Claps/{P}Clap {i:02d}.wav",clap(i))
for i in range(1,12): save(f"{root}/Rio/Hats/Closed/{P}Closed Hat {i:02d}.wav",hat(i))
for i in range(1,12): save(f"{root}/Rio/Hats/Open/{P}Open Hat {i:02d}.wav",hat(i,True))
for i in range(1,12): save(f"{root}/Rio/Crashes/{P}Crash {i:02d}.wav",crash(i))
for i in range(1,12): save(f"{root}/Rio/Percs/Toms/{P}Tom {i:02d}.wav",tom(i))
for i in range(1,8): save(f"{root}/Rio/808s/{P}808 {i:02d}.wav",b808(i))
for i in range(1,8): save(f"{root}/Rio/Vox/{P}Vox Chant {i:02d}.wav",vox(i))
for i in range(1,12): save(f"{root}/Rio/Risers/{P}Riser {i:02d}.wav",fx(i))
for i in range(1,10): save(f"{root}/Rio/Melodic One Shots/{P}Piano {i:02d}.wav",piano(i))
for i in range(1,10): save(f"{root}/Rio/Melodic One Shots/{P}Pluck {i:02d}.wav",pluck(i))
for i in range(1,8): save(f"{root}/Rio/Melodic One Shots/{P}Bell {i:02d}.wav",bell(i))
for i in range(1,8): save(f"{root}/Rio/Drum Loops/{P}Drum Loop {i:02d}.wav",dloop(i))
for i in range(1,10): save(f"{root}/Rio/Chord Loops/{P}Chord Loop {i:02d}.wav",mloop(i))
print("ok")
