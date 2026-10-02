import{createClient}from './vendor/supabase.js';
import{utc,price,zoneNames,zoneStatus,monitorStatus,nearestZone,pushLabel}from './view-model.mjs';
import{createChart}from './chart.mjs';
const endpoint='https://csyesqrldggjrtmdjbdi.supabase.co/functions/v1/btc-dashboard-api';
const byId=id=>document.getElementById(id),text=(id,value)=>{byId(id).textContent=value;};
const chart=createChart(byId('chart'));let client,session=null,state=null,loading=false,dirty=false,generation=0,refreshTimer,chartTimer;
const keys=['weekly_enabled','daily_enabled','upper_enabled','lower_enabled','history_retention_days'];
function badge(node,value){node.textContent=value;node.className='badge '+value;}
function node(tag,value,className){const el=document.createElement(tag);if(value!=null)el.textContent=value;if(className)el.className=className;return el;}
function message(id,value){text(id,value??'');byId(id).hidden=!value;}
function clearSession(){
 generation++;session=null;state=null;clearInterval(refreshTimer);clearInterval(chartTimer);byId('dashboard').hidden=true;byId('login').hidden=false;
 byId('zones').replaceChildren();byId('timeline').replaceChildren();chart.clear();text('account','—');text('current-price','—');
 for(const id of ['last-run','last-minute','last-binance','nearest-name','nearest-range','nearest-distance','push-success','push-attempts'])text(id,'—');
 for(const id of ['push-error','test-message','settings-message'])text(id,'');dirty=false;
}
async function api(action,body){
 const current=await client.auth.getSession();if(!current.data.session)throw Object.assign(Error('请重新登录'),{status:401});
 const response=await fetch(`${endpoint}?action=${action}`,{method:body===undefined?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(12000),
 headers:{Authorization:`Bearer ${current.data.session.access_token}`,apikey:client.supabaseKey,'x-region':'ap-southeast-1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok){if(response.status===401||response.status===403){clearSession();text('login-message',result.error??'请重新登录');}
 throw Object.assign(Error(result.error??(result.status==='BACKOFF'?'Binance BACKOFF，图表暂停':'请求失败，请稍后再试')),{status:response.status});}return result;
}
function render(data){
 const status=monitorStatus(data);badge(byId('monitor-status'),status);text('current-price',price(data.last_1m_close));
 text('last-run',utc(data.last_run_at)+' UTC');text('last-minute',utc(data.last_processed_1m_close_ms)+' UTC');text('last-binance',utc(data.last_success_at)+' UTC');
 message('page-message',status==='BACKOFF'?`Binance BACKOFF · 恢复时间 ${utc(data.backoff_until)} UTC`:status==='DELAYED'?'DELAYED · 正在等待或补处理完成的分钟':status==='ERROR'?'ERROR · '+(data.last_error??'最近监控未成功'):null);
 const nearest=nearestZone(data);text('nearest-name',nearest?nearest.hierarchy+' '+nearest.side:'没有启用的区域');text('nearest-range',nearest?price(nearest.zone_low)+' — '+price(nearest.zone_high)+' USDT':'—');
 text('nearest-distance',nearest?price(nearest.distance)+' USDT · '+nearest.percent.toFixed(2)+'%':'—');badge(byId('nearest-status'),nearest?zoneStatus(nearest,data.settings):'DISABLED');
 const cards=zoneNames.map(name=>{
  const z=data.zones.find(z=>z.hierarchy+' '+z.side===name),card=node('article',null,'zone'),head=node('div',null,'zone-head');
  head.append(node('h3',name,name.startsWith('Weekly')?'weekly':'daily'));const pill=node('span',null);badge(pill,z?zoneStatus(z,data.settings):'WAIT');head.append(pill);card.append(head);
  card.append(node('div',z?`${price(z.zone_low)} — ${price(z.zone_high)}`:'等待父级数据','range'));
  card.append(node('small',z?`Parent ${utc(z.parent_open_ms)} → ${utc(z.parent_close_ms)} UTC`:'—'));
  card.append(node('small',z?`已触发：${z.triggered?'是 · '+utc(z.triggered_at)+' UTC':'否'}`:'—'));return card;
 });byId('zones').replaceChildren(...cards);
 const events=data.history.slice(0,100).map(h=>{
  const card=node('article',null,'event'),head=node('div',null,'event-head');head.append(node('strong',h.hierarchy.toUpperCase()+' / '+h.side.toUpperCase()));const pill=node('span',null);badge(pill,pushLabel(h));head.append(pill);card.append(head);
  card.append(node('div',price(h.zone_low)+' — '+price(h.zone_high)+' USDT','range'));const dl=node('dl');
  for(const [label,value]of[['Market Touch Time',utc(h.detected_1m_open_ms)+' → '+utc(h.detected_1m_close_ms)+' UTC'],['Detected Time',utc(h.detected_at)+' UTC'],['Detection Mode',h.detection_mode],['Bark Push',pushLabel(h)+' · '+h.push_attempts+' attempts']]){const row=node('div');row.append(node('dt',label),node('dd',value));dl.append(row);}card.append(dl);
  card.append(node('small','触碰时间为已完成分钟窗口；非精确成交触碰时间。'));return card;
 });byId('timeline').replaceChildren(...(events.length?events:[node('p','暂无 Trigger','subtle')]));
 badge(byId('push-status'),data.push.status);text('push-success',utc(data.push.last_success_at)+' UTC');text('push-attempts',String(data.push.attempts??0));
 text('push-error',data.push.last_failure?.error??data.push.error??'');
 if(!dirty)for(const key of keys){if(key==='history_retention_days')byId(key).value=data.settings[key];else byId(key).checked=data.settings[key];}
 chart.update(data);
}
async function refresh(){
 if(!session||loading)return;loading=true;const epoch=generation;
 try{const data=await api('state');if(epoch!==generation)return;state=data;render(data);byId('dashboard').hidden=false;byId('login').hidden=true;}
 catch(error){if(session){message('page-message','后台读取失败，显示上次快照；'+error.message);badge(byId('monitor-status'),'DELAYED');}}
 finally{loading=false;}
}
async function refreshChart(){
 if(!session)return;const epoch=generation;byId('refresh-chart').disabled=true;
 try{const data=await api('chart');if(epoch!==generation)return;chart.update(state,data.candles);text('chart-message','');}
 catch(error){if(epoch===generation)text('chart-message',error.status===429?'图表请求冷却中，请稍后刷新。':error.message);}
 finally{byId('refresh-chart').disabled=false;}
}
async function acceptSession(value){
 if(!value){clearSession();return;}if(session?.user.id===value.user.id){session=value;return;}
 generation++;session=value;await refresh();if(!session)return;text('account',value.user.email??'已登录');
 clearInterval(refreshTimer);clearInterval(chartTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
 chartTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshChart();},300000);await refreshChart();
}
byId('login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!client)return;byId('login-submit').disabled=true;text('login-message','正在发送…');
 try{const{error}=await client.auth.signInWithOtp({email:byId('email').value.trim(),options:{emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;
  text('login-message','已发送登录邮件，请在此设备打开登录链接；如邮件提供验证码，也可在下方输入。');byId('verify-form').hidden=false;}
 catch(error){text('login-message','登录邮件发送失败：'+error.message);}finally{byId('login-submit').disabled=false;}
});
byId('verify-form').addEventListener('submit',async event=>{event.preventDefault();try{const{error}=await client.auth.verifyOtp({email:byId('email').value.trim(),token:byId('otp').value.trim(),type:'email'});if(error)throw error;byId('otp').value='';}catch(error){text('login-message',error.message);}});
byId('logout').addEventListener('click',async()=>{clearSession();const{error}=await client.auth.signOut({scope:'local'});text('login-message',error?'本机已退出；服务端退出失败，请检查网络。':'已退出登录。');});
byId('settings-form').addEventListener('input',()=>{dirty=true;});
byId('settings-form').addEventListener('submit',async event=>{
 event.preventDefault();const value=Object.fromEntries(keys.map(k=>[k,k==='history_retention_days'?Number(byId(k).value):byId(k).checked]));byId('save-settings').disabled=true;
 try{await api('settings',value);dirty=false;text('settings-message','已保存，现有 Trigger 状态保持。');await refresh();}catch(error){text('settings-message',error.message);}finally{byId('save-settings').disabled=false;}
});
byId('test-push').addEventListener('click',async()=>{byId('test-push').disabled=true;text('test-message','正在发送测试通知…');
 try{const result=await api('test',{});text('test-message',result.success?'Bark 已接收，请核对 iPhone 通知。':'测试失败');}catch(error){text('test-message',error.message);}finally{byId('test-push').disabled=false;}});
byId('zoom-in').addEventListener('click',()=>chart.zoom(-5));byId('zoom-out').addEventListener('click',()=>chart.zoom(5));byId('refresh-chart').addEventListener('click',refreshChart);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
try{
 const configResponse=await fetch(endpoint+'?action=config',{headers:{'x-region':'ap-southeast-1'},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!configResponse.ok)throw Error('登录服务暂时不可用');
 const config=await configResponse.json();client=createClient(config.url,config.publishable_key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange((event,value)=>{setTimeout(()=>acceptSession(value),0);});
 const {data,error}=await client.auth.getSession();if(error)throw error;await acceptSession(data.session);if(!data.session)text('login-message','请输入授权邮箱登录。');
}catch(error){text('login-message',error.message);byId('login-submit').disabled=true;}
