// Prepared verdicts are useful only for bit-exact submitted seat inputs.
const scratch=new ArrayBuffer(4),f32=new Float32Array(scratch),u32=new Uint32Array(scratch);
export function contactFloatBits42(value){f32[0]=value;return u32[0];}
export function contactBitsFloat42(value){u32[0]=value;return f32[0];}
export function validatePreparedContact42(record,seats){
 if(!record||record.version!==1||typeof record.ready!=='boolean'||!Number.isInteger(record.recovery)||record.recovery<0||record.recovery>seats.length||!(record.failure===null||['water-envelope','stone-envelope'].includes(record.failure))||record.ready!==(record.failure===null))throw Error('Invalid prepared contact verdict');
 if(!Array.isArray(record.groups)||record.groups.length!==seats.length)throw Error('Prepared contact group count');
 for(let i=0;i<seats.length;i++){const a=record.groups[i],b=seats[i];if(a.start!==b.start||a.count!==b.count||![a.input,a.output].every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff&&Number.isFinite(contactBitsFloat42(v))))throw Error('Prepared contact group mismatch');}
 return record;
}
export function applyPreparedContact42(record,seats,values,{ready,rootId}={}){
 if(!ready||!record||record.rootId!==rootId)return false;
 for(let i=0;i<seats.length;i++){const g=seats[i],r=record.groups[i];if(!r||r.start!==g.start||r.count!==g.count)return false;for(let j=g.start;j<g.start+g.count;j++)if(contactFloatBits42(values[j])!==r.input)return false;}
 for(const g of record.groups)values.fill(contactBitsFloat42(g.output),g.start,g.start+g.count);
 return true;
}
