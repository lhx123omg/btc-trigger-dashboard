import{createClient}from './vendor/supabase.js';
import{utc,price,zoneNames,zoneStatus,monitorStatus,shadowStatus,pushLabel,statusText,zoneText,detectionText,chineseError}from './view-model.mjs';
import{createChart}from './chart.mjs';
import{createChartLoader}from './chart-periods.mjs';
import{authOptions,createEmailLogin,loginError,clearRejectedSession}from './login.mjs';
const endpoint='https://csyesqrldggjrtmdjbdi.supabase.co/functions/v1/btc-dashboard-api';
const byId=id=>document.getElementById(id),text=(id,value)=>{byId(id).textContent=value;};
const chart=createChart(byId('chart'),{mode:'behavior'}),dailyChart=createChart(byId('daily-chart'),{mode:'context'});let client,session=null,state=null,loading=false,dirty=false,generation=0,refreshTimer,chartTimer;
let emailLogin,resuming=false,chartLoader,dailyChartLoader;
let loginStorage;try{loginStorage=window.localStorage;}catch{}
const layoutStorageKey='btc-trigger-layout-v1';
const layoutItems=[...document.querySelectorAll('[data-layout-id]')];
let layoutEditing=false;
function readLayout(){
 try{const value=JSON.parse(localStorage.getItem(layoutStorageKey)||'{}');return value&&typeof value==='object'?value:{};}catch{return{};}
}
function writeLayout(value){try{localStorage.setItem(layoutStorageKey,JSON.stringify(value));}catch{}}
let layoutState=readLayout();
function layoutSummary(){
 return layoutItems.map(el=>`${el.dataset.layoutLabel}: ${layoutState[el.dataset.layoutId]===false?'隐藏':'显示'}`).join('\n');
}
function updateLayoutEditor(){
 const hidden=layoutItems.filter(el=>layoutState[el.dataset.layoutId]===false);
 text('hidden-count',String(hidden.length));
 const box=byId('hidden-components');box.replaceChildren();
 if(!hidden.length){box.append(node('span','暂无隐藏组件','subtle'));return;}
 for(const el of hidden){
  const row=node('div',null,'hidden-component-row');
  row.append(node('span',el.dataset.layoutLabel));
  const restore=node('button','恢复','quiet');restore.type='button';restore.addEventListener('click',()=>setLayoutVisible(el.dataset.layoutId,true));
  row.append(restore);box.append(row);
 }
}
function setLayoutVisible(id,visible){
 layoutState[id]=visible;writeLayout(layoutState);applyLayout();
}
function ensureLayoutHandle(el){
 if(el.querySelector(':scope > .layout-hide-control'))return;
 const button=node('button','隐藏','layout-hide-control quiet');button.type='button';button.title='从当前浏览器布局隐藏';
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setLayoutVisible(el.dataset.layoutId,false);});
 el.append(button);
}
function applyLayout(){
 for(const el of layoutItems){
  ensureLayoutHandle(el);
  el.hidden=layoutState[el.dataset.layoutId]===false;
  el.classList.toggle('layout-editing',layoutEditing);
 }
 document.body.classList.toggle('layout-edit-mode',layoutEditing);
 byId('layout-editor').hidden=!layoutEditing;
 byId('layout-edit-toggle').setAttribute('aria-expanded',String(layoutEditing));
 text('layout-edit-toggle',layoutEditing?'完成布局':'编辑布局');
 updateLayoutEditor();
 window.dispatchEvent(new Event('resize'));
}
function setLayoutEditing(value){layoutEditing=Boolean(value);applyLayout();}
const layoutStorageKey='btc-trigger-layout-v1';
const layoutItems=[...document.querySelectorAll('[data-layout-id]')];
let layoutEditing=false;
function readLayout(){
 try{const value=JSON.parse(localStorage.getItem(layoutStorageKey)||'{}');return value&&typeof value==='object'?value:{};}catch{return{};}
}
function writeLayout(value){try{localStorage.setItem(layoutStorageKey,JSON.stringify(value));}catch{}}
let layoutState=readLayout();
function layoutSummary(){
 return layoutItems.map(el=>`${el.dataset.layoutLabel}: ${layoutState[el.dataset.layoutId]===false?'隐藏':'显示'}`).join('\n');
}
function updateLayoutEditor(){
 const hidden=layoutItems.filter(el=>layoutState[el.dataset.layoutId]===false);
 text('hidden-count',String(hidden.length));
 const box=byId('hidden-components');box.replaceChildren();
 if(!hidden.length){box.append(node('span','暂无隐藏组件','subtle'));return;}
 for(const el of hidden){
  const row=node('div',null,'hidden-component-row');
  row.append(node('span',el.dataset.layoutLabel));
  const restore=node('button','恢复','quiet');restore.type='button';restore.addEventListener('click',()=>setLayoutVisible(el.dataset.layoutId,true));
  row.append(restore);box.append(row);
 }
}
function setLayoutVisible(id,visible){
 layoutState[id]=visible;writeLayout(layoutState);applyLayout();
}
function ensureLayoutHandle(el){
 if(el.querySelector(':scope > .layout-hide-control'))return;
 const button=node('button','隐藏','layout-hide-control quiet');button.type='button';button.title='从当前浏览器布局隐藏';
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setLayoutVisible(el.dataset.layoutId,false);});
 el.append(button);
}
function applyLayout(){
 for(const el of layoutItems){
  ensureLayoutHandle(el);
  el.hidden=layoutState[el.dataset.layoutId]===false;
  el.classList.toggle('layout-editing',layoutEditing);
 }
 document.body.classList.toggle('layout-edit-mode',layoutEditing);
 byId('layout-editor').hidden=!layoutEditing;
 byId('layout-edit-toggle').setAttribute('aria-expanded',String(layoutEditing));
 text('layout-edit-toggle',layoutEditing?'完成布局':'编辑布局');
 updateLayoutEditor();
 window.dispatchEvent(new Event('resize'));
}
function setLayoutEditing(value){layoutEditing=Boolean(value);applyLayout();}
function renderLoginButton(status){byId('login-submit').disabled=!client||status.disabled;text('login-submit',status.busy?'正在检查 / 发送…':status.seconds?`请勿重复发送 · ${status.seconds}s`:'发送登录链接');}
const keys=['weekly_enabled','daily_enabled','upper_enabled','lower_enabled','history_retention_days'];
function badge(node,value){node.textContent=statusText(value);node.className='badge '+value;}
function node(tag,value,className){const el=document.createElement(tag);if(value!=null)el.textContent=value;if(className)el.className=className;return el;}
function message(id,value){text(id,value??'');byId(id).hidden=!value;}
function clearSession(){
 generation++;session=null;state=null;clearInterval(refreshTimer);clearInterval(chartTimer);byId('dashboard').hidden=true;byId('login').hidden=false;
 byId('zones').replaceChildren();byId('timeline').replaceChildren();byId('shadow-timeline').replaceChildren();byId('latest-shadow-event').replaceChildren();chart.clear();dailyChart.clear();chartLoader?.clear();dailyChartLoader?.clear();
 for(const id of ['account','last-run','last-minute','last-binance','shadow-last-success','shadow-zone','shadow-daily','shadow-alert-count','shadow-life','chart-price','chart-price-meta'])text(id,'—');
 for(const id of ['push-error','test-message','settings-message','shadow-message'])text(id,'');dirty=false;
}
async function api(action,body,params={}){
 const current=await client.auth.getSession();if(!current.data.session)throw Object.assign(Error('请重新登录'),{status:401});
 const query=new URLSearchParams({action,...params});
 const response=await fetch(`${endpoint}?${query}`,{method:body===undefined?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${current.data.session.access_token}`,apikey:client.supabaseKey,'x-region':'ap-southeast-1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok){if(response.status===401||response.status===403){const rejected=response.status===401||await clearRejectedSession(client.auth,response.status,current.data.session.access_token);if(rejected){clearSession();text('login-message',result.error??'请重新登录');}}throw Object.assign(Error(result.error??(result.status==='BACKOFF'?'Binance 退避中，图表暂停':'请求失败，请稍后再试')),{status:response.status});}return result;
}
function shadowEventCard(event,featured=false){
 const card=node('article',null,featured?'shadow-event-feature':'shadow-item');
 if(featured){card.append(node('div',`ALERT #${event.alert_number}`,'event-number'),node('div',`${utc(event.h4_open_ms)} → ${utc(event.h4_close_ms)} UTC`,'event-time'));const metrics=node('div',null,'event-metrics');for(const [label,value]of[['Daily 区域',`${price(event.zone_low)} — ${price(event.zone_high)}`],['4H High',price(event.h4_high)],['4H Close',price(event.h4_close)],['检测记录',utc(event.detected_at)+' UTC']]){const box=node('div');box.append(node('span',label),node('b',value));metrics.append(box);}card.append(metrics);return card;}
 const head=node('div',null,'shadow-item-head');head.append(node('strong',`Alert #${event.alert_number} · ${utc(event.h4_close_ms)} UTC`),node('span','V0','badge RUNNING'));card.append(head,node('div',`${price(event.zone_low)} — ${price(event.zone_high)} USDT`,'range'),node('small',`4H O/H/L/C ${price(event.h4_open)} / ${price(event.h4_high)} / ${price(event.h4_low)} / ${price(event.h4_close)}`),node('small',`参考 Daily High ${price(event.daily_high)} · detected ${utc(event.detected_at)} UTC`));return card;
}
function render(data){
 const s=data.shadow?.state??{},shadowEvents=data.shadow?.events??[],ss=shadowStatus(data);badge(byId('shadow-header-status'),ss);badge(byId('shadow-status'),ss);text('shadow-status-text',statusText(ss));
 text('shadow-last-success',utc(s.last_success_at)+' UTC');text('shadow-zone',s.current_zone_low!=null?`${price(s.current_zone_low)} — ${price(s.current_daily_high)}`:'等待 Daily 参考');text('shadow-daily',s.current_daily_close_ms?`参考 Daily · ${utc(Number(s.current_daily_close_ms)-86_399_999)} → ${utc(s.current_daily_close_ms)} UTC`:'—');
 text('shadow-alert-count',`${Number(s.current_alert_count??0)} / 2`);text('shadow-life',s.current_broken?'4H 实体已突破 Daily High · 本参考失效':'Daily High 尚未被 4H 实体突破');
 const shadowMessage=ss==='BACKOFF'?`Binance 退避中 · Shadow cursor 不推进`:ss==='ERROR'?`Shadow 异常 · ${chineseError({message:s.last_error??'最近检查失败'})}`:s.current_broken?'当前 Daily 顶部参考已失效，等待下一根 completed Daily。':'每根 completed 4H 后自动检查；当前仅做 Shadow 记录，不发 Bark。';text('shadow-message',shadowMessage);
 message('page-message',ss==='BACKOFF'||ss==='ERROR'?shadowMessage:null);
 const latest=shadowEvents[0];badge(byId('latest-shadow-badge'),latest?'TRIGGERED':'WAIT');byId('latest-shadow-event').replaceChildren(latest?shadowEventCard(latest,true):node('div','暂无 Shadow 命中','empty-state'));
 byId('shadow-timeline').replaceChildren(...(shadowEvents.length?shadowEvents.map(e=>shadowEventCard(e,false)):[node('p','暂无 Shadow 记录','subtle')]));

 const legacy=monitorStatus(data);badge(byId('monitor-status'),legacy);text('last-run',utc(data.last_run_at)+' UTC');text('last-minute',utc(data.last_processed_1m_close_ms)+' UTC');text('last-binance',utc(data.last_success_at)+' UTC');
 const cards=zoneNames.map(name=>{const z=data.zones.find(z=>z.hierarchy+' '+z.side===name),card=node('article',null,'zone'),head=node('div',null,'zone-head');head.append(node('h3',z?zoneText(z):zoneText({hierarchy:name.split(' ')[0],side:name.split(' ')[1]}),name.startsWith('Weekly')?'weekly':'daily'));const pill=node('span',null);badge(pill,z?zoneStatus(z,data.settings):'WAIT');head.append(pill);card.append(head);card.append(node('div',z?`${price(z.zone_low)} — ${price(z.zone_high)}`:'等待父级数据','range'));card.append(node('small',z?`父级 ${utc(z.parent_open_ms)} → ${utc(z.parent_close_ms)} UTC`:'—'));return card;});byId('zones').replaceChildren(...cards);
 const events=data.history.slice(0,100).map(h=>{const card=node('article',null,'event'),head=node('div',null,'event-head');head.append(node('strong',zoneText(h)));const pill=node('span',null);badge(pill,pushLabel(h));head.append(pill);card.append(head);card.append(node('div',price(h.zone_low)+' — '+price(h.zone_high)+' USDT','range'));const dl=node('dl');for(const [label,value]of[['市场触碰时间',utc(h.detected_1m_open_ms)+' → '+utc(h.detected_1m_close_ms)+' UTC'],['检测时间',utc(h.detected_at)+' UTC'],['检测模式',detectionText(h.detection_mode)],['Bark 推送',statusText(pushLabel(h))+' · '+h.push_attempts+' 次投递']]){const row=node('div');row.append(node('dt',label),node('dd',value));dl.append(row);}card.append(dl);return card;});byId('timeline').replaceChildren(...(events.length?events:[node('p','暂无旧触发记录','subtle')]));
 badge(byId('push-status'),data.push.status);text('push-success',utc(data.push.last_success_at)+' UTC');text('push-attempts',String(data.push.attempts??0));text('push-error',data.push.last_failure?.error||data.push.error?chineseError({message:data.push.last_failure?.error??data.push.error}):'');
 if(!dirty)for(const key of keys){if(key==='history_retention_days')byId(key).value=data.settings[key];else byId(key).checked=data.settings[key];}
 chart.update(data);dailyChart.update(data);
}
async function refresh(){if(!session||loading)return;loading=true;const epoch=generation;try{const data=await api('state');if(epoch!==generation)return;state=data;render(data);byId('dashboard').hidden=false;byId('login').hidden=true;}catch(error){if(session){message('page-message','后台读取失败，显示上次快照；'+chineseError(error));badge(byId('shadow-header-status'),'DELAYED');}}finally{loading=false;}}
chartLoader=createChartLoader({
 load:()=>api('chart',undefined,{interval:'4h'}),
 onSelection:()=>{},
 onLoading:value=>{byId('refresh-chart').disabled=value;byId('chart').setAttribute('aria-busy',String(value));if(value)text('chart-message','正在加载 4H K线…');},
 onCandles:candles=>{chart.update(state,candles,'4h');text('chart-caption','completed 4H · '+candles.length+' 根 · Shared Daily Context · UTC');const last=candles.at(-1);text('chart-price',last?price(last.close):'—');text('chart-price-meta',last?`4小时 · ${utc(last.close_time)} UTC · completed`:'—');text('chart-message','');},
 onError:error=>{if(session)text('chart-message','4H K线加载失败：'+chineseError(error));}
});
dailyChartLoader=createChartLoader({
 load:()=>api('chart',undefined,{interval:'1d'}),
 onSelection:()=>{},
 onLoading:value=>{byId('refresh-daily-chart').disabled=value;byId('daily-chart').setAttribute('aria-busy',String(value));if(value)text('daily-chart-message','正在加载 1D K线…');},
 onCandles:candles=>{dailyChart.update(state,candles,'1d');text('daily-chart-caption','completed 1D · '+candles.length+' 根 · 与4H共享同一关键位置背景 · UTC');text('daily-chart-message','');},
 onError:error=>{if(session)text('daily-chart-message','1D K线加载失败：'+chineseError(error));}
});
async function refreshChart(){if(session)await chartLoader.select('4h',{force:true});}
async function refreshDailyChart(){if(session)await dailyChartLoader.select('1d',{force:true});}
async function acceptSession(value){if(!value){clearSession();return;}if(session?.user.id===value.user.id){session=value;return;}generation++;session=value;await refresh();if(!session)return;text('account',value.user.email??'已登录');clearInterval(refreshTimer);clearInterval(chartTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);chartTimer=setInterval(()=>{if(document.visibilityState==='visible'){refreshChart();refreshDailyChart();}},300000);await Promise.all([refreshChart(),refreshDailyChart()]);}
byId('login-form').addEventListener('submit',async event=>{event.preventDefault();if(!emailLogin||emailLogin.status().disabled)return;text('login-message','正在检查现有会话…');try{const result=await emailLogin.send(byId('email').value.trim(),new URL('./',location.href).href);if(result.kind==='session'){text('login-message','已有登录会话，正在恢复。');await acceptSession(result.session);await refresh();return;}if(result.kind==='sent'){text('login-message','邮件已发送，请在当前浏览器打开登录链接。');byId('verify-form').hidden=false;}}catch(error){text('login-message',loginError(error));}});
byId('verify-form').addEventListener('submit',async event=>{event.preventDefault();try{const{error}=await client.auth.verifyOtp({email:byId('email').value.trim(),token:byId('otp').value.trim(),type:'email'});if(error)throw error;byId('otp').value='';}catch(error){text('login-message',chineseError(error));}});
byId('logout').addEventListener('click',async()=>{clearSession();const{error}=await client.auth.signOut({scope:'local'});text('login-message',error?'本机已退出；服务端退出失败，请检查网络。':'已退出登录。');});
byId('settings-form').addEventListener('input',()=>{dirty=true;});
byId('settings-form').addEventListener('submit',async event=>{event.preventDefault();const value=Object.fromEntries(keys.map(k=>[k,k==='history_retention_days'?Number(byId(k).value):byId(k).checked]));byId('save-settings').disabled=true;try{await api('settings',value);dirty=false;text('settings-message','已保存，旧系统触发状态保持。');await refresh();}catch(error){text('settings-message',chineseError(error));}finally{byId('save-settings').disabled=false;}});
byId('test-push').addEventListener('click',async()=>{byId('test-push').disabled=true;text('test-message','正在发送测试通知…');try{const result=await api('test',{});text('test-message',result.success?'Bark 已接收，请核对 iPhone 通知。':'测试失败');}catch(error){text('test-message',chineseError(error));}finally{byId('test-push').disabled=false;}});
byId('layout-edit-toggle').addEventListener('click',()=>setLayoutEditing(!layoutEditing));
byId('layout-editor-close').addEventListener('click',()=>setLayoutEditing(false));
byId('reset-layout').addEventListener('click',()=>{layoutState={};writeLayout(layoutState);applyLayout();text('layout-editor-message','已恢复默认布局。');});
byId('copy-layout-config').addEventListener('click',async()=>{
 const value=layoutSummary();
 try{await navigator.clipboard.writeText(value);text('layout-editor-message','布局配置已复制，可以直接发给我。');}
 catch{window.prompt('复制下面的布局配置：',value);text('layout-editor-message','已生成布局配置。');}
});
applyLayout();
byId('layout-edit-toggle').addEventListener('click',()=>setLayoutEditing(!layoutEditing));
byId('layout-editor-close').addEventListener('click',()=>setLayoutEditing(false));
byId('reset-layout').addEventListener('click',()=>{layoutState={};writeLayout(layoutState);applyLayout();text('layout-editor-message','已恢复默认布局。');});
byId('copy-layout-config').addEventListener('click',async()=>{
 const value=layoutSummary();
 try{await navigator.clipboard.writeText(value);text('layout-editor-message','布局配置已复制，可以直接发给我。');}
 catch{window.prompt('复制下面的布局配置：',value);text('layout-editor-message','已生成布局配置。');}
});
applyLayout();
byId('zoom-in').addEventListener('click',()=>chart.zoom(-6));byId('zoom-out').addEventListener('click',()=>chart.zoom(6));byId('refresh-chart').addEventListener('click',refreshChart);byId('daily-zoom-in').addEventListener('click',()=>dailyChart.zoom(-6));byId('daily-zoom-out').addEventListener('click',()=>dailyChart.zoom(6));byId('refresh-daily-chart').addEventListener('click',refreshDailyChart);
async function resumeSession(){if(!client||resuming)return;resuming=true;try{const{data,error}=await client.auth.getSession();if(error)throw error;await acceptSession(data.session);if(data.session)await refresh();}catch(error){if(session)message('page-message','会话恢复暂时失败，请检查网络；不会自动发送登录邮件。');}finally{resuming=false;emailLogin?.update();}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeSession();});window.addEventListener('pageshow',resumeSession);
try{const configResponse=await fetch(endpoint+'?action=config',{headers:{'x-region':'ap-southeast-1'},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!configResponse.ok)throw Error('登录服务暂时不可用');const config=await configResponse.json();client=createClient(config.url,config.publishable_key,{auth:authOptions});emailLogin=createEmailLogin({auth:client.auth,storage:loginStorage,onChange:renderLoginButton});emailLogin.update();setInterval(()=>emailLogin.update(),1000);window.addEventListener('storage',event=>{if(event.key==='btc-trigger-email-cooldown-until-v1')emailLogin.update();});client.auth.onAuthStateChange((event,value)=>{setTimeout(()=>acceptSession(value),0);});const {data,error}=await client.auth.getSession();if(error)throw error;await acceptSession(data.session);if(!data.session)text('login-message',emailLogin.status().seconds?'上一笔邮件请求正在冷却；如已收到登录邮件，请使用该邮件。':'请输入授权邮箱登录。');}catch(error){text('login-message',chineseError(error));byId('login-submit').disabled=true;}
