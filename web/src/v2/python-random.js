// CPython-compatible integer-seeded MT19937, limited to the spruce recipe's
// random()/uniform() calls and unsigned 32-bit Number seeds.
// Reference: https://github.com/python/cpython/blob/v3.9.6/Modules/_randommodule.c
//
// MT19937 notice retained for this algorithm port:
// Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
// All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. The names of its contributors may not be used to endorse or promote
//    products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
export class PythonRandom {
  #state=new Uint32Array(624);
  #index=624;
  constructor(seed){
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)
      throw new RangeError("PythonRandom seed must be an integer Number in 0..0xffffffff");
    const mt=this.#state;
    // Python int seeding calls init_by_array([seed]), NOT init_genrand(seed).
    // For zero Python still supplies a one-word key, rather than an empty key.
    mt[0]=19650218;
    for(let i=1;i<624;i++)mt[i]=Math.imul(1812433253,mt[i-1]^(mt[i-1]>>>30))+i;
    let i=1;
    for(let k=624;k>0;k--){
      mt[i]=(mt[i]^Math.imul(mt[i-1]^(mt[i-1]>>>30),1664525))+seed;
      if(++i===624){mt[0]=mt[623];i=1;}
    }
    for(let k=623;k>0;k--){
      mt[i]=(mt[i]^Math.imul(mt[i-1]^(mt[i-1]>>>30),1566083941))-i;
      if(++i===624){mt[0]=mt[623];i=1;}
    }
    mt[0]=0x80000000;
  }
  #uint32(){
    const mt=this.#state;
    if(this.#index===624){
      let i=0,y;
      for(;i<227;i++){
        y=(mt[i]&0x80000000)|(mt[i+1]&0x7fffffff);
        mt[i]=mt[i+397]^(y>>>1)^((y&1)?0x9908b0df:0);
      }
      for(;i<623;i++){
        y=(mt[i]&0x80000000)|(mt[i+1]&0x7fffffff);
        mt[i]=mt[i-227]^(y>>>1)^((y&1)?0x9908b0df:0);
      }
      y=(mt[623]&0x80000000)|(mt[0]&0x7fffffff);
      mt[623]=mt[396]^(y>>>1)^((y&1)?0x9908b0df:0);
      this.#index=0;
    }
    let y=mt[this.#index++];
    y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;
    return y>>>0;
  }
  random(){
    const a=this.#uint32()>>>5,b=this.#uint32()>>>6;
    return (a*67108864+b)*(1/9007199254740992);
  }
  // Keep the same operation order as Python. Equal endpoints still consume
  // one draw; reversed bounds and ordinary double rounding are intentional.
  uniform(a,b){return a+(b-a)*this.random();}
}
