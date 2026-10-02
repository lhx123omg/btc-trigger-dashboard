export const authOptions={persistSession:true,autoRefreshToken:true,detectSessionInUrl:true};
const cooldownKey='btc-trigger-email-cooldown-until-v1';
export function createEmailLogin({auth,storage,now=Date.now,onChange=()=>{}}){
 let busy=false,until=0;
 function read(){try{const saved=Number(storage?.getItem(cooldownKey));if(Number.isFinite(saved)&&saved>now()&&saved<=now()+60000)until=Math.max(until,saved);}catch{}}
 function status(){read();const seconds=Math.max(0,Math.ceil((until-now())/1000));return{busy,seconds,disabled:busy||seconds>0};}
 const update=()=>onChange(status());
 return{status,update,async send(email,redirect){
  if(status().disabled)return{kind:'blocked'};
  busy=true;update();
  try{
   const current=await auth.getSession();if(current.error)throw current.error;
   if(current.data.session)return{kind:'session',session:current.data.session};
   // Recheck the shared, non-secret deadline after the asynchronous session read.
   if(status().seconds)return{kind:'blocked'};
   until=now()+60000;try{storage?.setItem(cooldownKey,String(until));}catch{}update();
   const result=await auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
   if(result.error)throw result.error;return{kind:'sent'};
  }finally{busy=false;update();}
 }};
}
export function loginError(error){
 if(error?.code==='over_email_send_rate_limit'||/email.*rate.*limit/i.test(error?.message??''))return '邮件发送已达 Supabase 内置限额，请等待额度恢复。60 秒冷却不代表邮件额度已恢复，请勿反复点击；如已收到登录邮件，请使用该邮件。';
 if(error?.status===429)return '登录请求过于频繁，请稍后再试；不会自动重复发送邮件。';
 return '登录邮件发送失败：'+(error?.message??'请检查网络后手动重试');
}
