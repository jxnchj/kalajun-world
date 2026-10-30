import copy,tempfile,unittest
from types import SimpleNamespace as N
from material_fingerprint import CoverageError,digest,image_record,tree_record,_rna

def rna(**values):
 obj=N(**values);obj.bl_rna=N(identifier='Fixture',properties=[N(identifier=k,type=('STRING' if isinstance(v,str) else 'FLOAT'),is_readonly=False) for k,v in values.items()]);return obj

def image():
 return N(name='motif',source='FILE',size=[2,2],channels=4,colorspace_settings=N(name='sRGB',is_data=False),alpha_mode='STRAIGHT',packed_files=[N(packed_file=N(data=b'pixels',size=6))])
def tree():
 sock=N(identifier='Color',name='Color',bl_idname='NodeSocketColor',enabled=True,default_value=[1.,.5,.2,1.])
 node=rna(uv_map='UVMap');node.name='Texture';node.bl_idname='ShaderNodeTexImage';node.inputs=[sock];node.outputs=[];node.internal_links=[];node.image=image()
 t=N(name='Tree',nodes=[node],links=[],interface=N(items_tree=[]));t.as_pointer=lambda:123;return t

class MaterialFingerprints(unittest.TestCase):
 def test_packed_content_mutation(self):
  a=image();b=copy.deepcopy(a);b.packed_files[0].packed_file.data=b'changed'
  self.assertNotEqual(digest(image_record(a,'.')),digest(image_record(b,'.')))
 def test_dirty_image_blocks(self):
  a=image();a.is_dirty=True
  with self.assertRaises(CoverageError):image_record(a,'.')
 def test_colorspace_mutation(self):
  a=image();b=copy.deepcopy(a);b.colorspace_settings.name='Non-Color'
  self.assertNotEqual(digest(image_record(a,'.')),digest(image_record(b,'.')))
 def test_alpha_mutation(self):
  a=image();b=copy.deepcopy(a);b.alpha_mode='NONE'
  self.assertNotEqual(digest(image_record(a,'.')),digest(image_record(b,'.')))
 def test_image_identity_mutation(self):
  a=image();b=copy.deepcopy(a);b.name='other'
  self.assertNotEqual(digest(image_record(a,'.')),digest(image_record(b,'.')))
 def test_unsupported_sequence_blocks(self):
  a=image();a.source='SEQUENCE'
  with self.assertRaises(CoverageError):image_record(a,'.')
 def test_uv_selection_mutation(self):
  a=tree();b=tree();b.nodes[0].uv_map='OtherUV'
  self.assertNotEqual(digest(tree_record(a,'.')),digest(tree_record(b,'.')))
 def test_socket_default_mutation(self):
  a=tree();b=tree();b.nodes[0].inputs[0].default_value[0]=.25
  self.assertNotEqual(digest(tree_record(a,'.')),digest(tree_record(b,'.')))
 def test_nested_group_mutation(self):
  a=tree();b=tree()
  for t in [a,b]:
   t.nodes[0].node_tree=tree();t.nodes[0].node_tree.as_pointer=lambda:456
  b.nodes[0].node_tree.nodes[0].uv_map='NestedOther'
  self.assertNotEqual(digest(tree_record(a,'.')),digest(tree_record(b,'.')))
 def test_node_type_mutation(self):
  a=tree();b=tree();b.nodes[0].bl_idname='ShaderNodeOther'
  self.assertNotEqual(digest(tree_record(a,'.')),digest(tree_record(b,'.')))
 def test_link_mutation(self):
  a=tree();b=tree();n=b.nodes[0];s=n.inputs[0];b.links=[N(from_node=n,to_node=n,from_socket=s,to_socket=s)]
  self.assertNotEqual(digest(tree_record(a,'.')),digest(tree_record(b,'.')))
 def test_unknown_pointer_blocks(self):
  x=rna();x.bl_rna.properties=[N(identifier='mystery',type='POINTER',is_readonly=False)];x.mystery=object()
  with self.assertRaises(CoverageError):_rna(x)
 def test_nonfinite_blocks(self):
  with self.assertRaises(CoverageError):_rna(rna(roughness=float('nan')))
 def test_recursive_group_blocks(self):
  t=tree();t.nodes[0].node_tree=t
  with self.assertRaises(CoverageError):tree_record(t,'.')
if __name__=='__main__':unittest.main()
