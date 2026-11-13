"""Scene boundaries plus conservative, explainable visual hints; not semantic certainty."""
import sys, json
from pathlib import Path
import cv2
import mediapipe as mp
from scenedetect import detect, ContentDetector

video, output = sys.argv[1:3]
cap=cv2.VideoCapture(video)
fps=cap.get(cv2.CAP_PROP_FPS) or 30
duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps
model=Path(__file__).resolve().parents[1]/'models/face_landmarker.task'
detector=mp.tasks.vision.FaceLandmarker.create_from_options(
    mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,num_faces=3))
scenes=detect(video,ContentDetector(threshold=30),start_in_scene=True)
intervals=[]
# Inspect long static shots throughout their duration, not only one midpoint.
for start,end in scenes:
    a,b=start.get_seconds(),end.get_seconds()
    while a<b:
        stop=min(b,a+15)
        intervals.append((a,stop))
        a=stop
if not intervals and duration>0: intervals=[(0,duration)]
results=[]
for a,b in intervals:
    cap.set(cv2.CAP_PROP_POS_MSEC,(a+b)*500)
    ok,frame=cap.read()
    label='unknown';confidence=0.25;faces=[];edge_density=0;brightness=None
    if ok:
        h,w=frame.shape[:2];scaled=cv2.resize(frame,(640,max(1,round(h*640/w))))
        gray=cv2.cvtColor(scaled,cv2.COLOR_BGR2GRAY)
        brightness=float(gray.mean()/255)
        detected=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(scaled,cv2.COLOR_BGR2RGB)))
        for landmarks in detected.face_landmarks:
            xs=[max(0,min(1,p.x)) for p in landmarks];ys=[max(0,min(1,p.y)) for p in landmarks]
            faces.append({'x':min(xs),'y':min(ys),'w':max(xs)-min(xs),'h':max(ys)-min(ys)})
        edge_density=float((cv2.Canny(gray,80,180)>0).mean())
        if any(f['w']*f['h']>0.035 for f in faces): label='talking_head';confidence=0.65
        elif edge_density>0.11: label='screen_recording';confidence=0.55
    results.append({'start':a,'end':b,'type':label,'confidence':confidence,'faces':faces,'edgeDensity':edge_density,'brightness':brightness,'needsReview':True})
cap.release()
detector.close()
Path(output).write_text(json.dumps(results),encoding='utf-8')
