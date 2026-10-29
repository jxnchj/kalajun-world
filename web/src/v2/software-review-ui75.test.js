import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoftwareReview75,installSoftwareReviewUI75} from './software-review75.js';

// Minimal DOM/event fixture for this native UI only; no clipboard/renderer mock.
function fixture(){
 const calls=[],created=[];let reads=0,current={中文:'喀拉峻 · 木屋',emoji:'🌲',literal:'<script>不是HTML</script>',lines:'一\n二'},failure=null;
 const document={activeElement:null};
 const element=tag=>{
  const listeners=new Map(),node={tagName:tag.toUpperCase(),children:[],parentElement:null,style:{},dataset:{},attributes:{},textContent:'',value:'',hidden:false,
   setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
   removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
   append(...nodes){for(const child of nodes){child.remove();child.parentElement=this;this.children.push(child);}},
   remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}},
   focus(){document.activeElement=this;},
   dispatch(type,properties={}){const event={...properties,type,target:this,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;}};for(let target=this;target;target=target.parentElement){for(const fn of listeners.get(type)??[])if(target===this){fn(event);if(event.immediate)break;}if(target!==this)target.receive(type,event);if(event.stopped)break;}return event;},
   receive(type,event){for(const fn of listeners.get(type)??[]){fn(event);if(event.immediate)break;}}};created.push(node);return node;
 };
 document.createElement=element;document.body=element('body');const window=element('window');window.append(document.body);document.querySelector=()=>null;
 const state={phase:'held',completedWorldFrames:3,submittedWorldFrames:3,completedPreparationFences:2,remaining:0,completedFrameSimulationSeconds:0,inFlight:false,reserved:false,error:null};
 const review={onChange:()=>calls.push('onChange'),snapshot:()=>({...state}),request:()=>calls.push('request'),pause:()=>calls.push('pause'),abort:()=>calls.push('abort')};
 const getSnapshot=()=>{reads++;if(failure)throw failure;return current;};
 const dispose=installSoftwareReviewUI75(review,{document,getSnapshot});
 const all=(root=document.body)=>[root,...root.children.flatMap(c=>all(c))];
 const button=label=>{const result=all().find(e=>e.tagName==='BUTTON'&&e.textContent===label);assert.ok(result,label);return result;};
 return {document,window,review,calls,created,dispose,button,all,get reads(){return reads;},get current(){return current;},set current(v){current=v;},set failure(v){failure=v;},show:()=>button('显示诊断JSON').dispatch('click'),textarea:()=>all().find(e=>e.tagName==='TEXTAREA')};
}

test('missing/explicit0 QA creates no UI or snapshot work',()=>{
 for(const search of['','?softwareReview75=0']){const review=createSoftwareReview75({search,gl:{}});let touched=0;const dispose=installSoftwareReviewUI75(review,{document:{createElement(){touched++;}},getSnapshot(){touched++;}});dispose();assert.equal(touched,0);}
});
test('visible JSON captures exactly once, preserves Unicode/plain text and remains frozen across live diagnostics',()=>{
 const f=fixture(),before=f.reads,original=JSON.stringify(f.current,null,2),callbacks=f.calls.length;f.show();const textarea=f.textarea();
 assert.equal(f.reads,before+1);assert.equal(textarea.value,original);assert.deepEqual(JSON.parse(textarea.value),f.current);assert.equal(textarea.readOnly,true);assert.equal(textarea.spellcheck,false);assert.equal(f.document.activeElement,textarea);assert.equal(f.calls.length,callbacks);
 f.current={中文:'后来变化'};f.review.onChange(f.review.snapshot());assert.equal(textarea.value,original,'existing panel updates cannot refresh captured text');
 const reads=f.reads;f.button('关闭诊断文本（清空）').dispatch('click');assert.equal(f.reads,reads);assert.equal(textarea.value,'');assert.equal(f.textarea(),undefined);f.dispose();
});
test('reopening captures once anew and clears the previous textarea; disposal clears/removes remaining text',()=>{
 const f=fixture();f.show();const old=f.textarea();f.current={中文:'第二次'};const reads=f.reads;f.show();const next=f.textarea();assert.notEqual(next,old);assert.equal(old.value,'');assert.equal(f.reads,reads+1);assert.deepEqual(JSON.parse(next.value),f.current);assert.equal(f.all().filter(e=>e.tagName==='TEXTAREA').length,1);
 const callbacks=f.calls.length;f.dispose();assert.equal(next.value,'');assert.equal(f.textarea(),undefined);assert.equal(f.calls.length,callbacks);assert.equal(f.all().length,1);
});
test('text keyboard events block scene keydown but retain native Ctrl/Cmd+A/C, navigation and held-key release',()=>{
 const f=fixture(),keys=new Set(['KeyW']),scene=[];
 f.window.addEventListener('keydown',e=>{scene.push(e.code);keys.add(e.code);});
 f.window.addEventListener('keyup',e=>keys.delete(e.code));f.show();const textarea=f.textarea(),before=f.calls.length;
 for(const properties of[{code:'KeyW'},{code:'KeyF'},{code:'ArrowLeft'},{code:'Home'},{code:'KeyA',ctrlKey:true},{code:'KeyC',ctrlKey:true},{code:'KeyA',metaKey:true},{code:'KeyC',metaKey:true}]){const event=textarea.dispatch('keydown',properties);assert.equal(event.stopped,true);assert.equal(event.defaultPrevented,false,'native selection/copy/navigation default remains available');}
 assert.deepEqual(scene,[]);assert.deepEqual([...keys],['KeyW']);const released=textarea.dispatch('keyup',{code:'KeyW'});assert.equal(released.stopped,false);assert.equal(keys.size,0,'a pre-existing held movement key is released across text focus');assert.equal(f.calls.length,before);f.dispose();
});
test('snapshot/serialization failures remain local and bounded without scheduler callbacks or abort',()=>{
 for(const kind of['snapshot','circular','bigint','undefined','hostile-message','hostile-string']){
  const f=fixture();f.show();const old=f.textarea(),before=f.reads,callbacks=f.calls.length;
  if(kind==='snapshot')f.failure=Error('中文错误'.repeat(300));
  if(kind==='hostile-message')f.failure={get message(){throw Error('message getter failed');}};
  if(kind==='hostile-string')f.failure={toString(){throw Error('error coercion failed');}};
  if(kind==='circular'){const value={};value.self=value;f.current=value;}
  if(kind==='bigint')f.current={value:1n};if(kind==='undefined')f.current=undefined;
  assert.doesNotThrow(()=>f.show());assert.equal(f.reads,before+1);assert.equal(old.value,'');assert.equal(f.textarea().value,'');assert.equal(f.textarea().hidden,true);
  const alert=f.all().find(e=>e.attributes.role==='alert');assert.ok(alert.textContent.startsWith('诊断文本导出失败：'));assert.ok(alert.textContent.length<=500);assert.equal(f.calls.length,callbacks);assert.equal(f.calls.includes('abort'),false);
  f.button('关闭诊断文本（清空）').dispatch('click');assert.equal(alert.textContent,'');assert.equal(f.textarea(),undefined);f.dispose();
 }
});
test('visible text export never invokes clipboard APIs, timers, download or any GPU/scheduler operation',()=>{
 const f=fixture(),callbacks=f.calls.length;f.show();f.button('关闭诊断文本（清空）').dispatch('click');assert.equal(f.calls.length,callbacks);assert.deepEqual(f.calls,['onChange']);
 const source=readFileSync(new URL('./software-review75.js',import.meta.url),'utf8'),section=source.slice(source.indexOf(' let diagnosticText=null;'),source.indexOf(' const previous=review.onChange;'));
 assert.doesNotMatch(section,/navigator|clipboard|execCommand|setTimeout|requestAnimationFrame|\.abort\(|\.request\(|\.pause\(|fence|renderWorld|Blob|createObjectURL/);f.dispose();
});
