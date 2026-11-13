"""Local portrait pass. MediaPipe tracking; landmark regions and temporal filter
adapted from CTBot000/face-beautifier (MIT, vendor/face-beautifier/LICENSE).
No face found means no pixel changes. Eyes/lips are excluded from skin smoothing.
"""
import json,sys,subprocess,time
from pathlib import Path
import cv2,numpy as np,mediapipe as mp

ROOT=Path(__file__).resolve().parents[1]
REGIONS=json.loads((ROOT/'workers/face-regions.json').read_text())

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

def enhance(frame,points,s):
    if points is None:return frame
    h,w=frame.shape[:2];p=points*np.array([w,h])
    # Operate only in the face ROI, with a generous feather margin.
    bounds=p[REGIONS['FACE_OVAL']];lo=np.maximum(0,np.floor(bounds.min(0)-20).astype(int));hi=np.minimum([w,h],np.ceil(bounds.max(0)+20).astype(int))
    x,y=lo;xx,yy=hi
    if xx-x<12 or yy-y<12:return frame
    roi=frame[y:yy,x:xx];p=p-[x,y];shape=roi.shape[:2];fw=max(20,float(np.linalg.norm(p[454]-p[234])))
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
    # Under-eye lift is feathered and follows the tracked eye centres.
    gy,gx=np.mgrid[:shape[0],:shape[1]]
    for eye in [REGIONS['EYE_L'],REGIONS['EYE_R']]:
        center=p[eye].mean(0)+[0,fw*.06]
        mask=np.exp(-((gx-center[0])/(fw*.09))**2-((gy-center[1])/(fw*.035))**2)*skin
        out+=s['faceUnderEyes']*.12*mask[:,:,None]*(1-out)
    # Small local jaw displacement with smooth, bounded falloff (MIT reference).
    if s['faceJaw']>0:
        mx=gx.astype(np.float32);my=gy.astype(np.float32);center=p[1]
        for idx in [172,397]:
            c=p[idx];radius=fw*.25;delta=(center-c)*s['faceJaw']*.07
            t=np.clip(np.sqrt((mx-c[0])**2+(my-c[1])**2)/radius,0,1);fall=1-t*t*(3-2*t)
            mx-=delta[0]*fall;my-=delta[1]*fall
        out=cv2.remap(out,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    result=frame.copy();result[y:yy,x:xx]=np.rint(np.clip(out*255,0,255)).astype(np.uint8);return result

def main():
    req=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));s=req['settings'];cap=cv2.VideoCapture(req['source'])
    fps=cap.get(cv2.CAP_PROP_FPS) or 30;w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT));count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if not cap.isOpened() or not w or not h:raise RuntimeError('No se puede leer el vídeo para retoque')
    options=mp.tasks.vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT/'models/face_landmarker.task')),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_faces=1,min_face_detection_confidence=.6,min_face_presence_confidence=.6,min_tracking_confidence=.6)
    encoder=req.get('encoder','libx264');cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0','-i',req['source'],'-map','0:v:0','-map','1:a?','-c:v',encoder,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',req['output']]
    if encoder=='libx264':cmd[-1:-1]=['-preset','fast','-crf','18']
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    tracker=Tracker();frames=0;detected=0;started=time.monotonic()
    try:
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as model:
            while True:
                ok,frame=cap.read()
                if not ok:break
                scale=min(1,960/w);small=cv2.resize(frame,(round(w*scale),round(h*scale))) if scale<1 else frame
                result=model.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(small,cv2.COLOR_BGR2RGB)),round(frames*1000/fps))
                points=None
                if result.face_landmarks:
                    points=tracker.filter(np.array([[p.x,p.y] for p in result.face_landmarks[0]],np.float32),1/fps);detected+=1
                else:tracker.previous=None
                proc.stdin.write(enhance(frame,points,s).tobytes());frames+=1
                if frames%max(1,round(fps*2))==0:print(f'Retocando rostro: {frames}/{count} fotogramas',file=sys.stderr,flush=True)
        proc.stdin.close();err=proc.stderr.read().decode(errors='replace');code=proc.wait()
        if code:raise RuntimeError(err[-3000:])
        report={'frames':frames,'framesWithFace':detected,'seconds':round(time.monotonic()-started,2),'fps':fps,'tracking':'MediaPipe Face Landmarker + One Euro','multipleFaces':'Only one face is tracked'}
        Path(req['report']).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
    finally:
        cap.release()
        if proc.poll() is None:proc.kill();proc.wait()

if __name__=='__main__':main()
