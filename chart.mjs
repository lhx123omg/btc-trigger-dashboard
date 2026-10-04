import{chartPeriod,defaultInterval}from './chart-periods.mjs';
import{price,utc}from './view-model.mjs';

export function createChart(canvas,{mode='behavior'}={}){
 let interval=mode==='context'?'1d':defaultInterval;
 let candles=[],state=null,count=mode==='context'?70:64,end=0,startX=null,touchSpan=null;
 const context=canvas.getContext('2d');

 function visibleEvents(slice){
  if(mode!=='behavior')return[];
  const events=state?.shadow?.events??[];
  const opens=new Set(slice.map(c=>Number(c.time)));
  return events.filter(e=>opens.has(Number(e.h4_open_ms)));
 }

 function draw(){
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);
  const pad={left:12,right:82,top:22,bottom:34},w=Math.max(1,width-pad.left-pad.right),h=Math.max(1,height-pad.top-pad.bottom);
  const slice=candles.slice(Math.max(0,end-count),end),latest=slice.at(-1)?.close;
  const shadow=state?.shadow?.state??{};
  const zoneLow=Number(shadow.current_zone_low),zoneHigh=Number(shadow.current_daily_high);
  const referenceClose=Number(shadow.current_daily_close_ms);
  const hasShared=Number.isFinite(zoneLow)&&Number.isFinite(zoneHigh)&&zoneHigh>=zoneLow;
  const values=[...slice.flatMap(c=>[Number(c.low),Number(c.high)]),...(hasShared?[zoneLow,zoneHigh]:[]),...(latest!=null?[Number(latest)]:[])];
  if(!values.length){context.fillStyle='#8196aa';context.font='13px system-ui';context.fillText(mode==='context'?'正在加载日线…':'正在加载4小时K线…',18,height/2);return;}

  let lo=Math.min(...values),hi=Math.max(...values);const margin=Math.max(10,(hi-lo)*.08);lo-=margin;hi+=margin;
  const y=v=>pad.top+(hi-Number(v))/(hi-lo)*h;
  const step=w/Math.max(1,slice.length),xAt=i=>pad.left+step*(i+.5);
  const referenceIndex=mode==='context'&&Number.isFinite(referenceClose)?slice.findIndex(c=>Number(c.close_time)===referenceClose):-1;
  const firstActiveIndex=mode==='behavior'&&Number.isFinite(referenceClose)?slice.findIndex(c=>Number(c.time)>referenceClose):-1;
  const sharedStart=referenceIndex>=0
   ?Math.max(pad.left,xAt(referenceIndex)-step*.52)
   :firstActiveIndex>=0
    ?Math.max(pad.left,xAt(firstActiveIndex)-step*.52)
    :pad.left;
  const sharedWidth=Math.max(1,pad.left+w-sharedStart);

  context.font='11px system-ui';context.textBaseline='middle';
  for(let i=0;i<=5;i++){
   const value=lo+(hi-lo)*i/5,at=y(value);
   context.strokeStyle='#1c2b3b';context.lineWidth=1;context.beginPath();context.moveTo(pad.left,at);context.lineTo(pad.left+w,at);context.stroke();
   context.fillStyle='#8296aa';context.fillText(price(value),pad.left+w+7,at);
  }

  if(referenceIndex>=0){
   const x=xAt(referenceIndex),left=Math.max(pad.left,x-step*.58),width=Math.min(step*1.16,pad.left+w-left);
   const glow=context.createLinearGradient(left,0,left+width,0);
   glow.addColorStop(0,'rgba(45,212,191,.035)');
   glow.addColorStop(.5,'rgba(45,212,191,.16)');
   glow.addColorStop(1,'rgba(45,212,191,.035)');
   context.fillStyle=glow;context.fillRect(left,pad.top,width,h);
  }

  if(hasShared){
   const top=y(zoneHigh),bottom=y(zoneLow),bandHeight=Math.max(3,bottom-top),broken=Boolean(shadow.current_broken);
   const fill=context.createLinearGradient(sharedStart,0,pad.left+w,0);
   if(broken){
    fill.addColorStop(0,'rgba(148,163,184,.08)');
    fill.addColorStop(1,'rgba(148,163,184,.035)');
   }else{
    fill.addColorStop(0,'rgba(45,212,191,.20)');
    fill.addColorStop(.32,'rgba(45,212,191,.16)');
    fill.addColorStop(1,'rgba(45,212,191,.11)');
   }
   context.fillStyle=fill;context.fillRect(sharedStart,top,sharedWidth,bandHeight);

   context.strokeStyle=broken?'rgba(148,163,184,.28)':'rgba(45,212,191,.62)';
   context.lineWidth=1;context.setLineDash(broken?[6,5]:[]);
   context.beginPath();context.moveTo(sharedStart,top);context.lineTo(pad.left+w,top);context.stroke();
   context.beginPath();context.moveTo(sharedStart,bottom);context.lineTo(pad.left+w,bottom);context.stroke();
   context.setLineDash([]);

   const labelX=Math.min(pad.left+w-126,sharedStart+8);
   context.fillStyle=broken?'#8794a5':'#74e0d0';
   context.fillText('日线关键区'+(broken?' · 已失效':''),labelX,Math.min(bottom-9,top+11));

   const highY=y(zoneHigh);
   context.strokeStyle=broken?'rgba(93,169,255,.42)':'rgba(93,169,255,.84)';
   context.lineWidth=1;context.setLineDash([7,4]);
   context.beginPath();context.moveTo(sharedStart,highY);context.lineTo(pad.left+w,highY);context.stroke();context.setLineDash([]);
   context.fillStyle=broken?'#668aaa':'#73b8ff';
   context.fillText('前一日高点',labelX,Math.max(pad.top+10,highY-9));
  }

  slice.forEach((c,i)=>{
   const x=xAt(i),up=Number(c.close)>=Number(c.open);
   const isReference=mode==='context'&&Number(c.close_time)===referenceClose;
   context.strokeStyle=up?'#46cfad':'#ed7185';context.fillStyle=context.strokeStyle;context.lineWidth=isReference?1.6:1;
   context.beginPath();context.moveTo(x,y(c.high));context.lineTo(x,y(c.low));context.stroke();
   const bw=Math.max(2,Math.min(12,step*.58)),bodyTop=y(Math.max(c.open,c.close)),bodyHeight=Math.max(1,Math.abs(y(c.open)-y(c.close)));
   context.fillRect(x-bw/2,bodyTop,bw,bodyHeight);
   if(isReference){
    context.strokeStyle='rgba(45,212,191,.82)';context.lineWidth=1.2;context.setLineDash([3,3]);
    context.strokeRect(x-bw/2-4,y(c.high)-5,bw+8,Math.max(10,y(c.low)-y(c.high)+10));context.setLineDash([]);
    context.fillStyle='#86eadc';context.font='700 10px system-ui';
    context.fillText('参考日K',Math.min(pad.left+w-58,x+8),Math.max(pad.top+12,y(c.high)-11));
    context.font='11px system-ui';
   }
  });

  if(mode==='behavior'){
   for(const e of visibleEvents(slice)){
    const i=slice.findIndex(c=>Number(c.time)===Number(e.h4_open_ms));if(i<0)continue;
    const c=slice[i],x=xAt(i),cy=y(c.high)-17;
    context.fillStyle='#ff9d59';context.beginPath();context.arc(x,cy,4,0,Math.PI*2);context.fill();
    context.strokeStyle='#ff9d59';context.beginPath();context.moveTo(x,cy+5);context.lineTo(x,y(c.high)-2);context.stroke();
    context.fillStyle='#ffb37f';context.font='700 10px system-ui';context.fillText('信号 #'+e.alert_number,Math.min(x+7,pad.left+w-46),cy);
    context.font='11px system-ui';
   }
  }

  if(latest!=null){
   context.strokeStyle='rgba(240,189,99,.75)';context.setLineDash([4,3]);context.beginPath();context.moveTo(pad.left,y(latest));context.lineTo(pad.left+w,y(latest));context.stroke();context.setLineDash([]);
  }

  context.fillStyle='#7f93a8';
  if(slice.length){
   context.fillText(tick(slice[0].time),pad.left,height-14);
   const lastLabel=tick(slice.at(-1).time);context.fillText(lastLabel,Math.max(pad.left,width-pad.right-context.measureText(lastLabel).width),height-14);
  }
 }
 const tick=time=>interval==='1d'||interval==='1w'?new Date(time).toISOString().slice(0,10):utc(time).slice(0,11);
 const zoom=delta=>{count=Math.max(12,Math.min(Math.max(12,candles.length),count+delta));draw();};
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?6:-6);},{passive:false});
 canvas.addEventListener('pointerdown',e=>{startX=e.clientX;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(startX==null||e.pointerType==='touch')return;const delta=Math.round((e.clientX-startX)/12);if(delta){end=Math.max(Math.min(count,candles.length),Math.min(candles.length,end-delta));startX=e.clientX;draw();}});
 canvas.addEventListener('pointerup',()=>{startX=null;});canvas.addEventListener('pointercancel',()=>{startX=null;});
 canvas.addEventListener('touchstart',e=>{if(e.touches.length===2)touchSpan=Math.abs(e.touches[0].clientX-e.touches[1].clientX);},{passive:true});
 canvas.addEventListener('touchmove',e=>{if(e.touches.length!==2||touchSpan==null)return;e.preventDefault();const next=Math.abs(e.touches[0].clientX-e.touches[1].clientX);if(Math.abs(next-touchSpan)>10){zoom(next>touchSpan?-6:6);touchSpan=next;}},{passive:false});
 canvas.addEventListener('touchend',()=>{touchSpan=null;});
 const observer=new ResizeObserver(draw);observer.observe(canvas);
 return{
  update(data,newCandles,period=interval){state=data;if(newCandles){interval=period;candles=newCandles.slice(-chartPeriod(interval).limit);end=candles.length;}draw();},
  setPeriod(period){interval=period;candles=[];count=period==='1d'?70:64;end=0;draw();},
  zoom,clear(){candles=[];state=null;interval=mode==='context'?'1d':defaultInterval;end=0;draw();}
 };
}
