import * as THREE from "three";
import {ROOM_BOUNCE_DATA} from "./room-bounce-registry.js";
import {ROOM_FIXTURE_LOADERS} from "./room-fixture-data.js";
import {decodeSolarDirection} from "./room-solar-transport.js";

// Unit-candela transfer from the already present, shadowed room fixtures.
// Each table contributes its declared reflection order only, never direct light.
export class RoomFixtureTransport{
  constructor({loaders=ROOM_FIXTURE_LOADERS,bounceOrder=1}={}){
    if(bounceOrder!==1&&bounceOrder!==2)throw new Error("Invalid fixture bounce order");
    this.bounceOrder=bounceOrder;
    this.loaders=loaders;this.data=new Map();this.decoded=new Map();this.pending=new Map();this.errors=new Map();this.disposed=false;
    this.point=new THREE.Vector3();this.target=new THREE.Vector3();
    this.stats={loadedRooms:0,cacheBytes:0,lastLoadMs:0,lastComposeMs:0,active:false,lights:0,bounceOrder,model:`static diffuse reflection order ${bounceOrder} of existing guest fixtures; unit source scale`};
  }
  hasSource(key){return Boolean(this.loaders[key]);}
  prepare(key){
    if(this.pending.has(key))return this.pending.get(key);
    if(!this.hasSource(key)||this.data.has(key))return Promise.resolve();
    const started=performance.now(),pending=Promise.resolve().then(this.loaders[key]).then(field=>{
      if(this.disposed)return;
      const original=ROOM_BOUNCE_DATA[key];
      for(const prop of["size","bounds","sourceSHA256","blendSHA256","openings"])
        if(JSON.stringify(field[prop])!==JSON.stringify(original[prop]))throw new Error("Room fixture source/grid differs: "+prop);
      if(field.bounceOrder!==this.bounceOrder||field.fixtures.length!==field.directions.length)throw new Error("Invalid fixture reflection table");
      this.data.set(key,field);this.decoded.set(key,field.directions.map((_,i)=>decodeSolarDirection(field,i)));
      this.stats.loadedRooms=this.data.size;this.stats.cacheBytes=[...this.decoded.values()].flat().reduce((n,v)=>n+v.byteLength,0);this.stats.lastLoadMs=performance.now()-started;
    }).catch(error=>{if(!this.disposed)this.errors.set(key,error);throw error;});
    this.pending.set(key,pending);return pending;
  }
  state(key,context,enabled=1){
    if(enabled>0&&this.errors.has(key))throw this.errors.get(key);
    const field=this.data.get(key),weights=[];
    if(field&&context&&enabled>0){
      const scale=context.scale;
      if(scale&&[scale.x,scale.y,scale.z].some(v=>Math.abs(v-1)>1e-6))throw new Error("Fixture transfer needs a bake matching the room scale");
      for(let i=0;i<field.fixtures.length;i++){
        const light=context.lights[i];if(!light?.visible||light.intensity<=0)continue;
        const source=field.fixtures[i];this.point.copy(light.position).applyMatrix4(context.worldToLocal);this.target.copy(light.target.position).applyMatrix4(context.worldToLocal);
        if(this.point.distanceTo(new THREE.Vector3(...source.position))>1e-5||this.target.distanceTo(new THREE.Vector3(...source.target))>1e-5)
          throw new Error("Fixture reflection position no longer matches its authored source");
        for(const prop of["distance","angle","penumbra","decay"])if(Math.abs(light[prop]-source[prop])>1e-6)throw new Error("Fixture reflection profile changed: "+prop);
        weights.push({index:i,rgb:light.color.toArray().map(v=>v*light.intensity*THREE.MathUtils.clamp(enabled,0,1))});
      }
    }
    this.stats.active=weights.length>0;this.stats.lights=weights.length;
    return{signature:key+"|"+JSON.stringify(weights),weights};
  }
  add(key,output,state,fieldScale){
    if(!state.weights.length)return;
    const started=performance.now(),tables=this.decoded.get(key),scale=1/(2.4*Math.max(fieldScale,.001));
    for(let i=0;i<output.length;i++){
      const channel=i%4;if(channel===3||output[i-channel+3]===0)continue;
      const offset=Math.floor(i/4)*3+channel;let value=0;
      for(const {index,rgb}of state.weights)value+=tables[index][offset]*rgb[channel];
      output[i]=THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(output[i])+value*scale);
    }
    this.stats.lastComposeMs=performance.now()-started;
  }
  clear(){this.stats.active=false;this.stats.lights=0;}
  dispose(){this.disposed=true;this.data.clear();this.decoded.clear();this.pending.clear();this.errors.clear();this.clear();this.stats.cacheBytes=0;this.stats.loadedRooms=0;}
}
