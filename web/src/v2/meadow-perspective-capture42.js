// Isolated exact-ray crop of an existing camera; no change to source geometry.
import * as T from 'three';
export function perspectiveRootCapture42(camera,center,size){
 if(!camera.isPerspectiveCamera||!(size>0))throw Error('Perspective source camera and positive crop required');
 camera.updateMatrixWorld();const local=center.clone().applyMatrix4(camera.matrixWorldInverse),depth=-local.z;if(depth<=size)throw Error('Root crop intersects camera');
 const ndc=center.clone().project(camera),halfX=camera.projectionMatrix.elements[0]*size/depth,halfY=camera.projectionMatrix.elements[5]*size/depth,cam=camera.clone(),e=cam.projectionMatrix.elements,source=camera.projectionMatrix.elements;
 for(let col=0;col<4;col++){e[col*4]=(source[col*4]-ndc.x*source[col*4+3])/halfX;e[col*4+1]=(source[col*4+1]-ndc.y*source[col*4+3])/halfY;}
 cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();cam.updateMatrixWorld();
 return{camera:cam,projection:[local.x,local.y,depth]};
}
export function perspectiveRootDepth42(windowDepth,camera,rootDepth){const e=camera.projectionMatrix.elements;return rootDepth-e[14]/(windowDepth*2-1+e[10]);}
