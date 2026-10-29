// One policy for the runtime and its exact bank-bound producer.
export function localShadowWindow72Enabled(search=globalThis.location?.search||'') {
 const values=new URLSearchParams(search).getAll('localShadowWindow42');
 return values.length===0 || values.every(value=>value==='1');
}
export function localShadowWindow72ParameterValid(search='') {
 const values=new URLSearchParams(search).getAll('localShadowWindow42');
 return values.every(value=>value==='0'||value==='1') && new Set(values).size<=1;
}
