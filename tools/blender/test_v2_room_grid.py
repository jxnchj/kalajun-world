"""Tiny portability regression; no mesh loading or baking."""
import sys,json,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v2_room_bounce import retained_grid_bounds,ROOT
f=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0])['house_a']
lo,hi=np.array(f['bounds']);computed=hi.copy();computed[1]=2.44+2.5*math.tan(math.radians(24))-.13
for candidate in [hi,computed,hi+5e-13]:
 a,b=retained_grid_bounds(f['size'],lo,candidate,f);assert np.array_equal(a,lo)and np.array_equal(b,hi),'Stored coordinates remain exact'
for dims,candidate in [([9,5,9],hi),(f['size'],hi+1e-8),(f['size'],hi+np.nan)]:
 try:retained_grid_bounds(dims,lo,candidate,f)
 except AssertionError:pass
 else:raise AssertionError('Real geometry/size change or invalid grid was accepted')
report={'exactSizeRequired':True,'realGeometryChangesRejected':True,'authoritativeBoundsBytePreserved':True,'maximumAcceptedAbsoluteDrift':1e-12,'measuredTopDelta':float(computed[1]-hi[1]),'measuredTopDeltaULPs':float((computed[1]-hi[1])/math.ulp(hi[1]))}
(ROOT/'tools/reports/room-grid-portability-v34.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
