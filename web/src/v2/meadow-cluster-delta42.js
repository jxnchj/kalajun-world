// Difference of ordered, non-overlapping ID intervals. Work is proportional to
// runs plus changed roots, rather than every retained root on every frame.
function subtract(a,n,b,m,visit){let j=0;for(let i=0;i<n;i++){let p=a[i*2],end=a[i*2+1];while(j<m&&b[j*2+1]<=p)j++;let k=j;while(k<m&&b[k*2]<end){if(b[k*2]>p)visit(p,Math.min(end,b[k*2]),i);p=Math.max(p,b[k*2+1]);if(p>=end)break;k++;}if(p<end)visit(p,end,i);}}
function state(pool,count){const s=pool.delta??={ready:false,previous:new Float64Array(0),current:new Float64Array(0),previousCount:0,removed:[],removeSet:new Set(),dirty:[]};if(s.current.length<count*2)s.current=new Float64Array(2**Math.ceil(Math.log2(Math.max(16,count*2))));return s;}
function publish(s,count){const a=s.previous;s.previous=s.current;s.current=a;s.previousCount=count;s.ready=true;}
export function packStableDelta42(pool,runs,nextRootId,fallback){const s=state(pool,runs.length);let ordered=true,end=-1;for(const r of runs){const start=r.record.baseId+r.start;if(start<end)ordered=false;end=start+r.count;}const order=ordered?null:runs.map((_,i)=>i).sort((a,b)=>(runs[a].record.baseId+runs[a].start)-(runs[b].record.baseId+runs[b].start));for(let i=0;i<runs.length;i++){const r=runs[order?order[i]:i],start=r.record.baseId+r.start;s.current[i*2]=start;s.current[i*2+1]=start+r.count;}
 if(!s.ready||!pool.stable||!pool.slots||pool.slots.length<nextRootId){const bytes=fallback(pool,runs,nextRootId);publish(s,runs.length);return bytes;}
 s.removed.length=0;s.removeSet.clear();s.dirty.length=0;
 subtract(s.previous,s.previousCount,s.current,runs.length,(lo,hi)=>{for(let id=lo;id<hi;id++){s.removed.push(id);s.removeSet.add(id);}});
 // The original packer scans slots ascending, repeatedly swapping an unwanted
 // tail into the same hole. Retain that exact order, not merely the same set.
 s.removed.sort((a,b)=>pool.slots[a]-pool.slots[b]);let count=pool.packedCount;
 for(const id of s.removed){const slot=pool.slots[id]-1;if(slot<0)continue;do{pool.slots[pool.ids[slot]]=0;count--;if(slot<count){const moved=pool.ids[count];pool.ids[slot]=moved;pool.slots[moved]=slot+1;for(const a of pool.attrs){const n=a.itemSize;a.array.copyWithin(slot*n,count*n,(count+1)*n);}s.dirty.push(slot);}}while(slot<count&&s.removeSet.has(pool.ids[slot]));}
 const append=(lo,hi,index)=>{const r=runs[index];for(let id=lo;id<hi;id++){const source=id-r.record.baseId;pool.ids[count]=id;pool.slots[id]=count+1;for(let k=0;k<pool.attrs.length;k++){const a=pool.attrs[k],n=a.itemSize;a.array.set(r.record.attrs[k].array.subarray(source*n,(source+1)*n),count*n);}s.dirty.push(count++);}};
 if(!order)subtract(s.current,runs.length,s.previous,s.previousCount,append);else{const additions=[];subtract(s.current,runs.length,s.previous,s.previousCount,(lo,hi,index)=>additions.push({lo,hi,index:order[index]}));additions.sort((a,b)=>a.index-b.index||a.lo-b.lo);for(const a of additions)append(a.lo,a.hi,a.index);}
 s.dirty.sort((a,b)=>a-b);let bytes=0,start=-1,last=-1;const flush=()=>{if(start<0)return;for(const a of pool.attrs){a.addUpdateRange(start*a.itemSize,(last-start+1)*a.itemSize);a.needsUpdate=true;bytes+=(last-start+1)*a.itemSize*4;}};
 for(const slot of s.dirty){if(slot>=count)continue;if(slot===last)continue;if(start<0)start=slot;else if(slot!==last+1){flush();start=slot;}last=slot;}flush();
 pool.packedCount=count;publish(s,runs.length);return bytes;
}
