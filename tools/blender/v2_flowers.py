"""Editable V2 meadow flower source and standard glTF export.

Initial build (append --lod to both commands for the middle-distance asset):
  node tools/export_v2_flowers.mjs
  tools/.bpy/bin/python tools/blender/v2_flowers.py --preview

After artistic edits in Blender, preserve the edited source:
  tools/.bpy/bin/python tools/blender/v2_flowers.py --export-existing
This does not rebuild from JS. Vertex color is real linear albedo, not custom AO.
_PLANT_WIND is an untransformed scalar weight/phase vector, not a spatial direction.
"""
import argparse
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "assets/src/v2/flowers"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--export-existing", action="store_true")
parser.add_argument("--preview", action="store_true")
parser.add_argument("--lod", action="store_true", help="Build/export the matching middle-distance 3D variant")
args = parser.parse_args()
DIR.mkdir(parents=True, exist_ok=True)
BASENAME = "meadow-flowers-lod" if args.lod else "meadow-flowers"
BLEND = DIR / (BASENAME + ".blend")
GLB = ROOT / "web/public/assets/v2" / (BASENAME + ".glb")
GLB.parent.mkdir(parents=True, exist_ok=True)

if args.export_existing:
    if not BLEND.is_file():
        raise FileNotFoundError(BLEND)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
else:
    data = json.loads((DIR / (BASENAME + ".source.json")).read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    mat = bpy.data.materials.new("v2-living-flowers")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = data["material"]["roughness"]
    bsdf.inputs["Metallic"].default_value = 0
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Color"
    mat.node_tree.links.new(colors.outputs["Color"], bsdf.inputs["Base Color"])
    for variant in data["variants"]:
        p, c, w, ix = [variant[k] for k in ("position", "color", "wind", "indices")]
        # Three Y-up to Blender Z-up. glTF export reverses this automatically.
        vertices = [(p[i], -p[i + 2], p[i + 1]) for i in range(0, len(p), 3)]
        mesh = bpy.data.meshes.new(variant["id"])
        mesh.from_pydata(vertices, [], [ix[i:i + 3] for i in range(0, len(ix), 3)])
        mesh.materials.append(mat)
        albedo = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
        albedo.data.foreach_set("color", [channel for i in range(0,len(c),3) for channel in (*c[i:i+3],1.0)])
        mesh.color_attributes.active_color = albedo
        wind = mesh.attributes.new(name="_PLANT_WIND", type="FLOAT_VECTOR", domain="POINT")
        wind.data.foreach_set("vector", w)
        for poly in mesh.polygons:
            poly.use_smooth = True
        mesh.update()
        obj = bpy.data.objects.new(variant["id"], mesh)
        scene.collection.objects.link(obj)
        for key in ("id", "kind", "height", "footprint", "role"):
            obj[key] = variant[key]
        obj["windContract"] = "_PLANT_WIND: structural, flexibility, local phase"
    scene["authoringSource"] = "web/src/v2/flower-assets.js"
    scene["reference"] = "web/public/photos/2.jpg: cosmos bed scale, density and orientation only"
    scene["speciesNote"] = "Designed meadow variants; not a verified botanical species inventory"
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

# Sources are kept at the same origin so each is ready for instancing.
plants = sorted((o for o in bpy.context.scene.objects if o.type == "MESH" and "id" in o), key=lambda o:o["id"])
if len(plants) != 6:
    raise RuntimeError(f"Expected six named flower variants, got {len(plants)}")
for obj in plants:
    if "_PLANT_WIND" not in obj.data.attributes:
        raise RuntimeError(f"Missing wind weights: {obj.name}")
    if "Color" not in obj.data.color_attributes:
        raise RuntimeError(f"Missing linear albedo: {obj.name}")
    if obj.location.length > .0001:
        raise RuntimeError(f"Plant origin must stay at root before export: {obj.name}")
bpy.ops.object.select_all(action="DESELECT")
for obj in plants:
    obj.select_set(True)
bpy.context.view_layer.objects.active = plants[0]
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB",
    use_selection=True, export_apply=False, export_animations=False,
    export_attributes=True, export_vertex_color="NAME", export_vertex_color_name="Color",
    export_all_vertex_colors=False, export_extras=True, export_cameras=False,
    export_lights=False, export_materials="EXPORT")

if args.preview:
    scene = bpy.context.scene
    # Preview-only object offsets, floor and lights are never saved into source or GLB.
    order = ["cosmos_pink","cosmos_white","cosmos_rose","wild_daisy","wild_blue","seed_head"]
    objects = {o["id"]:o for o in plants}
    for i, name in enumerate(order):
        objects[name].location = ((i - 2.5) * .51, 0, 0)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.008))
    floor = bpy.context.object
    floor_mat = bpy.data.materials.new("preview warm grey")
    floor_mat.diffuse_color = (.12,.13,.11,1)
    floor.data.materials.append(floor_mat)
    scene.world = bpy.data.worlds.new("Preview world")
    scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.65,.74,.9,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.35
    lamp_data=bpy.data.lights.new("Preview sun","SUN")
    lamp_data.energy=2.3
    lamp_data.angle=math.radians(8)
    lamp=bpy.data.objects.new("Preview sun",lamp_data)
    scene.collection.objects.link(lamp)
    lamp.rotation_euler=(math.radians(23),math.radians(-30),math.radians(-35))
    camera_data=bpy.data.cameras.new("Preview camera")
    camera=bpy.data.objects.new("Preview camera",camera_data)
    scene.collection.objects.link(camera)
    camera.location=(1.4,-5.2,2.0)
    camera.rotation_euler=(Vector((0,0,.49))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera_data.type="ORTHO"
    camera_data.ortho_scale=3.4
    scene.camera=camera
    scene.render.engine="CYCLES"
    scene.cycles.device="CPU"
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1800
    scene.render.resolution_y=850
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform="AgX"
    scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(DIR / (BASENAME + ".preview.png"))
    bpy.ops.render.render(write_still=True)

print(json.dumps({"blend":str(BLEND),"glb":str(GLB),"variants":len(plants)}))
