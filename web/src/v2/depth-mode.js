// r186's CSMFrustum supports reverse depth, but CSM constructs it without
// forwarding the camera convention. Repair only this world's CSM instance.
export function configureCSMDepth(csm,camera){
  csm.mainFrustum.zNear=camera.reversedDepth?1:-1;
  csm.mainFrustum.zFar=camera.reversedDepth?0:1;
  csm.updateFrustums();
  for(const light of csm.lights){light.shadow.camera._reversedDepth=camera.reversedDepth;light.shadow.camera.updateProjectionMatrix();}
}
export function skyFarDepth(shader){
  return shader.replace("gl_Position.z = gl_Position.w;",`#ifdef USE_REVERSED_DEPTH_BUFFER
gl_Position.z = 0.0;
#else
gl_Position.z = gl_Position.w;
#endif`);
}

// PCF adds bias to the sampled receiver depth before comparing.
export function shadowDepthBias(value,reversed){return reversed?-value:value;}
