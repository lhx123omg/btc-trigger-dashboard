export const zoneNames=['Weekly Upper','Weekly Lower','Daily Upper','Daily Lower'];
export const utc=value=>value==null?'—':new Date(typeof value==='number'?value:String(value)).toISOString().slice(5,19).replace('T',' ');
export const price=value=>value==null?'—':Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function enabled(zone,settings){return(zone.hierarchy==='Weekly'?settings.weekly_enabled:settings.daily_enabled)&&(zone.side==='Upper'?settings.upper_enabled:settings.lower_enabled);}
export function zoneStatus(zone,settings){return !enabled(zone,settings)?'DISABLED':zone.triggered?'TRIGGERED':'WAIT';}
export function monitorStatus(state){
 if(state.status==='BACKOFF'||state.status==='ERROR')return state.status;
 const now=Date.parse(state.server_time),cursor=Number(state.last_processed_1m_close_ms);
 return !cursor||now-cursor>120000?'DELAYED':'RUNNING';
}
export function nearestZone(state){
 const current=Number(state.last_1m_close);if(!Number.isFinite(current)||state.last_1m_close==null)return null;
 const remaining=state.zones.filter(z=>enabled(z,state.settings)&&!z.triggered);
 const choices=remaining.length?remaining:state.zones.filter(z=>enabled(z,state.settings));
 return choices.map(z=>{const distance=current<Number(z.zone_low)?Number(z.zone_low)-current:current>Number(z.zone_high)?current-Number(z.zone_high):0;return{...z,distance,percent:current?distance/current*100:0};}).sort((a,b)=>a.distance-b.distance)[0]??null;
}
export const pushLabel=event=>event.push_status==='SUCCESS'?'SUCCESS':event.push_status==='UNKNOWN'?'FAILED':event.push_status==='FAILED'&&!event.next_attempt_at?'FAILED':'RETRYING';
