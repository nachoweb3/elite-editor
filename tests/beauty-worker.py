"""Synthetic pixel/geometry checks; does not evaluate real portrait quality."""
import importlib.util
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portrait',root/'workers/retouch.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
rng=np.random.default_rng(12)
frame=rng.integers(0,256,(240,320,3),dtype=np.uint8)
points=np.tile([.5,.5],(478,1)).astype(np.float32)
for name,cx,cy,rx,ry in [('FACE_OVAL',.5,.5,.25,.36),('EYE_L',.4,.4,.05,.025),('EYE_R',.6,.4,.05,.025),('BROW_L',.4,.35,.05,.015),('BROW_R',.6,.35,.05,.015),('LIPS_OUTER',.5,.65,.08,.04),('LIPS_INNER',.5,.65,.06,.025)]:
    ids=module.REGIONS[name]
    for n,i in enumerate(ids):
        t=2*np.pi*n/len(ids);points[i]=[cx+rx*np.cos(t),cy+ry*np.sin(t)]
points[234]=[.25,.5];points[454]=[.75,.5];points[1]=[.5,.5]
keys=['faceSmooth','faceLight','faceUnderEyes','faceEyes','faceTeeth','faceJaw','faceWrinkles','faceTexture','faceWarmth','faceLipColor','faceEyeSize','faceNoseSize','faceMouthSize','faceWidth']
zero={k:0 for k in keys}
assert module.enhance(frame,None,{**zero,'faceEyeSize':1}) is frame
assert np.array_equal(module.enhance(frame,points,zero),frame)
for key in keys:
    positive=module.enhance(frame,points,{**zero,key:1})
    assert positive.shape==frame.shape and positive.dtype==np.uint8
    assert np.array_equal(positive[:12],frame[:12]),key
for key in ['faceEyeSize','faceNoseSize','faceMouthSize','faceWidth']:
    small=module.enhance(frame,points,{**zero,key:-1})
    large=module.enhance(frame,points,{**zero,key:1})
    assert not np.array_equal(small,large),key
print('PASS portrait worker: neutral identity, no-face identity, bounded output, untouched outer pixels, distinct enlarge/reduce. Synthetic landmarks only.')
