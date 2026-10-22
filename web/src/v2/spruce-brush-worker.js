import {buildRecipeFrond} from "./spruce-brush.js";
self.onmessage=({data})=>{
 try{const attributes=buildRecipeFrond(data.source,data.form);self.postMessage({id:data.id,attributes},Object.values(attributes).map(a=>a.buffer));}
 catch(error){self.postMessage({id:data.id,error:error.stack||String(error)});}
};
