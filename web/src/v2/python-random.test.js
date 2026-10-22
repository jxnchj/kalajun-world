import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {PythonRandom} from "./python-random.js";
// Fixed local CPython 3.9.6 goldens, generated with random.Random(seed).
// Every result is struct.pack("<d", value); hashes cover the ENTIRE stream.
// random: 8192 draws. mixed: 4096 calls, random every seventh call and otherwise
// uniform(...RANGES[(i*5)%8]). No Python runtime dependency for these tests.
const GOLDEN={"python":"3.9.6","indices":[0,1,2,310,311,312,623,624,1023,4095,8191],"ranges":[[-0.18,0.18],[0.025,0.95],[-2.3,7.9],[7.9,-2.3],[2.5,2.5],[0,0],[1e-200,3e-200],[-1e+100,1e+100]],"gold":[{"seed":0,"random":"17508fc9b96e9d66404d2c086f6052d2743263064ea7e4c69095613c4b2802e2","bits":["be7d8af98005eb3f","1a9c8f972941e83f","78e95210a5eada3f","c08a1b193014803f","f4a873442634d93f","c9c628b5ad9be03f","88a589207ba2e03f","099d17160f5ee23f","6ceb1b1a3c36e13f","8033a5f09c3bc33f","a0efcae1bb5cd43f"],"mixed":"f2bbf04f390634e7d7dcffadab4cec4b0811e118007f521862ba28e98a831466"},{"seed":1,"random":"134d259fc59d5f0568d1b07bd65273e5bb193ff98ee39292b880edf6c1153b57","bits":["84751bf9d832c13f","f884355b2d1eeb3f","139f4078d770e83f","341354985aa2d33f","bc977ef985f1d43f","c483577e6345d43f","c85f9a55460be83f","d877da917ec8ce3f","80543af44addd43f","9148eb290b5fe03f","3fb8549ec851e93f"],"mixed":"00b9928817043b6622ffbcded8eb47f730dc24e3cd054cc9a73e5f7a489db4da"},{"seed":2,"random":"591e49d7b2c4451658032c78b0b983501ecdd6fd2b0f16a7ae6c4c89b730a448","bits":["eed2732fd597ee3f","bf6e654f9a54ee3f","7086dc054df4ac3f","70928668c3cccc3f","7c62c0a445e1e33f","34c387663ac6d93f","5488b2e64371cb3f","c68017ea7b53d53f","d09138400168bd3f","64906830a502ef3f","fdf64576de46ec3f"],"mixed":"d0ab1ea07d1affd95f2a5e4abb63cd56be7028f2b7f553d57bfc505fe8f0def5"},{"seed":17,"random":"aba9991be72378b987fa8744f0b036b0ac378c28bf28295779517c6c821caad8","bits":["a61ba89917b4e03f","a6b4362d69d0e93f","006676895fbcee3f","65258b91be6fee3f","d842db38d0c1ed3f","8ab5b1701c73eb3f","38a23d5b6436e43f","56c11848097fd73f","a2d06e77b45dd23f","9b5a2996f477e03f","e8b16ec2edb0be3f"],"mixed":"bb2e5f1a95cb54646a23da06b4476d13939daa7c50d6d36d4159842bd87a1a55"},{"seed":42,"random":"8dd33406a9b12164d76f9c8a68cb2cfec8ac73cc6f24f360c55e0039bce84059","bits":["c50072302f76e43f","6020eb5e6b9c993f","dc89f591149ad13f","8b656e99fdc3ec3f","c0bee9bac9e3ca3f","5cc2ab2a97f0cf3f","80aec5b7239bbe3f","d8b2cd2fcc25e13f","26e831a61e07d53f","0ecd0ae6392fe33f","59151634cab6ef3f"],"mixed":"f89d661ea22f1f09a2aedbace09bd3209028d0b7e592f8ef083c1765713485cd"},{"seed":12345,"random":"b024e5b3abbebddd2277264b36a1f55f0261f49043483962dd7cdb7eab603641","bits":["188adc65e6a9da3f","40f8f6d192d3843f","e31d367b1768ea3f","efe34a809b30e13f","e6bfe8c5fe10e53f","3b0866ffed14ef3f","039b26f48d50e53f","40c4f8d51753c23f","b085c0bb9c74c83f","9a2f9387cccbdf3f","c12a1694339fe23f"],"mixed":"4e7c430d7c01bb3220c722c4a2d6223e539be371cccfa5bad39f208a9a81b86e"},{"seed":60821,"random":"01df1051a11efa8e300eac5472e9f449b835e50d80d79c0b445fb3fe5459028f","bits":["906c8b855ae4a13f","80531de10b5a833f","269c7b0a462fd33f","502751c6ce36c53f","840d7b936c6ae13f","bfb61a0aa86cee3f","04cc06add549c23f","e4635650d5d9d33f","aa0d65cd19d6d83f","88ddfaa2e029b83f","01882713a72fe43f"],"mixed":"3b8d5d753ae73fb1c35f7574b16c4a7eab22e5c6bc0118a8d4e5bc6b2c06aacd"},{"seed":70031,"random":"7b249c13d4a3c17a006d3ebe104b7c6aca1c45cb8626adca1f174b664521bb23","bits":["2a3c9cd69877d43f","a49f06c830f2e03f","7e2f994d5988ea3f","9a6c0edcda2fe63f","1c9d567a76b2e83f","509802cad733cd3f","20eec6472228a23f","e2a0ce8faaced63f","ccef9a905992c43f","4fd7fb7b57dee73f","d81c73439924dd3f"],"mixed":"1769661c38707b134a9568461c32be81fe6cfd7ef9a312cc0a69f488947555fd"},{"seed":98372,"random":"2afaf80de17759e96926f0b6fc0ff1167283b8df9d357b61f79d3790b8d355f1","bits":["c291ecb2768de93f","40bfb168f535bc3f","eedc9d403055d43f","02f3bbd4634cdf3f","34e46e4003a1e13f","216a7190e5e0e23f","b2692bfa47d9ea3f","a2f21eefe8ffdb3f","2092305d747d9a3f","e296d200bc0ae93f","0f759b011bf0e43f"],"mixed":"b11dfb7c29b9426f0889ab332506dba65f08a978afa108bc6c1685989d357b62"},{"seed":262144,"random":"9b3e49adfd576dbc7292beee643260a07c27e36265333a71e105ddfc7b4277a7","bits":["62c704bc4ed3e53f","013026cb5096e63f","d03b9a36f7fbab3f","98505a40de0bb63f","48869efc9c57cd3f","eed457beb323ec3f","f15b08cf8f98e63f","ed16ce00cd56e53f","a8bbeefcfb3fdd3f","d0dfaefa5513a73f","9a843cbdd67ed73f"],"mixed":"5d08411be797267faf89493f41693887e5eb9f12756df276c2ce14568d7c738f"},{"seed":399999,"random":"84f0dd2445194caecc8b32766938358b99da3764791fdc1d9813d0f8af2f462a","bits":["5cb11e197ff2e63f","2bd9fd6302d0e03f","0fc12fa3eaa2ee3f","5cc58f1ed69fed3f","3d1aee85affae63f","baf5ff7cc164d53f","f08d2f46de13aa3f","020851d74777d03f","446aab96d651d13f","7ac0819f3c5ede3f","db56fda23023ee3f"],"mixed":"a6bd689befdf63507af155cbd45c7b15b6ca69133740a00b4ae8b278bf62d105"},{"seed":2147483647,"random":"a725029fa9cfc4a9ae798f36c506899dad147b89736708d7a9ce8cfe654eb325","bits":["7a897eb72556d43f","7a407bb0c527ea3f","6058a574e821c93f","685870dfd9a2c23f","2e3783123d86de3f","b40642bddea0c93f","7e62e71019f4db3f","9e012b755753d63f","5cf149b35fcbd53f","00b20a3074b09b3f","c06d8d138e848d3f"],"mixed":"76be244b12f46f94102461bffbb41102a04f24f4e50534fb143956c516dae95d"},{"seed":2147483648,"random":"74fc500c1367fca4c544bb1b73647af07042368498d65759e661e8a77c571a5e","bits":["74bd04cbd4aed53f","71c183c37729e03f","fdad9277e273ec3f","a8da6b644389b53f","eeb16ffbd89fd63f","a544b8762ab3e23f","402804318cb2b33f","788992f99435cf3f","79322e4f4960e63f","63d888e6b984eb3f","08deb3a96b46ed3f"],"mixed":"5ad4d36318a45654757ed9b466f9d8e643dddd365493d4a0d8d946f07ed79892"},{"seed":4294967294,"random":"ad2553ed84380a0a1fcaed7f702eeddc40cbfcbf77e515f70e8ce705411f3567","bits":["b8b1d73c5525b93f","f022b756786ae03f","fb27689721f7e03f","5fa0890f7794ea3f","397735d36139e23f","0095c4ea011fe83f","1381dfe28661e53f","cabac2edee87db3f","9cdd7ec80099ee3f","ea939bfa6a92e23f","00a8da7f334ab53f"],"mixed":"c1a590370c70f70dde1867db3cd6ddf089da8a5347b1c0258e61201f1c32a0df"},{"seed":4294967295,"random":"b1caf6a560f7cdea61730578ae784c0fd1699eb0c8b1065e4b983654974afdbd","bits":["13707a22d954e43f","f80b72a37402ca3f","77ef16168c6fe33f","fcff2f830bb7e83f","3e0034d2e935ec3f","2a4414afa5f2df3f","4055d89a5353b83f","9809d93193d9ca3f","556fce3433b2e73f","bd30fb513ad7ed3f","c0de03912a49bf3f"],"mixed":"915a3c6ad2667db5a0932d0950e52712c46f1b3311c63006fa73790e4d083c56"}]};
const bytes=value=>{const b=Buffer.allocUnsafe(8);b.writeDoubleLE(value);return b;};
const digest=data=>createHash("sha256").update(data).digest("hex");
test("random matches 122880 CPython Float64 values including every repeated twist boundary",()=>{
  for(const gold of GOLDEN.gold){
    const rng=new PythonRandom(gold.seed),data=Buffer.alloc(8192*8),spots=new Map(GOLDEN.indices.map((i,j)=>[i,gold.bits[j]]));
    for(let i=0;i<8192;i++){
      const value=rng.random();assert.ok(value>=0&&value<1);
      data.writeDoubleLE(value,i*8);
      if(spots.has(i))assert.equal(bytes(value).toString("hex"),spots.get(i),"seed "+gold.seed+" draw "+i);
    }
    assert.equal(digest(data),gold.random,"all Float64 bits, seed "+gold.seed);
  }
});
test("mixed random/uniform calls match 61440 Python doubles including reversed/equal/tiny/large bounds",()=>{
  for(const gold of GOLDEN.gold){
    const rng=new PythonRandom(gold.seed),data=Buffer.alloc(4096*8);
    for(let i=0;i<4096;i++){
      const value=i%7===0?rng.random():rng.uniform(...GOLDEN.ranges[(i*5)%GOLDEN.ranges.length]);
      data.writeDoubleLE(value,i*8);
    }
    assert.equal(digest(data),gold.mixed,"mixed call schedule, seed "+gold.seed);
  }
});
test("instances are independent and equal-bound uniform still advances Python's sequence",()=>{
  const a=new PythonRandom(60821),b=new PythonRandom(60821);
  for(let i=0;i<19;i++)assert.equal(a.random(),b.random());
  assert.equal(a.uniform(2.5,2.5),2.5);b.random();assert.equal(a.random(),b.random());
  const fresh=new PythonRandom(60821),again=new PythonRandom(60821);
  for(let i=0;i<3000;i++)a.random();
  assert.equal(fresh.random(),again.random());
});
test("out-of-scope seed types/ranges fail explicitly instead of silently truncating recipe seeds",()=>{
  for(const seed of [-1,.1,4294967296,Number.MAX_SAFE_INTEGER,NaN,Infinity,undefined,null,"17",17n])
    assert.throws(()=>new PythonRandom(seed),RangeError);
  for(const seed of [0,1,2147483648,4294967295])assert.doesNotThrow(()=>new PythonRandom(seed));
});
