import * as T from 'three';
import {reachPlantIntersectsWater40} from './reach-water-contact40.js';
// Rendered terrain can differ from the analytic surface by fractions of a mm.
// Recover only a water-conflicting leaf from 2mm to 1mm of actual soil burial.
// This changes real submitted vertices, never the water contact threshold.
const leafIndices41=new WeakMap();
export function recoverReachLeafBurial41(world,root,actual,groups,context=new Map()){
 const recovered=[],index=actual.index,positions=actual.attributes.position;
 let cached=leafIndices41.get(index);if(!cached||cached.version!==index.version){cached={version:index.version,groups:new Map()};leafIndices41.set(index,cached);}
 for(const group of groups){
  const key=group.start+','+group.count;let indices=cached.groups.get(key);if(!indices){indices=[];for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(ids.every(j=>j>=group.start&&j<group.start+group.count))indices.push(...ids);}cached.groups.set(key,indices);}
  if(!indices.length)continue;const leaf=new T.BufferGeometry();for(const [name,attribute]of Object.entries(actual.attributes))leaf.setAttribute(name,attribute);leaf.setIndex(indices);
  const hit=reachPlantIntersectsWater40(world,root,[leaf],context);leaf.dispose();if(!hit)continue;
  for(let i=group.start;i<group.start+group.count;i++)positions.setY(i,positions.getY(i)+.001/(root.sy??root.s));
  recovered.push(group);
 }
 return recovered;
}
