import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {decodeHabitatMap} from '../web/src/v2/habitat-data.js';
const root=new URL('../web/public/data/',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={revision:'v2-habitat-exact-v1',derivation:'Original V2 decodeHabitatMap; all four channels byte-identical, same raster grid',maps:{}};
await mkdir(new URL('v2/',root),{recursive:true});
for(const name of ['vegmap','vegcore']){
 const sourceMetadata=await readFile(new URL(name+'.json',root)),sourceGzip=await readFile(new URL(name+'.bin.gz',root)),source=gunzipSync(sourceGzip);
 const meta=JSON.parse(sourceMetadata),{n,data}=decodeHabitatMap(meta,source),gzip=gzipSync(data,{level:9}),url='data/v2/'+name+'.habitat.bin.gz';
 await writeFile(new URL('v2/'+name+'.habitat.bin.gz',root),gzip);
 manifest.maps[name]={meta,n,url,rawBytes:data.byteLength,gzipBytes:gzip.byteLength,sha256:sha(data),source:{metadataSha256:sha(sourceMetadata),gzipBytes:sourceGzip.byteLength,rawBytes:source.byteLength,sha256:sha(source)}};
}
await writeFile(new URL('v2/habitat-transport-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
