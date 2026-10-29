import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setShoreAssetReview42} from './shore-asset-review42-state.js';
import {createShoreRockGeometry} from './shore-stones.js';
import {createShoreRockMaterial} from './water.js';
const p=new URLSearchParams(location.search),variant=p.get('shoreAsset42')==='5'?'05':'01',enabled=['1','5'].includes(p.get('shoreAsset42'));
if(enabled){
 const gltf=await new GLTFLoader().loadAsync('./assets/v2/shore-candidate42/rock'+variant+'.glb');let mesh;gltf.scene.traverse(o=>{if(o.isMesh){if(mesh)throw Error('Expected unique candidate shell');mesh=o;}});gltf.scene.updateMatrixWorld(true);const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=createShoreRockMaterial({scanned:true}),source=mesh.material;Object.assign(material,{map:source.map,normalMap:source.normalMap,roughnessMap:source.roughnessMap,aoMap:source.aoMap,roughness:source.roughness,metalness:0});material.name='shore-asset42-moss-rock'+variant;material.normalScale.copy(source.normalScale);
 setShoreAssetReview42({geometry,material,originalGeometry:createShoreRockGeometry()});
}
await import('./main.js');
const box=document.createElement('div');Object.assign(box.style,{position:'fixed',top:'8px',left:'40%',zIndex:10000,background:'#fff',color:'#222',padding:'8px'});box.textContent=enabled?'单石 rock'+variant+'：同源显示/碰撞/草接触':'单石原版对照';
for(const [label,value] of [['原版','0'],['rock01','1'],['rock05 稳定支撑','5']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{const u=new URL(location.href);u.searchParams.set('shoreAsset42',value);location.href=u;};box.append(b);}document.body.append(box);

const pose=document.createElement("button");pose.textContent="定位代表岸石";pose.onclick=()=>{const d=window.kalajunV2?.debug;if(!d){pose.textContent="世界尚未就绪";return;}d.controls.setPose(-3611.851169467755,4805.483400316967,1.7,-29.88794104541604,-10,2329.157270885741);pose.textContent="已定位代表岸石";};box.append(pose);
