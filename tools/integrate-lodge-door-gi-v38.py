from pathlib import Path
root=Path(__file__).resolve().parents[1]
assert all((root/f'web/src/v2/lodge-door-data/{i}.js').exists()for i in range(3)), 'All independently baked states required before runtime integration'
p=root/'web/src/v2/room-bounce-field.js';s=p.read_text()
assert "from './lodge-door-gi.js'"not in s
s="import {LodgeDoorGI} from './lodge-door-gi.js';\n"+s
s=s.replace('this.lodgeCross=new LodgeCrossRoom();','this.lodgeDoor=new LodgeDoorGI();this.lodgeCross=new LodgeCrossRoom();',1)
s=s.replace('this.stats={lodgeCross:','this.stats={lodgeDoor:this.lodgeDoor.stats,lodgeCross:',1)
s=s.replace('setDoorAngles(value){this.angleDoors.setState(value);}','setDoorAngles(value){this.angleDoors.setState(value);this.lodgeDoor.setState(value);}')
s=s.replace('value=this.angleDoors.aperture(', 'value=this.lodgeDoor.aperture(offset)??this.angleDoors.aperture(',1)
s=s.replace('this.lodgeCross.prepare(this.key),','this.lodgeCross.prepare(this.key),this.lodgeDoor.prepare(this.key),',1)
s=s.replace('if(this.lodgeCross.error&&this.key===LODGE_ROOM_KEY)', 'if(this.lodgeDoor.error&&this.key===LODGE_ROOM_KEY)throw this.lodgeDoor.error;\n    if(this.lodgeDoor.enabled&&this.key===LODGE_ROOM_KEY&&!this.lodgeDoor.ready)this.lodgeDoor.prepare(this.key).catch(()=>{});\n    if(this.lodgeCross.error&&this.key===LODGE_ROOM_KEY)',1)
s=s.replace('"|cross:"+this.lodgeCross.enabled', '"|lodgeDoor:"+this.lodgeDoor.enabled+","+this.lodgeDoor.ready+","+this.lodgeDoor.angle+"|cross:"+this.lodgeCross.enabled',1)
s=s.replace('      this.fixtures.add(this.key,output,state,fieldScale);','''      // Replace only the daylight transport before fixture orders are added;
      // a ready articulated state includes both local and cross-room sources.
      const articulated=this.lodgeDoor.compose(this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,this.lodgeCross.lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value,this.lodgeCross.enabled);
      this.fixtures.add(this.key,output,state,fieldScale);''',1)
s=s.replace('      this.lodgeCross.apply(this.key,output,','      if(!articulated)this.lodgeCross.apply(this.key,output,',1)
s=s.replace('toHalfFloat(visibility[(c+3)*count+i]/255)','toHalfFloat((this.lodgeDoor.aperture((c+3)*count+i)??visibility[(c+3)*count+i])/255)',1)
s=s.replace('this.dayData.clear();this.lodgeCross.dispose();','this.dayData.clear();this.lodgeDoor.dispose();this.lodgeCross.dispose();',1)
p.write_text(s)
p=root/'web/src/v2/settlements.js';s=p.read_text();s=s.replace("{id:e.id+':dining',pose:","{id:e.id+':dining',entityId:e.id,pose:",1);s=s.replace('this.doorAngles?.(room.id)','this.doorAngles?.(room.entityId??room.id)',1);s=s.replace('this.doorOpenness?.(room.id)','this.doorOpenness?.(room.entityId??room.id)',1);p.write_text(s)
