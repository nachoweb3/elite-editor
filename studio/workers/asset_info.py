import cv2,sys,json,numpy as np
cap=cv2.VideoCapture(sys.argv[1]);ok,frame=cap.read();cap.release()
result={'green':False,'color':'0x00FF00'}
if ok:
    f=cv2.resize(frame,(160,90));border=np.concatenate([f[:8].reshape(-1,3),f[-8:].reshape(-1,3),f[:,:8].reshape(-1,3),f[:,-8:].reshape(-1,3)]).astype(float)
    green=(border[:,1]>70)&(border[:,1]>border[:,0]*1.4)&(border[:,1]>border[:,2]*1.4)
    if green.mean()>.65:
        b,g,r=np.median(border[green],axis=0).astype(int);result={'green':True,'color':f'0x{r:02x}{g:02x}{b:02x}'}
print(json.dumps(result))
