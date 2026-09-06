import numpy as np, wave, sys
SR=44100; DUR=float(sys.argv[1]) if len(sys.argv)>1 else 12.0; N=int(SR*DUR); t=np.arange(N)/SR
BPM=124; BEAT=60/BPM; BAR=4*BEAT
L=np.zeros(N); R=np.zeros(N)
def seg(start,dur):
    a=int(start*SR); b=min(N,int((start+dur)*SR)); return a,b
def lowpass(x,fc,order=2):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)
    X*=1/np.sqrt(1+(f/fc)**(2*order)); return np.fft.irfft(X,len(x))
def highpass(x,fc,order=2):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)
    X*=1/np.sqrt(1+(fc/np.maximum(f,1e-3))**(2*order)); return np.fft.irfft(X,len(x))
def adsr(n,a,d,s,r):
    e=np.ones(n); A=int(a*SR); D=int(d*SR); Rl=int(r*SR)
    if A>0: e[:A]=np.linspace(0,1,A)
    if D>0: e[A:A+D]=np.linspace(1,s,min(D,max(0,n-A)))[:max(0,min(D,n-A))]
    e[A+D:]=s
    if Rl>0 and n>Rl: e[-Rl:]*=np.linspace(1,0,Rl)
    return e
# --- acordes (Hz) por compasso ---
Am=[110,130.81,164.81,220]; F=[87.31,110,130.81,174.61]; C=[130.81,164.81,196,261.63]; G=[98,123.47,146.83,196]
prog=[(0,Am,55),(BAR,F,43.65),(2*BAR,C,65.41),(3*BAR,G,49),(4*BAR,Am,55),(5*BAR,F,43.65)]
# --- PAD ---
padL=np.zeros(N); padR=np.zeros(N)
for (st,notes,root) in prog:
    a,b=seg(st,BAR+0.4); n=b-a; tt=t[:n]
    e=adsr(n,0.5,0.1,1,0.5)
    for f in notes:
        for det,side in ((0.997,'L'),(1.003,'R')):
            saw=2*((f*det*tt)%1)-1; tri=2*np.abs(saw)-1
            v=(0.6*saw+0.4*tri)*e
            (padL if side=='L' else padR)[a:b]+=v
padL=lowpass(padL,1100)*0.11; padR=lowpass(padR,1100)*0.11
# --- SUB BASS ---
bass=np.zeros(N)
for (st,notes,root) in prog:
    a,b=seg(st,BAR); n=b-a; tt=t[:n]
    bass[a:b]+=np.sin(2*np.pi*root*tt)*adsr(n,0.02,0.1,0.9,0.15)
bass*=0.30
# --- KICK / HATS (entram em 3.4s) ---
kick=np.zeros(N); hat=np.zeros(N); duck=np.ones(N)
BEAT_START=3.4; k=0
while True:
    ts=BEAT_START+k*BEAT
    if ts>DUR-0.4: break
    a,b=seg(ts,0.45); n=b-a; tt=t[:n]
    fr=45+90*np.exp(-tt*28); ph=2*np.pi*np.cumsum(fr)/SR
    kick[a:b]+=np.sin(ph)*np.exp(-tt*9)*0.95 + np.random.randn(n)*np.exp(-tt*300)*0.25
    dn=int(0.28*SR); dd=np.linspace(0,1,min(dn,N-a)); duck[a:a+len(dd)]*=(0.38+0.62*dd)
    for off in (0,BEAT/2):
        ha,hb=seg(ts+off,0.06); hn=hb-ha
        if hn>0: hat[ha:hb]+=np.random.randn(hn)*np.exp(-np.arange(hn)/SR*90)*(0.10 if off==0 else 0.16)
    k+=1
hat=highpass(hat,6500)
# --- ARPEJO (5.8s -> 11.4s) ---
arpL=np.zeros(N); arpR=np.zeros(N); i=0; ts=5.8
while ts<min(DUR-0.6,11.4):
    chord=[c for c in prog if c[0]<=ts][-1][1]; f=chord[i%4]*2
    a,b=seg(ts,0.22); n=b-a; tt=t[:n]
    v=(np.sin(2*np.pi*f*tt)+0.35*np.sin(2*np.pi*2*f*tt))*np.exp(-tt*16)*0.18
    (arpL if i%2==0 else arpR)[a:b]+=v
    i+=1; ts+=BEAT/4
arpL=lowpass(arpL,3200); arpR=lowpass(arpR,3200)
# --- RISER + IMPACTOS ---
riser=np.zeros(N); a,b=seg(2.45,1.1); n=b-a
riser[a:b]=np.random.randn(n)*np.linspace(0,1,n)**2*0.35
riser=highpass(lowpass(riser,9000),900)
imp=np.zeros(N)
for ts,amp in ((3.55,0.8),(8.75,0.6)):
    a,b=seg(ts,0.8); n=b-a; tt=t[:n]
    imp[a:b]+=np.sin(2*np.pi*(38+30*np.exp(-tt*10))*tt)*np.exp(-tt*4)*amp + np.random.randn(n)*np.exp(-tt*22)*0.28
imp=lowpass(imp,4000)
# --- MIX ---
side=duck
L=padL*side+bass*side+arpL*side+kick+hat+riser+imp
R=padR*side+bass*side+arpR*side+kick+hat+riser+imp
mix=np.stack([L,R],1)
fi=int(0.05*SR); fo=int(0.8*SR)
mix[:fi]*=np.linspace(0,1,fi)[:,None]; mix[-fo:]*=np.linspace(1,0,fo)[:,None]
mix=np.tanh(mix*1.3)/np.tanh(1.3); mix*=0.89/np.max(np.abs(mix))
with wave.open('trilha.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix*32767).astype('<i2').tobytes())
print('trilha.wav', DUR,'s')
