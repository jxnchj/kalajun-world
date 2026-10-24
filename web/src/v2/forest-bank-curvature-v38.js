// Local bank geometry driven by the FINAL downstream centreline, not the
// pre-meander 47m/19m deposition field. Water and original section data stay exact.
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function createForestBankCurvature38(segments,anchor){
 if(!anchor)return null;
 const list=segments.filter(s=>s.lineId===anchor.lineId).sort((a,b)=>a.index-b.index),nodes=[...list.map(s=>s.a),list.at(-1).b];
 const turns=new Map();
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],a=nodes[Math.max(0,i-3)],b=nodes[Math.min(nodes.length-1,i+3)];
  const ax=n.x-a.x,az=n.z-a.z,bx=b.x-n.x,bz=b.z-n.z;
  turns.set(n,Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
 }
 const byId=new Map(list.map(s=>[s.id,{a:turns.get(s.a),b:turns.get(s.b)}]));
 return {lineId:anchor.lineId,origin:anchor.a.distance,byId};
}
export function forestBankCurvatureHeight38({field,query:q,rawHeight,baseline,protectedGround=false}){
 if(!field||!q?.section||q.segment.lineId!==field.lineId||protectedGround)return baseline;
 const s=q.section,offset=s.distance-field.origin;
 if(Math.abs(offset)>=18||q.distance<=q.half||q.distance>=s.outer||rawHeight<=s.level)return baseline;
 const turn=field.byId.get(q.segment.id);if(!turn)return baseline;
 // section.distance is authoritative for interpolation (no independent phase).
 const t=(s.distance-q.segment.a.distance)/(q.segment.b.distance-q.segment.a.distance);
 const angle=turn.a+(turn.b-turn.a)*t,side=q.signed<0?-1:1;
 // +signed cross turns toward the +normal (-fz,+fx): side+ is inner bank.
 const deposition=.5+.5*Math.tanh(side*angle/.28),extent=.40+.56*deposition;
 const u=Math.min(1,Math.max(0,(q.distance-q.half)/((s.outer-q.half)*extent)));
 // Monotone cubic: outer bend has a compact, rising toe; inner bend has a
 // broad sloping point-bar shoulder. Flat end tangent meets the untouched DEM.
 // No horizontal shelf imposed at every station, no noise or shifted wet edge.
 const contactSlope=2.8-2.15*deposition;
 const rise=(contactSlope-2)*u*u*u+(3-2*contactSlope)*u*u+contactSlope*u;
 const height=Math.min(rawHeight,s.level+(rawHeight-s.level)*rise);
 const weight=1-smooth(12,18,Math.abs(offset));
 return baseline+(height-baseline)*weight;
}
