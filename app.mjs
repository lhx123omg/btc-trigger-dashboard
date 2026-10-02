import{createClient}from './vendor/supabase.js';
import{utc,price,zoneNames,zoneStatus,monitorStatus,nearestZone,pushLabel,statusText,zoneText,detectionText,chineseError}from './view-model.mjs';
import{createChart}from './chart.mjs';
import{createChartLoader}from './chart-periods.mjs';
import{authOptions,createEmailLogin,loginError,clearRejectedSession}from './login.mjs';
const endpoint='https://csyesqrldggjrtmdjbdi.supabase.co/functions/v1/btc-dashboard-api';
const byId=id=>document.getElementById(id),text=(id,value)=>{byId(id).textContent=value;};
const chart=createChart(byId('chart'));let client,session=null,state=null,loading=false,dirty=false,generation=0,refreshTimer,chartTimer;
let emailLogin,resuming=false,chartLoader;
let loginStorage;try{loginStorage=window.localStorage;}catch{}
function renderLoginButton(status){
 byId('login-submit').disabled=!client||status.disabled;
 text('login-submit',status.busy?'正在检查 / 发送…':status.seconds?`请勿重复发送 · ${status.seconds}s`:'发送登录链接');
}
const keys=['weekly_enabled','daily_enabled','upper_enabled','lower_enabled','history_retention_days'];
function badge(node,value){node.textContent=statusText(value);node.className='badge '+value;}
function node(tag,value,className){const el=document.createElement(tag);if(value!=null)el.textContent=value;if(className)el.className=className;return el;}
function message(id,value){text(id,value??'');byId(id).hidden=!value;}
function clearSession(){
 generation++;session=null;state=null;clearInterval(refreshTimer);clearInterval(chartTimer);byId('dashboard').hidden=true;byId('login').hidden=false;
 byId('zones').replaceChildren();byId('timeline').replaceChildren();chart.clear();chartLoader?.clear();text('account','—');text('current-price','—');
 for(const id of ['last-run','last-minute','last-binance','nearest-name','nearest-range','nearest-distance','push-success','push-attempts'])text(id,'—');
 for(const id of ['push-error','test-message','settings-message'])text(id,'');dirty=false;
}
async function api(action,body,params={}){
 const current=await client.auth.getSession();if(!current.data.session)throw Object.assign(Error('请重新登录'),{status:401});
 const query=new URLSearchParams({action,...params});
 const response=await fetch(`${endpoint}?${query}`,{method:body===undefined?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(12000),
 headers:{Authorization:`Bearer ${current.data.session.access_token}`,apikey:client.supabaseKey,'x-region':'ap-southeast-1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok){if(response.status===401||response.status===403){const rejected=response.status===401||await clearRejectedSession(client.auth,response.status,current.data.session.access_token);if(rejected){clearSession();text('login-message',result.error??'请重新登录');}}
 throw Object.assign(Error(result.error??(result.status==='BACKOFF'?'Binance 退避中，图表暂停':'请求失败，请稍后再试')),{status:response.status});}return result;
}
function render(data){
 const status=monitorStatus(data);badge(byId('monitor-status'),status);text('current-price',price(data.last_1m_close));
 text('last-run',utc(data.last_run_at)+' UTC');text('last-minute',utc(data.last_processed_1m_close_ms)+' UTC');text('last-binance',utc(data.last_success_at)+' UTC');
 message('page-message',status==='BACKOFF'?`Binance 退避中 · 恢复时间 ${utc(data.backoff_until)} UTC`:status==='DELAYED'?'延迟处理中 · 正在等待或补处理完成的分钟':status==='ERROR'?'异常 · '+chineseError({message:data.last_error??'最近监控未成功'}):null);
 const nearest=nearestZone(data);text('nearest-name',nearest?zoneText(nearest):'没有启用的区域');text('nearest-range',nearest?price(nearest.zone_low)+' — '+price(nearest.zone_high)+' USDT':'—');
 text('nearest-distance',nearest?'距离：'+price(nearest.distance)+' USDT · '+nearest.percent.toFixed(2)+'%':'—');badge(byId('nearest-status'),nearest?zoneStatus(nearest,data.settings):'DISABLED');
 const cards=zoneNames.map(name=>{
  const z=data.zones.find(z=>z.hierarchy+' '+z.side===name),card=node('article',null,'zone'),head=node('div',null,'zone-head');
  head.append(node('h3',z?zoneText(z):zoneText({hierarchy:name.split(' ')[0],side:name.split(' ')[1]}),name.startsWith('Weekly')?'weekly':'daily'));const pill=node('span',null);badge(pill,z?zoneStatus(z,data.settings):'WAIT');head.append(pill);card.append(head);
  card.append(node('div',z?`${price(z.zone_low)} — ${price(z.zone_high)}`:'等待父级数据','range'));
  card.append(node('small',z?`父级K线 ${utc(z.parent_open_ms)} → ${utc(z.parent_close_ms)} UTC`:'—'));
  card.append(node('small',z?`已触发：${z.triggered?'是 · '+utc(z.triggered_at)+' UTC':'否'}`:'—'));return card;
 });byId('zones').replaceChildren(...cards);
 const events=data.history.slice(0,100).map(h=>{
  const card=node('article',null,'event'),head=node('div',null,'event-head');head.append(node('strong',zoneText(h)));const pill=node('span',null);badge(pill,pushLabel(h));head.append(pill);card.append(head);
  card.append(node('div',price(h.zone_low)+' — '+price(h.zone_high)+' USDT','range'));const dl=node('dl');
  for(const [label,value]of[['市场触碰时间',utc(h.detected_1m_open_ms)+' → '+utc(h.detected_1m_close_ms)+' UTC'],['检测时间',utc(h.detected_at)+' UTC'],['检测模式',detectionText(h.detection_mode)],['Bark 推送',statusText(pushLabel(h))+' · '+h.push_attempts+' 次投递']]){const row=node('div');row.append(node('dt',label),node('dd',value));dl.append(row);}card.append(dl);
  card.append(node('small','触碰时间为已完成分钟窗口；非精确成交触碰时间。'));return card;
 });byId('timeline').replaceChildren(...(events.length?events:[node('p','暂无触发记录','subtle')]));
 badge(byId('push-status'),data.push.status);text('push-success',utc(data.push.last_success_at)+' UTC');text('push-attempts',String(data.push.attempts??0));
 text('push-error',data.push.last_failure?.error||data.push.error?chineseError({message:data.push.last_failure?.error??data.push.error}):'');
 if(!dirty)for(const key of keys){if(key==='history_retention_days')byId(key).value=data.settings[key];else byId(key).checked=data.settings[key];}
 chart.update(data);
}
async function refresh(){
 if(!session||loading)return;loading=true;const epoch=generation;
 try{const data=await api('state');if(epoch!==generation)return;state=data;render(data);byId('dashboard').hidden=false;byId('login').hidden=true;}
 catch(error){if(session){message('page-message','后台读取失败，显示上次快照；'+chineseError(error));badge(byId('monitor-status'),'DELAYED');}}
 finally{loading=false;}
}
chartLoader=createChartLoader({
 load:interval=>api('chart',undefined,{interval}),
 onSelection:(period,switched)=>{for(const button of document.querySelectorAll('[data-interval]')){const active=button.dataset.interval===period.interval;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}text('chart-title','BTC · '+period.label);text('chart-caption','后台行情 · 最多 '+period.limit+' 根 · UTC');byId('chart').setAttribute('aria-label','BTC '+period.label+'K线与四个正式针区');if(switched)chart.setPeriod(period.interval);},
 onLoading:value=>{byId('refresh-chart').disabled=value;byId('chart').setAttribute('aria-busy',String(value));if(value)text('chart-message','正在加载K线…');},
 onCandles:(candles,period)=>{chart.update(state,candles,period.interval);text('chart-caption','后台行情 · '+candles.length+' 根 / 最多 '+period.limit+' 根 · UTC');text('chart-message','');},
 onError:error=>{if(session)text('chart-message','K线加载失败：'+chineseError(error));}
});
async function refreshChart(){if(session)await chartLoader.select(chartLoader.selected,{force:true});}
for(const button of document.querySelectorAll('[data-interval]'))button.addEventListener('click',()=>{if(session)chartLoader.select(button.dataset.interval);});
async function acceptSession(value){
 if(!value){clearSession();return;}if(session?.user.id===value.user.id){session=value;return;}
 generation++;session=value;await refresh();if(!session)return;text('account',value.user.email??'已登录');
 clearInterval(refreshTimer);clearInterval(chartTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
 chartTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshChart();},300000);await refreshChart();
}
byId('login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!emailLogin||emailLogin.status().disabled)return;text('login-message','正在检查现有会话…');
 try{const result=await emailLogin.send(byId('email').value.trim(),new URL('./',location.href).href);
  if(result.kind==='session'){text('login-message','已有登录会话，正在恢复；无需发送邮件。');await acceptSession(result.session);await refresh();return;}
  if(result.kind==='sent'){text('login-message','邮件已发送，请勿重复点击。请在当前浏览器打开邮件登录链接；以后刷新或重新打开会自动恢复登录。');byId('verify-form').hidden=false;}}
 catch(error){text('login-message',loginError(error));}
});
byId('verify-form').addEventListener('submit',async event=>{event.preventDefault();try{const{error}=await client.auth.verifyOtp({email:byId('email').value.trim(),token:byId('otp').value.trim(),type:'email'});if(error)throw error;byId('otp').value='';}catch(error){text('login-message',chineseError(error));}});
byId('logout').addEventListener('click',async()=>{clearSession();const{error}=await client.auth.signOut({scope:'local'});text('login-message',error?'本机已退出；服务端退出失败，请检查网络。':'已退出登录。');});
byId('settings-form').addEventListener('input',()=>{dirty=true;});
byId('settings-form').addEventListener('submit',async event=>{
 event.preventDefault();const value=Object.fromEntries(keys.map(k=>[k,k==='history_retention_days'?Number(byId(k).value):byId(k).checked]));byId('save-settings').disabled=true;
 try{await api('settings',value);dirty=false;text('settings-message','已保存，现有触发状态保持。');await refresh();}catch(error){text('settings-message',chineseError(error));}finally{byId('save-settings').disabled=false;}
});
byId('test-push').addEventListener('click',async()=>{byId('test-push').disabled=true;text('test-message','正在发送测试通知…');
 try{const result=await api('test',{});text('test-message',result.success?'Bark 已接收，请核对 iPhone 通知。':'测试失败');}catch(error){text('test-message',chineseError(error));}finally{byId('test-push').disabled=false;}});
byId('zoom-in').addEventListener('click',()=>chart.zoom(-5));byId('zoom-out').addEventListener('click',()=>chart.zoom(5));byId('refresh-chart').addEventListener('click',refreshChart);
async function resumeSession(){
 if(!client||resuming)return;resuming=true;
 try{const{data,error}=await client.auth.getSession();if(error)throw error;await acceptSession(data.session);if(data.session)await refresh();}
 catch(error){if(session)message('page-message','会话恢复暂时失败，请检查网络；不会自动发送登录邮件。');}
 finally{resuming=false;emailLogin?.update();}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeSession();});
window.addEventListener('pageshow',resumeSession);
try{
 const configResponse=await fetch(endpoint+'?action=config',{headers:{'x-region':'ap-southeast-1'},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!configResponse.ok)throw Error('登录服务暂时不可用');
 const config=await configResponse.json();client=createClient(config.url,config.publishable_key,{auth:authOptions});
 emailLogin=createEmailLogin({auth:client.auth,storage:loginStorage,onChange:renderLoginButton});emailLogin.update();
 setInterval(()=>emailLogin.update(),1000);
 window.addEventListener('storage',event=>{if(event.key==='btc-trigger-email-cooldown-until-v1')emailLogin.update();});
 client.auth.onAuthStateChange((event,value)=>{setTimeout(()=>acceptSession(value),0);});
 const {data,error}=await client.auth.getSession();if(error)throw error;await acceptSession(data.session);if(!data.session)text('login-message',emailLogin.status().seconds?'上一笔邮件请求正在冷却，请勿重复点击；如已收到登录邮件，请使用该邮件。':'请输入授权邮箱登录。正常登录后无需每天申请邮件。');
}catch(error){text('login-message',chineseError(error));byId('login-submit').disabled=true;}
