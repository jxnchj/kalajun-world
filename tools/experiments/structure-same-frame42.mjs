// Only arithmetic41's already-qualified pure-translation native manual leaves
// enter this bridge. No subtree, animation, visibility or shader state is cached.
export class StructureSameFrame42 {
 constructor({enabled=false}={}){this.enabled=enabled;this.active=false;this.generation=0;this.records=new WeakMap();this.stats={enabled,scopes:0,checks:0,reused:0,captured:0,scopeMs:0};this.parent=null;}
 setEnabled(value){this.enabled=!!value;this.stats.enabled=this.enabled;return this.enabled;}
 run(work){if(!this.enabled||this.active)return work();this.active=true;this.generation++;this.stats.scopes++;const start=performance.now();try{const result=work();if(result?.then)throw new TypeError('Structure same-frame reuse requires synchronous work');return result;}finally{this.active=false;this.parent=null;this.stats.scopeMs=performance.now()-start;}}
 begin(group){if(!this.active)return null;this.parent=group;return this;}
 tryReuse(child){this.stats.checks++;const r=this.records.get(child),p=this.parent;if(!r||r.generation!==this.generation||r.parent!==p||child.parent!==p||r.local!==child.matrix||r.world!==child.matrixWorld||child.matrixWorldAutoUpdate!==true)return false;
 const a=child.matrix.elements,b=child.matrixWorld.elements,e=p.matrixWorld.elements;
 // arithmetic41 verifies all fixed local/parent coefficients on this call.
 // Object.is additionally preserves the native signed-zero result contract.
 for(let i=0;i<3;i++)if(!Object.is(r.translation[i],a[12+i])||!Object.is(r.translation[3+i],e[12+i]))return false;
 for(let i=0;i<16;i++)if(!Object.is(r.output[i],b[i]))return false;
 this.stats.reused++;return true;}
 capture(child){let r=this.records.get(child);if(!r){r={translation:new Float64Array(6),output:new Float64Array(16)};this.records.set(child,r);}r.generation=this.generation;r.parent=this.parent;r.local=child.matrix;r.world=child.matrixWorld;const a=child.matrix.elements,p=this.parent.matrixWorld.elements;for(let i=0;i<3;i++){r.translation[i]=a[12+i];r.translation[3+i]=p[12+i];}r.output.set(child.matrixWorld.elements);this.stats.captured++;}
 dispose(){this.active=false;this.parent=null;this.records=new WeakMap();}
}
