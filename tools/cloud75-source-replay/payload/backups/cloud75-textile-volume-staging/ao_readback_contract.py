"""Pure independent AO channel contract, not a bake implementation."""
import math

def check_rgba(before,after,scale=1.):
 assert scale in (1.,255,65535),'Unsupported normalized color scale'
 assert len(before)==len(after)and len(after)>0
 changed=0;lo=math.inf;hi=-math.inf;alpha_unchanged=True
 for i,(old,new)in enumerate(zip(before,after)):
  assert len(old)==len(new)==4 and all(math.isfinite(float(v))for v in old+new),('Nonfinite/malformed color',i)
  assert new[0]==new[1],('AO R/G differ',i)
  assert .25*scale<=new[0]<=scale,('AO outside fixed [.25,1]',i,new[0],scale)
  assert new[2]==old[2],('Preserved sky B changed',i)
  assert new[3]==scale,('AO alpha must be1',i)
  alpha_unchanged=alpha_unchanged and new[3]==old[3]
  changed+=new[:2]!=old[:2];lo=min(lo,new[0]/scale);hi=max(hi,new[0]/scale)
 return {'values':len(after),'changedAOValues':changed,'minimumAO':lo,'maximumAO':hi,'RGEqual':True,'skyBExact':True,'alphaOne':True,'alphaUnchanged':alpha_unchanged}
