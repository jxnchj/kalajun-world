import {addRoute3Courtyard} from './route3-courtyard38.js';
import * as THREE from "three";
import {createBoardwalkMaterials} from "./boardwalk-material.js";
import {boardwalkTimber,addBoardwalkTimber} from "./boardwalk-timber.js";
import { createPathMaterials } from "./path-materials.js";
import { householdYards, householdYardGeometry, householdYardMaterial } from "./household-yards.js";
// Authored routes share the physical terrain. Boards have thickness and level tops.
export class WorldPaths {
  constructor(world) {
    this.group=new THREE.Group();this.group.name="world-paths";this.materials=[];
    this.surfaces=createPathMaterials();const {dirt,wood}=this.surfaces;
    this.materials.push(dirt,wood);
    for(const line of [...(world.objects.tracks||[]),...(world.objects.paths||[])]){
      const pos=[],uv=[],idx=[];let length=0;
      for(let segment=0;segment<line.pts.length-1;segment++){
        const a=line.pts[segment],b=line.pts[segment+1],dx=b[0]-a[0],dz=b[1]-a[1],dist=Math.hypot(dx,dz);if(dist<.01)continue;
        const nx=-dz/dist,nz=dx/dist,n=Math.ceil(dist/1.5);
        for(let j=0;j<=n;j++){
          const t=j/n,x=a[0]+dx*t,z=a[1]+dz*t,k=pos.length/3,half=(line.width||1.5)/2;
          for(const side of [-1,1]){const px=x+side*nx*half,pz=z+side*nz*half;pos.push(px,world.surface.heightAt(px,pz)+.035,pz);uv.push((side+1)/2,(length+t*dist)/2);}
          if(j<n)idx.push(k,k+1,k+2,k+1,k+3,k+2);
        }
        length+=dist;
      }
      if(!pos.length)continue;
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      const mesh=new THREE.Mesh(g,dirt);mesh.receiveShadow=true;mesh.userData.kind="dirt";this.group.add(mesh);
    }
    const yards=householdYards(world);this.stats={...yards.stats,version:yards.version,enabled:yards.enabled};
    const yardMaterial=yards.routes.length?householdYardMaterial(dirt):null;if(yardMaterial)this.materials.push(yardMaterial);
    for(const route of yards.routes){
      const geometry=householdYardGeometry(world,route),mesh=new THREE.Mesh(geometry,yardMaterial);mesh.name=route.id;mesh.receiveShadow=true;
      mesh.userData={kind:"household-yard",entityId:route.entityId,householdStyle:route.style,role:route.role,publicConnection:!!route.connection};this.group.add(mesh);this.stats.triangles+=geometry.index.count/3;
    }
    this.group.userData.householdYards={...this.stats,households:yards.households};
    const timber=boardwalkTimber(world);this.stats.timber={enabled:timber.enabled,routes:timber.routes.length,pieces:timber.pieces,triangles:timber.triangles,maxStep:Math.max(0,...timber.routes.map(r=>r.maxStep))};
    if(timber.enabled){this.timberSurfaces=createBoardwalkMaterials();this.materials.push(...this.timberSurfaces.materials);addBoardwalkTimber(this.group,world,this.timberSurfaces.materials);}
    const courtyard=addRoute3Courtyard(this.group,world,dirt);if(courtyard){this.materials.push(courtyard.material);this.stats.route3Courtyard=courtyard.stats;}
    const boards=[],transform=new THREE.Object3D();
    for(const line of timber.enabled?[]:(world.objects.boardwalks||[]))for(let segment=0;segment<line.pts.length-1;segment++){
      const a=line.pts[segment],b=line.pts[segment+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
      const n=Math.ceil(length/.3),yaw=Math.atan2(-dx,-dz);
      for(let j=0;j<n;j++){
        const t=(j+.5)/n,x=a[0]+dx*t,z=a[1]+dz*t;
        transform.position.set(x,world.surface.heightAt(x,z)+.15,z);transform.rotation.set(0,yaw,0);transform.scale.set(line.width||1.2,.12,length/n*.92);transform.updateMatrix();boards.push(transform.matrix.clone());
      }
    }
    if(boards.length){
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),wood,boards.length);boards.forEach((m,i)=>{mesh.setMatrixAt(i,m);const v=.83+.17*((Math.sin(i*78.233)*43758.5453)%1+1)/2;mesh.setColorAt(i,new THREE.Color(v,v*.985,v*.96));});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.kind="boardwalk";mesh.computeBoundingSphere();this.group.add(mesh);
    }
  }
  async loadSurfaces(){if(this.timberSurfaces){await this.timberSurfaces.load();this.stats.timber.materialsReady=true;}return this;}
  dispose(){this.group.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();});this.materials.forEach(m=>m.dispose());this.surfaces.dispose();this.timberSurfaces?.dispose();}
}
