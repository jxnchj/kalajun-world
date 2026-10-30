"""Selected E4 field. No parameter search and no file/Blender side effects."""
def edge_field(x,y,lo,hi):
 assert all(hi[k]>lo[k] for k in (0,1))
 s=2*(x-lo[0])/(hi[0]-lo[0])-1
 t=2*(y-lo[1])/(hi[1]-lo[1])-1
 return 1-(max(0.,1-s*s)**3+max(0.,1-t*t)**3)/2

def displacement(leaf,top,e,amplitude=.002):
 assert leaf in range(8) and 0<=e<=1 and 0<amplitude<=.002
 return -(leaf+int(top))*amplitude*e
