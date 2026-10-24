import {Vector3} from 'three';

// One order for the existing spatial group, shared by colour, mirror and every
// shadow pass. No per-pass buffer, root removal, extra draw or geometry change.
export class TreeRootOrder {
  constructor({enabled=false}={}) {
    this.enabled=enabled;this.applied=false;this.revision=-1;
    this.direction=new Vector3(NaN,NaN,NaN);this.forward=new Vector3();
    this.original=new WeakMap();
    this.stats={enabled,updates:0,sorts:0,groups:0,roots:0,changedGroups:0,matrixUploads:0,windUploads:0,cpuMs:0};
  }
  sync(batches,camera,revision) {
    this.stats.enabled=this.enabled;
    if(!this.enabled&&!this.applied)return false;
    camera.getWorldDirection(this.forward);
    if(this.enabled===this.applied&&revision===this.revision&&this.direction.equals(this.forward))return false;
    const started=performance.now(),groups=new Map();
    for(const batch of batches.values()) {
      if(batch.mode!==1&&batch.mode!==5)continue;
      const wind=batch.mesh.geometry.attributes.aTreeRootWind?.data;
      if(!wind)throw new Error('Tree root order requires the existing shared root wind buffer');
      let parts=groups.get(wind);if(!parts){parts=[];groups.set(wind,parts);}parts.push(batch);
    }
    let changed=false,changedGroups=0,roots=0;
    for(const [wind,parts] of groups) {
      const first=parts[0],active=first.activeRecords,n=active.length;roots+=n;
      for(const b of parts)if(b.mesh.count!==n||b.activeRecords.length!==n||b.activeRecords.some((r,i)=>r.id!==active[i]?.id))
        throw new Error('Shared tree wind parts must retain identical active root order');
      // Track the original swap-removal order separately while the candidate is
      // active, so runtime OFF restores the source order after movement/rebuild.
      const wanted=new Map(active.map(r=>[r.id,r]));
      let baseline=this.original.get(first.mesh);
      if(!baseline)baseline=active.slice();
      else {
        baseline=baseline.slice();
        for(let i=baseline.length-1;i>=0;i--)if(!wanted.has(baseline[i].id)){
          const last=baseline.pop();if(i<baseline.length)baseline[i]=last;
        }
        const known=new Set(baseline.map(r=>r.id));
        for(let i=0;i<baseline.length;i++)baseline[i]=wanted.get(baseline[i].id);
        for(const r of active)if(!known.has(r.id))baseline.push(r);
      }
      this.original.set(first.mesh,baseline);
      const target=baseline.slice();
      if(this.enabled&&n>1){
        const f=this.forward;
        // Translation adds the same depth to every root and cannot change order.
        // Stable Array.sort retains original order for exact depth ties.
        target.sort((a,b)=>(a.x-b.x)*f.x+(a.y-b.y)*f.y+(a.z-b.z)*f.z);this.stats.sorts++;
      }
      if(target.every((r,i)=>r.id===active[i].id))continue;
      const slots=new Map(active.map((r,i)=>[r.id,i])),permutation=target.map(r=>slots.get(r.id));
      for(const b of parts){
        const matrix=b.mesh.instanceMatrix,copy=matrix.array.slice(0,n*16);
        for(let i=0;i<n;i++)matrix.array.set(copy.subarray(permutation[i]*16,permutation[i]*16+16),i*16);
        matrix.clearUpdateRanges();matrix.addUpdateRange(0,n*16);matrix.needsUpdate=true;
        b.activeRecords.splice(0,n,...target);b.activeIndex.clear();
        target.forEach((r,i)=>b.activeIndex.set(r.id,i));this.stats.matrixUploads++;
      }
      const copy=wind.array.slice(0,n*5);
      for(let i=0;i<n;i++)wind.array.set(copy.subarray(permutation[i]*5,permutation[i]*5+5),i*5);
      wind.clearUpdateRanges();wind.addUpdateRange(0,n*5);wind.needsUpdate=true;this.stats.windUploads++;
      changed=true;changedGroups++;
    }
    this.applied=this.enabled;this.direction.copy(this.forward);
    // Caller advances the public tree revision ONCE iff this call changed order.
    this.revision=revision+Number(changed);
    if(!this.enabled)this.original=new WeakMap();
    Object.assign(this.stats,{groups:groups.size,roots,changedGroups,cpuMs:performance.now()-started});this.stats.updates++;
    return changed;
  }
}
