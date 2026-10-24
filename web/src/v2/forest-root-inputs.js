// Hash actual already-decoded world inputs on demand; disabled cache adds no scan.
export async function forestRootInputHashes(values){
 const encode=new TextEncoder(),result={};
 for(const [name,value]of Object.entries(values)){
  const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):encode.encode(JSON.stringify(value));
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  result[name]=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 }
 return result;
}
