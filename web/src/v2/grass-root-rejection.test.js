import test from 'node:test';
import assert from 'node:assert/strict';
import {actualMeadowEcology} from '../../../tools/profile-meadow-v38.mjs';
import {MEADOW,cellRandom} from './ecology.js';
import {seatForestShoulderRoot} from './forest-bank-shoulder.js';
import {brookShoulderSuitable,valleyShoulderSuitable,valleySourceExcluded,grassStemFeet,seatBrookShoulderGrass} from './brook-shoulder-grass.js';
import {relocateShorePlant,getShoreStoneField} from './shore-contact.js';
import {createBrookWetAsset} from './brook-wetgrass.js';
// Frozen pre-optimization method: preserves all original early tests and seating.
function legacyGrassAt(ix,iz) {
    if(this.world.forestShoulderSourceWorld){
      if(!this.forestShoulderSourceEcology){this.forestShoulderSourceEcology=Object.create(this);this.forestShoulderSourceEcology.world=this.world.forestShoulderSourceWorld;}
      return seatForestShoulderRoot(this.world,this.forestShoulderSourceEcology._grassAt(ix,iz));
    }
    const cell=MEADOW.cell,x=(ix+.15+.7*cellRandom(ix,iz,11))*cell,z=(iz+.15+.7*cellRandom(ix,iz,12))*cell;
    const oldExcluded=this.excluded(x,z,.3)||(this.riverValleyWet&&valleySourceExcluded(this.world,x,z,.3)),brookShoulder=oldExcluded&&(brookShoulderSuitable(this.world,x,z)||(this.riverValleyWet&&valleyShoulderSuitable(this.world,x,z)))&&!this.excluded(x,z,.3,true);
    if(oldExcluded&&!brookShoulder)return null;
    const lc=this.world.landcoverAt(x,z),normal=this.world.surface.normalAt(x,z,2);
    if(lc.b>.12||normal.y<.72||(!brookShoulder&&cellRandom(ix,iz,13)<lc.g*.85+lc.r*.52))return null;
    const patch=cellRandom(Math.floor(x/5),Math.floor(z/5),79),vigor=.78+.35*patch;
    if(cellRandom(ix,iz,81)>.72+.22*patch)return null;
    const flowers=this.habitat(x,z,0),s=.80+cellRandom(ix,iz,14)*.50;
    const root={id:"grass:"+ix+":"+iz,x,y:this.world.surface.heightAt(x,z)-.035,z,s,sy:s*vigor*(1-flowers*.23),rot:cellRandom(ix,iz,15)*Math.PI*2};
    // Added wet-bank tufts keep every leaf and full stem height, with a
    // narrower rooted footprint suited to a shoulder instead of meadow sod.
    // New wet-bank sources retain full leaf dimensions; per-blade feet adapt below.
    const suitable=(px,pz)=>{
      if(brookShoulder?(!(brookShoulderSuitable(this.world,px,pz)||(this.riverValleyWet&&valleyShoulderSuitable(this.world,px,pz)))||this.excluded(px,pz,.3,true)):this.excluded(px,pz,.3))return false;
      const cover=this.world.landcoverAt(px,pz);return cover.b<=.12&&Math.abs(cover.r-lc.r)<.25&&Math.abs(cover.g-lc.g)<.35&&this.world.surface.normalAt(px,pz,2).y>=.72;
    };
    // Preserve every previously validated narrow-base shoulder tuft exactly;
    // the richer per-blade asset only adds further admissible source roots.
    if(brookShoulder&&brookShoulderSuitable(this.world,x,z)&&cellRandom(ix,iz,13)>=lc.g*.85+lc.r*.52){
      const compact={...root,s:root.s*.48},shifted=relocateShorePlant(this.world,compact,this.shoreGrassEnvelope,suitable);
      const fitted=this.thresholdPlants.relocate(shifted,this.shoreGrassEnvelope,p=>suitable(p.x,p.z)&&!getShoreStoneField(this.world).intersects(p,this.shoreGrassEnvelope),compact);
      const retained=seatBrookShoulderGrass(this.world,fitted,grassStemFeet([this.grassGeometries[0],this.baseGrassGeometry]),this.shoreGrassEnvelope);
      if(retained&&!getShoreStoneField(this.world).intersects(retained,this.shoreGrassEnvelope))return retained;
    }
    const shoreRoot=relocateShorePlant(this.world,root,this.shoreGrassEnvelope,suitable);
    const placed=this.thresholdPlants.relocate(shoreRoot,this.shoreGrassEnvelope,p=>suitable(p.x,p.z)&&!getShoreStoneField(this.world).intersects(p,this.shoreGrassEnvelope),root);
    if(!brookShoulder)return placed;
    const asset=createBrookWetAsset(this.world,placed,[this.grassGeometries[0],this.grassGeometries[1],this.baseGrassGeometry],{physicalOnly:this.riverValleyWet&&valleyShoulderSuitable(this.world,x,z)});
    return asset?{...placed,brookShoulder:true,brookAsset:asset}:null;
  }

function instrument(eco){
 let count=0;const seen=new Set();
 function world(w){if(!w)return;if(!seen.has(w.surface)){seen.add(w.surface);const fn=w.surface.normalAt;w.surface.normalAt=function(...args){count++;return fn.apply(this,args);};}world(w.forestShoulderSourceWorld);}
 world(eco.world);world(eco.valleyBanks?.sourceWorld);return()=>count;
}
function snapshot(root){
 if(!root)return null;const {brookAsset,...fields}=root;if(!brookAsset)return fields;
 const {geometries,dispose,...asset}=brookAsset;
 return {...fields,brookAsset:{...asset,geometries:geometries.map(g=>({index:g.index?.array.slice(),attributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,{itemSize:a.itemSize,normalized:a.normalized,array:a.array.slice()}]))}))}};
}
for(const [name,x,z] of [['forest-creek',-3611.9813305250705,4805.371282289286],['meadow-route',-2216.832094723869,3361.4050159480757],['central-meadow',0,0],['valley-wet-bank',-140.8,2892]]){
 test('grass early rejection keeps every actual '+name+' root/field/wet leaf byte',()=>{
  // This frozen pre-optimization fixture predates the accepted bank geometry.
  const original=actualMeadowEcology({forestBankCurvature38:false}),candidate=actualMeadowEcology({forestBankCurvature38:false});original._grassAt=legacyGrassAt;
  const oldCount=instrument(original),newCount=instrument(candidate);let roots=0,wet=0,slots=0;
  try{
   const tx=Math.floor(x/MEADOW.tile),tz=Math.floor(z/MEADOW.tile);
   for(let iz=Math.floor((tz-1)*MEADOW.tile/MEADOW.cell);iz<Math.ceil((tz+2)*MEADOW.tile/MEADOW.cell);iz++)
    for(let ix=Math.floor((tx-1)*MEADOW.tile/MEADOW.cell);ix<Math.ceil((tx+2)*MEADOW.tile/MEADOW.cell);ix++){
     const before=original.grassAt(ix,iz),after=candidate.grassAt(ix,iz);slots++;
     assert.deepEqual(snapshot(after),snapshot(before),'cell '+ix+','+iz);
     if(after){roots++;wet+=!!after.brookAsset;for(const method of ['sample','sampleLandform','sampleCommunity'])assert.deepEqual(candidate.grassRootField[method](after),original.grassRootField[method](before));}
     before?.brookAsset?.dispose();after?.brookAsset?.dispose();
    }
   assert.ok(newCount()<oldCount(),'actual normal queries must decrease');
   if(name==='valley-wet-bank')assert.ok(wet>0,'exercise actual wet-root geometry and relocation');
   console.log(JSON.stringify({name,slots,roots,wet,oldNormalAt:oldCount(),newNormalAt:newCount(),savedNormalAt:oldCount()-newCount(),allRootAndFieldAndWetGeometryValuesEqual:true}));
  }finally{original.dispose();candidate.dispose();}
 });
}
