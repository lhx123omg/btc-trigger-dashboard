export const zoneNames=['Weekly Upper','Weekly Lower','Daily Upper','Daily Lower'];
export const utc=value=>value==null?'—':new Date(typeof value==='number'?value:String(value)).toISOString().slice(5,19).replace('T',' ');
export const price=value=>value==null?'—':Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function enabled(zone,settings){return(zone.hierarchy==='Weekly'?settings.weekly_enabled:settings.daily_enabled)&&(zone.side==='Upper'?settings.upper_enabled:settings.lower_enabled);}
export function zoneStatus(zone,settings){return !enabled(zone,settings)?'DISABLED':zone.triggered?'TRIGGERED':'WAIT';}
export function monitorStatus(state){
 if(state?.settings&&!state.settings.weekly_enabled&&!state.settings.daily_enabled)return 'PAUSED';
 if(state.status==='BACKOFF'||state.status==='ERROR')return state.status;
 const now=Date.parse(state.server_time),cursor=Number(state.last_processed_1m_close_ms);
 return !cursor||now-cursor>120000?'DELAYED':'RUNNING';
}
export function shadowStatus(data){
 const state=data?.shadow?.state??{};
 if(state.status==='BACKOFF'||state.status==='ERROR')return state.status;
 if(!state.last_processed_4h_close_ms)return 'DELAYED';
 return 'RUNNING';
}
export function nearestZone(state){
 const current=Number(state.last_1m_close);if(!Number.isFinite(current)||state.last_1m_close==null)return null;
 const remaining=state.zones.filter(z=>enabled(z,state.settings)&&!z.triggered);
 const choices=remaining.length?remaining:state.zones.filter(z=>enabled(z,state.settings));
 return choices.map(z=>{const distance=current<Number(z.zone_low)?Number(z.zone_low)-current:current>Number(z.zone_high)?current-Number(z.zone_high):0;return{...z,distance,percent:current?distance/current*100:0};}).sort((a,b)=>a.distance-b.distance)[0]??null;
}
export const pushLabel=event=>event.push_status==='SUCCESS'?'SUCCESS':event.push_status==='UNKNOWN'?'FAILED':event.push_status==='FAILED'&&!event.next_attempt_at?'FAILED':'RETRYING';
export const statusText=value=>({RUNNING:'运行正常',BACKOFF:'退避中',DELAYED:'等待数据',ERROR:'异常',WAIT:'等待触发',TRIGGERED:'已触发',DISABLED:'已关闭',PAUSED:'已暂停',BROKEN:'参考失效',SUCCESS:'推送成功',FAILED:'推送失败',RETRYING:'重试中',PENDING:'待推送',SENDING:'发送中',UNKNOWN:'需核对收件'}[value]??'—');
export const hierarchyText=value=>String(value).toLowerCase()==='weekly'?'周线':'日线';
export const sideText=value=>String(value).toLowerCase()==='upper'?'上针区':'下针区';
export const zoneText=zone=>hierarchyText(zone.hierarchy)+sideText(zone.side);
export const detectionText=value=>value==='1m Range'?'1分钟区间检测':value;
export function chineseError(error){const value=error?.message??String(error??'');if(/[\u4e00-\u9fff]/.test(value))return value;if(error?.status===401)return '登录已失效，请重新登录';if(error?.status===403)return '此账号未获授权';if(error?.status===429)return '请求冷却中，请稍后重试';return '服务暂时不可用，请检查网络后重试';}
