// Diagnostic timing only. These switches never select authored world inputs.
export function softwareReviewPolicy75(search=''){
 const params=new URLSearchParams(search),mode=params.getAll('softwareReview75'),gap=params.getAll('softwareReviewInputGap75');
 const valid=mode.length<=1&&mode.every(v=>v==='0'||v==='1')&&gap.length<=1&&gap.every(v=>v==='0'||v==='250')&&(!gap.length||mode[0]==='1');
 return {valid,enabled:valid&&mode[0]==='1',inputGapMs:valid&&gap[0]==='250'?250:0};
}
