import {LodgeStairPlantField} from './lodge-stair-plants.js';
import data from './guest-stair-obstacle-data.js';
export class GuestStairPlantField extends LodgeStairPlantField {
 constructor(world,{enabled=new URLSearchParams(globalThis.location?.search||'').get('guestStairPlants')!=='0'}={}){super(world,{enabled,obstacles:data});}
}
