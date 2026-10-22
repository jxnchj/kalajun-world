import * as THREE from "three";

// Editable deterministic authoring source; all dimensions are metres.
// No image cards: petals, leaves, branching stems and seed heads are real geometry.
// aPlantWind: x=root-to-tip structural weight, y=flexible head/leaf response, z=local phase.
const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
const C = (hex) => new THREE.Color(hex);
const green = C("#3f713c"), darkGreen = C("#315c32"), newGreen = C("#66833e");
const gold = C("#dda83e"), ochre = C("#a87526");
const clamp = THREE.MathUtils.clamp;
function random(seed) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);
function bezier(a, b, c, t) {
  return a.clone().multiplyScalar((1-t)**2).addScaledVector(b, 2*t*(1-t)).addScaledVector(c, t*t);
}
class PlantMesh {
  constructor(height) { this.height=height; this.p=[]; this.c=[]; this.w=[]; this.i=[]; }
  vertex(p, color, flexibility=0, phase=0) {
    const index=this.p.length/3;
    this.p.push(p.x,p.y,p.z); this.c.push(color.r,color.g,color.b);
    const h=clamp(p.y/this.height,0,1);
    this.w.push(h*h, flexibility*h, phase);
    return index;
  }
  grid(rows, columns, point, color, flexibility, phase, reverse=false) {
    const first=this.p.length/3;
    for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++) {
      const t=i/rows, s=j/columns;
      this.vertex(point(t,s), typeof color==="function"?color(t,s):color, flexibility, phase);
    }
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++) {
      const a=first+i*(columns+1)+j,b=a+columns+1,c=a+1,d=b+1;
      this.i.push(...(reverse?[a,c,b,c,d,b]:[a,b,c,c,b,d]));
    }
  }
  tube(points,r0,r1,color,sides=5,phase=0) {
    const first=this.p.length/3;
    for(let i=0;i<points.length;i++) {
      const t=i/(points.length-1), p=points[i];
      const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(i-1,0)]).normalize();
      const reference=Math.abs(tangent.y)>.9?v(1,0,0):up;
      const side=tangent.clone().cross(reference).normalize(), other=tangent.clone().cross(side).normalize();
      const radius=THREE.MathUtils.lerp(r0,r1,t);
      for(let k=0;k<=sides;k++) {
        const a=k/sides*TAU;
        this.vertex(p.clone().addScaledVector(side,Math.cos(a)*radius).addScaledVector(other,Math.sin(a)*radius),color,.035,phase);
      }
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++) {
      const a=first+i*(sides+1)+j,b=a+sides+1,c=a+1,d=b+1;
      this.i.push(a,c,b,c,d,b);
    }
  }
  ellipsoid(center,radii,color,flexibility=.6,phase=0,segments=6,rings=3) {
    const g=new THREE.SphereGeometry(1,segments,rings);
    const p=g.attributes.position, first=this.p.length/3;
    for(let i=0;i<p.count;i++)this.vertex(v(p.getX(i)*radii.x+center.x,p.getY(i)*radii.y+center.y,p.getZ(i)*radii.z+center.z),color,flexibility,phase);
    for(const i of g.index.array)this.i.push(first+i);
    g.dispose();
  }
  finish() {
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute("color",new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute("aPlantWind",new THREE.Float32BufferAttribute(this.w,3));
    g.setIndex(this.i); g.computeVertexNormals(); g.computeBoundingBox();g.computeBoundingSphere();
    return g;
  }
}
function stem(mesh,a,control,b,radius,phase=0,segments=6,sides=5) {
  const points=Array.from({length:segments+1},(_,i)=>bezier(a,control,b,i/segments));
  mesh.tube(points,radius,radius*.48,green,sides,phase);
}
function leaf(mesh,base,direction,length,width,phase,feather=false,low=false) {
  const d=direction.clone().normalize(),side=up.clone().cross(d).normalize();
  const point=(t)=>base.clone().addScaledVector(d,length*t).addScaledVector(up,length*(.2*Math.sin(t*Math.PI)-.12*t*t));
  if(low) {
    // A bent diamond lamina plus four narrow lobes: actual leaf surface, no card.
    const color=darkGreen.clone().lerp(newGreen,.4);
    const a=mesh.vertex(point(0),color,.4,phase);
    const b=mesh.vertex(point(.5).addScaledVector(side,width),color,.4,phase);
    const c=mesh.vertex(point(1),color,.4,phase);
    const other=mesh.vertex(point(.5).addScaledVector(side,-width),color,.4,phase);
    mesh.i.push(a,b,other,c,other,b);
    if(feather)for(let k=0;k<2;k++)for(const sign of [-1,1]) {
      const t=.31+k*.30,base=point(t),l=length*(.395-k*.11);
      const axis=d.clone().multiplyScalar(.6).addScaledVector(side,sign).normalize(),transverse=up.clone().cross(axis).normalize();
      const first=mesh.vertex(base,color,.44,phase+(1+k*2)*.31);
      const mid=mesh.vertex(base.clone().addScaledVector(axis,l*.52)
        .addScaledVector(transverse,width).addScaledVector(up,-.018*.52),color,.44,phase+(1+k*2)*.31);
      const end=mesh.vertex(base.clone().addScaledVector(axis,l).addScaledVector(up,-.018),color,.44,phase+(1+k*2)*.31);
      mesh.i.push(first,mid,end);
    }
    return;
  }
  if(!feather) {
    mesh.grid(4,2,(t,s)=>point(t).addScaledVector(side,(s*2-1)*width*Math.pow(Math.sin(Math.PI*t),.65))
      .addScaledVector(up,-Math.abs(s*2-1)*width*.23*Math.sin(t*Math.PI)),
      (t)=>darkGreen.clone().lerp(newGreen,.3+.3*t),.4,phase);
    return;
  }
  // A real divided cosmos leaf: a rachis and five pairs of narrow lobes.
  mesh.tube([point(0),point(.5),point(1)],.0012,.00045,green,3,phase);
  for(let k=0;k<5;k++)for(const sign of [-1,1]) {
    const t=.16+k*.15, a=point(t), l=length*(.45-.055*k);
    const axis=d.clone().multiplyScalar(.6).addScaledVector(side,sign).normalize();
    const transverse=up.clone().cross(axis).normalize();
    mesh.grid(2,1,(u,s)=>a.clone().addScaledVector(axis,l*u)
      .addScaledVector(up,.018*Math.sin(u*Math.PI)-.018*u*u)
      .addScaledVector(transverse,(s*2-1)*width*(.8+.2*Math.sin(u*Math.PI))*(1-u*.92)),
      darkGreen.clone().lerp(newGreen,.22+k*.07),.44,phase+k*.31);
  }
}
function frame(normal) {
  const n=normal.clone().normalize();
  const u=v(1,0,0).addScaledVector(n,-n.x).normalize();
  return {n,u,w:n.clone().cross(u).normalize()};
}
function flower(mesh,center,normal,radius,petals,baseColor,phase,{cosmos=false,seed=1,low=false}={}) {
  const r=random(seed),{n,u,w}=frame(normal),spin=r()*TAU;
  const diskR=radius*(cosmos?.22:.28);
  for(let k=0;k<petals;k++) {
    const angle=spin+k/petals*TAU+(r()-.5)*.09;
    const radial=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(w,Math.sin(angle));
    const lateral=u.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(w,Math.cos(angle));
    const length=radius*(.78+r()*.09),width=length*(cosmos?.43:.17),curl=.12+r()*.22,twist=(r()-.5)*.22;
    mesh.grid(low?1:cosmos?4:3,low?1:cosmos?4:2,(t,s)=>{
      const a=s*2-1;
      const shape=cosmos?(.12+.88*Math.sin(Math.min(1,t*1.15)*Math.PI*.54)):(.18+.82*Math.sin(Math.PI*t*.78));
      const notch=cosmos&&t>.99?radius*.025*Math.abs(Math.sin((a+1)*Math.PI*1.5)):0;
      return center.clone().addScaledVector(radial,diskR*.67+length*t-notch)
        .addScaledVector(lateral,a*width*shape)
        .addScaledVector(n,radius*(curl*t*t+.09*a*a*t+twist*a*t));
    },(t,s)=>{
      // Intrinsic darker eye and paler rim; no baked directional highlight.
      const pigment=baseColor.clone();
      pigment.multiplyScalar(.70+.30*THREE.MathUtils.smoothstep(t,0,.36));
      return pigment.lerp(C("#f9eee3"),.07*Math.pow(t,3)+.015*Math.abs(s*2-1));
    },.8,phase+k*.035);
  }
  mesh.grid(low?1:2,low?5:10,(t,s)=>center.clone().addScaledVector(u,Math.cos(s*TAU)*diskR*t)
    .addScaledVector(w,Math.sin(s*TAU)*diskR*t).addScaledVector(n,diskR*.42*(1-t*t)),
    (t)=>gold.clone().lerp(ochre,t*.5),.7,phase);
  // Raised florets keep the flower centre three-dimensional without 110 tubes/head.
  for(let k=0;k<(low?0:9);k++) {
    const a=k*2.39996,rr=diskR*.8*Math.sqrt((k+.5)/9);
    const p=center.clone().addScaledVector(u,Math.cos(a)*rr).addScaledVector(w,Math.sin(a)*rr)
      .addScaledVector(n,diskR*(.32+.13*r()));
    mesh.ellipsoid(p,v(radius*.035,radius*.04,radius*.035),k%3?gold:ochre,.7,phase,4,2);
  }
  // Green calyx under the petal cup, visible from a walking camera.
  mesh.ellipsoid(center.clone().addScaledVector(n,-diskR*.3),v(diskR*.7,diskR*.45,diskR*.7),green,.5,phase,low?4:6,low?2:3);
}
function cosmos(color,seed,low=false) {
  const mesh=new PlantMesh(1.0),r=random(seed);
  const heads=[
    {p:v(.025,1,0),c:v(-.045,.53,.025),n:v(.14,1,-.12),radius:.045},
    {p:v(.20,.80,.07),c:v(.05,.52,.025),n:v(.86,.72,.25),radius:.039},
    {p:v(-.16,.67,-.12),c:v(-.06,.46,-.045),n:v(-.52,.82,-.58),radius:.034},
  ];
  for(let i=0;i<heads.length;i++) {
    const h=heads[i],a=i?bezier(v(0,0,0),heads[0].c,heads[0].p,.30+i*.035):v(0,0,0);
    stem(mesh,a,h.c,h.p,i?.0024:.0035,i*.8,low?3:6,low?3:5);
    flower(mesh,h.p,h.n,h.radius,8,color,i*.8,{cosmos:true,seed:seed+i*7,low});
    if(i)for(let j=0;j<2;j++) {
      const t=.38+j*.26,angle=i*2.399+j*2.1;
      leaf(mesh,bezier(a,h.c,h.p,t),v(Math.cos(angle),.22,Math.sin(angle)),.16-j*.025,.0025,i*.8+j*.31,true,low);
    }
  }
  for(let k=0;k<7;k++) {
    const h=.1+k*.079,a=k*2.399+r()*.25;
    leaf(mesh,bezier(v(0,0,0),heads[0].c,heads[0].p,h),v(Math.cos(a),.24,Math.sin(a)),.22-k*.014,.0026,k*.71,true,low);
  }
  const bud=v(.10,.57,-.15);
  stem(mesh,bezier(v(0,0,0),heads[0].c,heads[0].p,.39),v(.045,.51,-.08),bud,.0018,2.1,low?2:4,low?3:5);
  mesh.ellipsoid(bud,v(.008,.012,.008),green.clone().lerp(color,.25),.75,2.1,low?4:6,low?2:4);
  return mesh.finish();
}
function daisy(seed,low=false) {
  const mesh=new PlantMesh(.56),r=random(seed);
  for(let k=0;k<3;k++) {
    const a=k*2.399,top=v(Math.cos(a)*.095,.42+r()*.14,Math.sin(a)*.095);
    stem(mesh,v(0,0,0),top.clone().multiplyScalar(.48).add(v(.025,0,-.02)),top,.0021,k*.6,low?2:5,low?3:5);
    flower(mesh,top,v(Math.cos(a)*.3,1,Math.sin(a)*.3),.026,12,C("#eee9cf"),k*.6,{seed:seed+k,low});
  }
  for(let k=0;k<6;k++) {
    const a=k*2.399;
    leaf(mesh,v(0,.03+k*.025,0),v(Math.cos(a),.25,Math.sin(a)),.12,.017,k*.5,false,low);
  }
  return mesh.finish();
}
function blueFlower(seed,low=false) {
  const mesh=new PlantMesh(.46),r=random(seed);
  for(let k=0;k<4;k++) {
    const a=k*2.399,p=v(Math.cos(a)*.09,.30+r()*.16,Math.sin(a)*.09);
    stem(mesh,v(0,0,0),p.clone().multiplyScalar(.6),p,.0018,k*.61,low?2:5,low?3:5);
    flower(mesh,p,v(Math.cos(a)*.25,1,Math.sin(a)*.25),.019,5,C("#749cd2"),k*.61,{seed:seed+k,low});
    leaf(mesh,p.clone().multiplyScalar(.5),v(Math.cos(a),.45,Math.sin(a)),.08,.012,k*.61,false,low);
  }
  for(let k=0;k<4;k++)leaf(mesh,v(0,.02,0),v(Math.cos(k*1.57),.3,Math.sin(k*1.57)),.09,.014,k*.7,false,low);
  return mesh.finish();
}
function seedHead(seed,low=false) {
  const mesh=new PlantMesh(.72),r=random(seed);
  const ripe=C("#b09c62"),husk=C("#869257");
  for(let k=0;k<3;k++) {
    const a=k*2.399,top=v(Math.cos(a)*.065,.57+r()*.15,Math.sin(a)*.065);
    stem(mesh,v(0,0,0),top.clone().multiplyScalar(.6),top,.0015,k*.7,low?2:5,low?3:5);
    // Small upright meadow panicles; no wide white feather/awn cards.
    for(let j=0;j<6;j+=low?2:1) {
      const t=.62+j*.062,base=top.clone().multiplyScalar(t);
      for(const sign of [-1,1]) {
        const len=.026*(1-j/8),sideAngle=a+sign*1.15;
        const tip=base.clone().add(v(Math.cos(sideAngle)*len,len*.6,Math.sin(sideAngle)*len));
        if(!low)mesh.tube([base,tip],.0007,.00035,husk,3,k*.7);
        mesh.ellipsoid(tip,v(.0028,.0065,.0028),ripe,.85,k*.7+j*.13,low?3:4,2);
      }
    }
    for(let j=0;j<2;j++)leaf(mesh,top.clone().multiplyScalar(.17+j*.2),
      v(Math.cos(a+j),.5,Math.sin(a+j)),.19,.005,k*.7,false,low);
  }
  return mesh.finish();
}
export function createFlowerAssets({low=false}={}) {
  const material=new THREE.MeshStandardMaterial({
    name:low?"v2-meadow-flowers-lod":"v2-living-flowers",color:0xffffff,vertexColors:true,roughness:.82,metalness:0,
    side:THREE.DoubleSide,
  });
  const definitions=[
    ["cosmos_pink","cosmos",1.05,.47,()=>cosmos(C("#df9bbd"),31,low)],
    ["cosmos_white","cosmos",1.05,.47,()=>cosmos(C("#f1eddd"),47,low)],
    ["cosmos_rose","cosmos",1.05,.47,()=>cosmos(C("#c75387"),63,low)],
    ["wild_daisy","wildflower",.60,.30,()=>daisy(73,low)],
    ["wild_blue","wildflower",.50,.26,()=>blueFlower(89,low)],
    ["seed_head","wildflower",.76,.42,()=>seedHead(97,low)],
  ];
  const variants=definitions.map(([id,kind,height,footprint,build])=>{
    const geometry=build();geometry.name=id;
    return {id,kind,height,footprint,role:id==="seed_head"?"seed":"flower",
      parts:[{geometry,material,role:id==="seed_head"?"seed":"plant"}],
      triangles:geometry.index.count/3};
  });
  let disposed=false;
  return {variants,materials:[material],dispose(){
    if(disposed)return;disposed=true;
    for(const variant of variants)for(const part of variant.parts)part.geometry.dispose();
    material.dispose();
  }};
}

// Load the editable Blender export. No silent procedural fallback: loading or
// contract failures are reported so an artist sees a broken export immediately.
export async function loadFlowerAssets(url = "./assets/v2/meadow-flowers.glb") {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  return flowerAssetsFromScene(gltf.scene);
}

// Also useful for an offline GLB round-trip check without an HTTP server.
export function flowerAssetsFromScene(scene) {
  const meshes = [], materials = new Set(), geometries = new Set();
  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    if (!node.isMesh) return;
    meshes.push(node); geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  };
  try {
    const expected = new Set(["cosmos_pink", "cosmos_white", "cosmos_rose", "wild_daisy", "wild_blue", "seed_head"]);
    const variants = meshes.map((mesh) => {
      const metadata = mesh.userData, id = metadata.id ?? mesh.name;
      if (!expected.delete(id)) throw new Error("Unexpected or duplicate flower variant: " + id);
      if (Array.isArray(mesh.material) || !mesh.material.isMeshStandardMaterial)
        throw new Error("Flower variant requires one PBR material: " + id);
      const geometry = mesh.geometry;
      const wind = geometry.getAttribute("_plant_wind") ?? geometry.getAttribute("_PLANT_WIND");
      if (!wind || wind.itemSize !== 3 || wind.count !== geometry.attributes.position.count)
        throw new Error("Missing or malformed _PLANT_WIND: " + id);
      if (!geometry.getAttribute("color")) throw new Error("Missing flower albedo colors: " + id);
      if (!["cosmos", "wildflower"].includes(metadata.kind) || !(metadata.height > 0) || !(metadata.footprint > 0))
        throw new Error("Missing flower metadata: " + id);
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.setAttribute("aPlantWind", wind);
      geometry.deleteAttribute("_plant_wind"); geometry.deleteAttribute("_PLANT_WIND");
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      mesh.material.vertexColors = true;
      return { id, kind: metadata.kind, height: metadata.height, footprint: metadata.footprint,
        role: metadata.role, triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3,
        parts: [{ geometry, material: mesh.material, role: metadata.role === "seed" ? "seed" : "plant" }] };
    });
    if (expected.size) throw new Error("Missing flower variants: " + [...expected].join(", "));
    return { variants, materials: [...materials], dispose };
  } catch (error) { dispose(); throw error; }
}

// Same botanical layout and seeds as the near mesh, with sparse true 3D surfaces.
export function createFlowerLODAssets() { return createFlowerAssets({low:true}); }
export async function loadFlowerLODAssets(url = "./assets/v2/meadow-flowers-lod.glb") {
  return loadFlowerAssets(url);
}
