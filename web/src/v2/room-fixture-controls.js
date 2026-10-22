import * as THREE from "three";

const MODES=["auto","on","off"];
const LABELS={auto:"随光阴",on:"开启",off:"关闭"};

// One switch per actual room instance. Automatic is the previous lighting
// contract; explicit on uses the existing nighttime fixture rating.
export class RoomFixtureControls{
  constructor(rooms,{document:doc=globalThis.document,eventTarget=globalThis.window}={}){
    this.rooms=rooms;this.modes=new Map();this.active=null;this.materials=new WeakSet();
    this.uniforms={uRoomFixtureEnabled:{value:rooms.map(()=>1)},uRoomFixtureTransform:{value:rooms.map(({pose})=>{
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot);
      return new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),q,new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z)).invert();
    })},uRoomFixtureBounds:{value:rooms.map(({asset})=>new THREE.Vector4(asset.floor.x0,asset.floor.x1,asset.floor.z0-.2,asset.floor.z1+.2))}};
    const panel=doc?.querySelector("#world-panel details");
    if(panel){
      this.button=doc.createElement("button");this.button.id="room-fixture-switch";this.button.type="button";this.button.hidden=true;
      this.button.style.cssText="border:0;border-top:1px solid #ffffff26;background:none;padding:12px 0;width:100%;text-align:left;font-size:11px;margin-top:12px";
      this.button.title="切换当前客房灯光：随光阴、开启、关闭（L）";
      this.button.setAttribute("aria-keyshortcuts","L");this.button.addEventListener("click",()=>this.cycle());
      panel.insertBefore(this.button,panel.querySelector("#map-toggle"));
      this.eventTarget=eventTarget;this.onKey=e=>{
        if(e.code!=="KeyL"||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target?.isContentEditable||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target?.tagName??""))return;
        if(this.active){e.preventDefault();this.cycle();}
      };
      eventTarget?.addEventListener("keydown",this.onKey);
    }
  }
  mode(id){return this.modes.get(id)??"auto";}
  setMode(id,mode){
    const i=this.rooms.findIndex(r=>r.id===id);
    if(i<0||!MODES.includes(mode))throw new Error("Unknown room or fixture mode");
    this.modes.set(id,mode);this.uniforms.uRoomFixtureEnabled.value[i]=mode==="off"?0:1;this.render();return mode;
  }
  cycle(){if(this.active)return this.setMode(this.active.id,MODES[(MODES.indexOf(this.mode(this.active.id))+1)%MODES.length]);}
  setActive(room){const id=room?.id??null;if((this.active?.id??null)===id)return;this.active=room??null;this.render();}
  render(){
    if(!this.button)return;
    this.button.hidden=!this.active;
    if(this.active){this.button.textContent="客房灯 · "+LABELS[this.mode(this.active.id)]+"　L";this.button.setAttribute("aria-label",this.button.textContent+"，点击切换");}
  }
  power(id,night){const mode=this.mode(id);return mode==="off"?0:mode==="on"?.48:.018+.462*night;}
  register(materials){
    if(!this.rooms.length)return;
    for(const material of materials){
      if(this.materials.has(material)||!(material.userData.sourceMaterialNames??[material.name]).some(name=>/(?:^|\/)v2_glow$/.test(name)))continue;
      this.materials.add(material);
      const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),count=this.rooms.length;
      material.onBeforeCompile=(shader,renderer)=>{
        previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
        shader.vertexShader="varying vec3 vRoomFixtureWorldPosition;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",`#include <project_vertex>
vec4 fixtureWorldVertex=vec4(transformed,1.0);
#ifdef USE_INSTANCING
fixtureWorldVertex=instanceMatrix*fixtureWorldVertex;
#endif
vRoomFixtureWorldPosition=(modelMatrix*fixtureWorldVertex).xyz;`);
        shader.fragmentShader=`varying vec3 vRoomFixtureWorldPosition;
uniform float uRoomFixtureEnabled[${count}];
uniform mat4 uRoomFixtureTransform[${count}];
uniform vec4 uRoomFixtureBounds[${count}];\n`+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
for(int room=0;room<${count};room++){
 vec3 p=(uRoomFixtureTransform[room]*vec4(vRoomFixtureWorldPosition,1.0)).xyz;
 vec4 b=uRoomFixtureBounds[room];
 if(p.x>=b.x&&p.x<=b.y&&p.z>=b.z&&p.z<=b.w&&p.y>0.0&&p.y<2.7)totalEmissiveRadiance*=uRoomFixtureEnabled[room];
}`);
      };
      material.customProgramCacheKey=()=>key+"-room-fixture-switch-"+count;material.needsUpdate=true;
    }
  }
  dispose(){this.eventTarget?.removeEventListener("keydown",this.onKey);this.button?.remove();this.modes.clear();this.active=null;}
}
