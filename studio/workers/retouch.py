"""Local portrait pass. MediaPipe tracking; landmark regions and temporal filter
adapted from CTBot000/face-beautifier (MIT, vendor/face-beautifier/LICENSE).
No face found means no pixel changes. Eyes/lips are excluded from skin smoothing.
Geometry (eyes, nose, mouth, face width) is measured per face and only corrected
towards neutral anthropometric targets, bounded by the control value and caps.
"""
import json,os,sys,subprocess,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import cv2,numpy as np,mediapipe as mp

ROOT=Path(__file__).resolve().parents[1]
REGIONS=json.loads((ROOT/'workers/face-regions.json').read_text())

# Neutral projected ratios using the same MediaPipe landmarks.
# eye width/interocular; nose width/bizygomatic; mouth width/bizygomatic;
# bizygomatic width/morphological face height.
GEOMETRY_TARGETS={
    'faceEyeSize':('eyeWidthToInterocular',.48),
    'faceNoseSize':('noseWidthToFace',.25),
    'faceMouthSize':('mouthWidthToFace',.35),
    'faceWidth':('faceWidthToHeight',.78),
}
GEOMETRY_TOLERANCE=.10
GEOMETRY_CAPS={'faceEyeSize':.30,'faceNoseSize':.20,'faceMouthSize':.10,'faceWidth':.24}

class Tracker:
    def __init__(self): self.previous=None; self.velocity=None
    def filter(self,p,dt):
        if self.previous is None or np.mean(np.abs(p-self.previous))>.08:
            self.previous=p.copy();self.velocity=np.zeros_like(p);return p
        a=1/(1+1/(2*np.pi*dt));self.velocity+=a*((p-self.previous)/dt-self.velocity)
        cutoff=1.2+.012*np.abs(self.velocity)
        self.previous+=(p-self.previous)/(1+1/(2*np.pi*cutoff*dt))
        return self.previous.copy()

def polygon(shape,points,indices):
    m=np.zeros(shape,np.float32);cv2.fillPoly(m,[np.round(points[indices]).astype(np.int32)],1);return m

def face_metrics(p):
    def dist(a,b): return float(np.linalg.norm(p[a]-p[b]))
    def mid(a,b): return (p[a]+p[b])*.5
    fw=dist(234,454);fh=dist(10,152)
    eye=(dist(33,133)+dist(362,263))*.5
    inter=float(np.linalg.norm(mid(33,133)-mid(362,263)))
    return {
        'eyeWidthToInterocular':eye/max(1e-3,inter),
        'noseWidthToFace':dist(129,358)/max(1e-3,fw),
        'mouthWidthToFace':dist(61,291)/max(1e-3,fw),
        'faceWidthToHeight':fw/max(1e-3,fh),
    }

def adaptive_strengths(metrics,settings):
    result={}
    for key,(metric,target) in GEOMETRY_TARGETS.items():
        measured=float(metrics.get(metric,target));request=float(settings.get(key,0) or 0)
        adapt=0.0;raw=0.0
        if abs(request)>1e-9:
            # A positive slider enlarges; a negative one shrinks. Only correct
            # a deviation on that side of the target, never force a good face.
            gap=(target-measured)/target if request>0 else (measured-target)/target
            adapt=float(np.clip(gap/GEOMETRY_TOLERANCE,0,1))
            raw=request*adapt
        strength=float(np.clip(raw,-GEOMETRY_CAPS[key],GEOMETRY_CAPS[key]))
        result[key]={
            'measured':round(measured,4),
            'target':target,
            'requested':round(request,4),
            'adaptation':round(adapt,4),
            'strength':round(strength,4),
            'capped':abs(raw)>abs(strength)+1e-9,
        }
    return result

class Adaptive:
    """Smooth measurements over the clip and collect what was actually applied."""
    def __init__(self):
        self.metrics=None
        self.count=0
        self.metric_sum={m:0.0 for m,_ in GEOMETRY_TARGETS.values()}
        self.factor_sum={k:0.0 for k in GEOMETRY_TARGETS}
        self.strength_sum={k:0.0 for k in GEOMETRY_TARGETS}
        self.capped_features=0

    def update(self,p,settings):
        measured=face_metrics(p)
        if self.metrics is None:
            self.metrics=measured
        else:
            alpha=.2
            self.metrics={k:self.metrics[k]+alpha*(v-self.metrics[k]) for k,v in measured.items()}
        result=adaptive_strengths(self.metrics,settings)
        self.count+=1
        for k,v in measured.items(): self.metric_sum[k]+=v
        for k,v in result.items():
            self.factor_sum[k]+=v['adaptation']
            self.strength_sum[k]+=v['strength']
            self.capped_features+=int(v['capped'])
        return result

    def summary(self):
        if not self.count: return None
        return {
            'frames':self.count,
            'measured':{k:round(v/self.count,4) for k,v in self.metric_sum.items()},
            'targets':{k:target for k,(_,target) in GEOMETRY_TARGETS.items()},
            'tolerance':GEOMETRY_TOLERANCE,
            'limits':GEOMETRY_CAPS,
            'adaptation':{k:round(v/self.count,4) for k,v in self.factor_sum.items()},
            'applied':{k:round(v/self.count,4) for k,v in self.strength_sum.items()},
            'cappedFeatures':self.capped_features,
            'note':'Only the measured deviation in the slider direction is corrected; factor is clamped to 0..1 and strength to limits.',
        }

def enhance(frame,points,s,adaptive=None,geometry=None):
    if points is None:return frame
    h,w=frame.shape[:2];p=points*np.array([w,h])
    # Operate only in the face ROI, with a generous feather margin.
    bounds=p[REGIONS['FACE_OVAL']];lo=np.maximum(0,np.floor(bounds.min(0)-20).astype(int));hi=np.minimum([w,h],np.ceil(bounds.max(0)+20).astype(int))
    x,y=lo;xx,yy=hi
    if xx-x<12 or yy-y<12:return frame
    roi=frame[y:yy,x:xx];p=p-[x,y];shape=roi.shape[:2];fw=max(20,float(np.linalg.norm(p[454]-p[234])))
    # Per-face adaptation happens before the ROI-relative pixel work so the
    # measurements are independent of crop position.
    if geometry is None:geometry=adaptive.update(p,s) if adaptive is not None else adaptive_strengths(face_metrics(p),s)
    strengths={k:geometry[k]['strength'] for k in GEOMETRY_TARGETS}
    skin=polygon(shape,p,REGIONS['FACE_OVAL'])
    exclude=np.zeros(shape,np.float32)
    for name in ['EYE_L','EYE_R','LIPS_OUTER','BROW_L','BROW_R']:
        exclude=np.maximum(exclude,polygon(shape,p,REGIONS[name]))
    k=max(3,int(fw*.025)//2*2+1);exclude=cv2.dilate(exclude,np.ones((k,k),np.uint8))
    skin*=1-exclude;skin=cv2.GaussianBlur(skin,(0,0),max(1,fw*.012))
    # Preserve beard, eyebrows and strong edges; no global skin-colour fallback.
    src=roi.astype(np.float32)/255;lum=cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    skin*=np.clip((lum-.08)/.18,0,1)
    fine=cv2.GaussianBlur(src,(0,0),max(.8,fw*.012));detail=src-fine
    edge=np.clip((np.max(np.abs(detail),axis=2)-.03)/.085,0,1)
    out=src-detail*(s['faceSmooth']*.8*skin*(1-edge))[:,:,None]
    # Low-amplitude local line softening, not semantic wrinkle removal.
    broad=cv2.GaussianBlur(src,(0,0),max(1,fw*.022))
    out+=(broad-src)*(s.get('faceWrinkles',0)*.42*skin*(1-edge))[:,:,None]
    out+=detail*(s.get('faceTexture',0)*.35*skin)[:,:,None]
    warmth=s.get('faceWarmth',0)*.045*skin
    out[:,:,2]+=warmth
    out[:,:,0]-=warmth
    lift=s['faceLight']*.18*skin
    out+=lift[:,:,None]*(1-out)
    for name in ['EYE_L','EYE_R']:
        eye=polygon(shape,p,REGIONS[name]);eye=cv2.GaussianBlur(eye,(0,0),max(.6,fw*.004))
        # Lift existing whites only; do not paint over iris/pupil.
        white=np.clip((lum-.35)/.35,0,1)*eye
        out+=s['faceEyes']*.16*white[:,:,None]*(1-out)
    mouth=polygon(shape,p,REGIONS['LIPS_INNER']);mouth=cv2.GaussianBlur(mouth,(0,0),max(.6,fw*.004))
    neutral=1-np.clip((src.max(2)-src.min(2))/.3,0,1)
    teeth=mouth*neutral*np.clip((lum-.4)/.3,0,1)
    out+=s['faceTeeth']*.18*teeth[:,:,None]*(1-out)
    lip=np.clip(polygon(shape,p,REGIONS['LIPS_OUTER'])-polygon(shape,p,REGIONS['LIPS_INNER']),0,1)
    lip=cv2.GaussianBlur(lip,(0,0),max(.6,fw*.004))
    lip_mean=out.mean(2,keepdims=True)
    out+=(out-lip_mean)*(s.get('faceLipColor',0)*.5*lip)[:,:,None]
    # Under-eye lift is feathered and follows the tracked eye centres.
    gy,gx=np.mgrid[:shape[0],:shape[1]]
    for eye in [REGIONS['EYE_L'],REGIONS['EYE_R']]:
        center=p[eye].mean(0)+[0,fw*.06]
        mask=np.exp(-((gx-center[0])/(fw*.09))**2-((gy-center[1])/(fw*.035))**2)*skin
        out+=s['faceUnderEyes']*.12*mask[:,:,None]*(1-out)
    # Small local jaw displacement with smooth, bounded falloff (MIT reference).
    # The four feature warps use measured, clamped adaptive strengths, not the
    # raw preset; a value of zero on the matching side of the target is a no-op.
    if s['faceJaw']>0 or any(abs(v)>1e-9 for v in strengths.values()):
        mx=gx.astype(np.float32);my=gy.astype(np.float32);center=p[1]
        for idx in [172,397]:
            c=p[idx];radius=fw*.25;delta=(center-c)*s['faceJaw']*.07
            t=np.clip(np.sqrt((mx-c[0])**2+(my-c[1])**2)/radius,0,1);fall=1-t*t*(3-2*t)
            mx-=delta[0]*fall;my-=delta[1]*fall
        # Inverse radial sampling: positive strength enlarges, negative shrinks.
        # Compact support keeps the ROI boundary and the surrounding image fixed.
        def resize_region(c,radius,strength,horizontal=False):
            nonlocal mx,my
            if not strength:return
            dx=gx-c[0];dy=gy-c[1]
            t=np.clip(np.sqrt(dx*dx+dy*dy)/radius,0,1)
            fall=(1-t*t*(3-2*t))*.12*strength
            mx-=dx*fall
            if not horizontal:my-=dy*fall
        resize_region(p[REGIONS['FACE_OVAL']].mean(0),fw*.55,strengths['faceWidth'],True)
        for eye in ['EYE_L','EYE_R']:
            resize_region(p[REGIONS[eye]].mean(0),fw*.15,strengths['faceEyeSize'])
        resize_region(p[1],fw*.18,strengths['faceNoseSize'])
        resize_region(p[REGIONS['LIPS_OUTER']].mean(0),fw*.19,strengths['faceMouthSize'])
        out=cv2.remap(out,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    result=frame.copy();result[y:yy,x:xx]=np.rint(np.clip(out*255,0,255)).astype(np.uint8);return result

def main():
    req=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));s=req['settings'];cap=cv2.VideoCapture(req['source'])
    sourceFps=cap.get(cv2.CAP_PROP_FPS) or 30;targetFps=min(sourceFps,float(req.get('maxFps',sourceFps)));step=max(1,round(sourceFps/targetFps));fps=sourceFps/step;w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT));count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));detectWidth=max(320,min(w,float(req.get('detectWidth',960))))
    if not cap.isOpened() or not w or not h:raise RuntimeError('No se puede leer el vídeo para retoque')
    options=mp.tasks.vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT/'models/face_landmarker.task')),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_faces=1,min_face_detection_confidence=.6,min_face_presence_confidence=.6,min_tracking_confidence=.6)
    encoder=req.get('encoder','libx264');cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0','-i',req['source'],'-map','0:v:0','-map','1:a?','-c:v',encoder,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',req['output']]
    if encoder=='libx264':cmd[-1:-1]=['-preset','fast','-crf','18']
    elif encoder=='h264_nvenc':cmd[-1:-1]=['-preset','p4','-cq','18','-b:v','0']
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    workers=min(4,os.cpu_count() or 1);executor=ThreadPoolExecutor(max_workers=workers);pending=[]
    def flush(keep=0):
        while len(pending)>keep:proc.stdin.write(pending.pop(0).result().tobytes())
    tracker=Tracker();adaptive=Adaptive();frames=0;detected=0;detectorCalls=0;skippedDetectionFrames=0;idle=False;idleStreak=0;sourceIndex=0;started=time.monotonic()
    try:
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as model:
            while True:
                ok,frame=cap.read()
                if not ok:break
                if sourceIndex%step:
                    sourceIndex+=1;continue
                sourceIndex+=1
                points=None
                # Idle gating only skips detection on frames without a face;
                # the moment a face appears, every frame is detected again.
                if not idle or frames%2==0:
                    detectorCalls+=1
                    scale=min(1,detectWidth/w);small=cv2.resize(frame,(round(w*scale),round(h*scale))) if scale<1 else frame
                    result=model.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(small,cv2.COLOR_BGR2RGB)),round(frames*1000/fps))
                    if result.face_landmarks:
                        points=tracker.filter(np.array([[p.x,p.y] for p in result.face_landmarks[0]],np.float32),1/fps);detected+=1;idleStreak=0;idle=False
                    else:
                        tracker.previous=None;idleStreak+=1
                        if idleStreak>=10:idle=True
                else:
                    skippedDetectionFrames+=1
                if points is not None:
                    geometry=adaptive.update(points*np.array([w,h]),s)
                    pending.append(executor.submit(enhance,frame,points,s,None,geometry))
                else:
                    pending.append(executor.submit(enhance,frame,None,s))
                flush(8);frames+=1
                if frames%max(1,round(fps*2))==0:print(f'Retocando rostro: {frames}/{(count+step-1)//step} fotogramas',file=sys.stderr,flush=True)
        flush(0);proc.stdin.close();err=proc.stderr.read().decode(errors='replace');code=proc.wait()
        if code:raise RuntimeError(err[-3000:])
        report={'frames':frames,'framesWithFace':detected,'seconds':round(time.monotonic()-started,2),'fps':fps,'sourceFps':sourceFps,'step':step,'detectWidth':int(detectWidth),'detectorCalls':detectorCalls,'skippedDetectionFrames':skippedDetectionFrames,'idleAfterMisses':10,'idleDetectEvery':2,'enhanceWorkers':workers,'tracking':'MediaPipe Face Landmarker + One Euro','multipleFaces':'Only one face is tracked','faceProportions':adaptive.summary()}
        Path(req['report']).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
    finally:
        executor.shutdown(wait=False,cancel_futures=True)
        cap.release()
        if proc.poll() is None:proc.kill();proc.wait()

if __name__=='__main__':main()
