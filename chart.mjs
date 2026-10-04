import{chartPeriod,defaultInterval}from './chart-periods.mjs';
import{enabled,price,utc,zoneText}from './view-model.mjs';
export function createChart(canvas){
 let interval=defaultInterval;let candles=[],state=null,count=50,end=0,startX=null,touchSpan=null;
 const context=canvas.getContext('2d');
 function draw(){
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.scale(dpr,dpr);context.clearRect(0,0,width,height);
  const pad={left:9,right:75,top:20,bottom:32},w=width-pad.left-pad.right,h=height-pad.top-pad.bottom;
  const slice=candles.slice(Math.max(0,end-count),end),legacy=(state?.zones??[]).filter(z=>enabled(z,state?.settings??{})),latest=slice.at(-1)?.close;
  const shadow=state?.shadow?.state??{},zoneLow=Number(shadow.current_zone_low),zoneHigh=Number(shadow.current_daily_high),hasShadow=Number.isFinite(zoneLow)&&Number.isFinite(zoneHigh)&&zoneHigh>=zoneLow;
  const values=[...slice.flatMap(c=>[c.low,c.high]),...legacy.flatMap(z=>[Number(z.zone_low),Number(z.zone_high)]),...(hasShadow?[zoneLow,zoneHigh]:[]),...(latest!=null?[Number(latest)]:[])];
  if(!values.length){context.fillStyle='#8798b2';context.font='14px system-ui';context.fillText('登录后加载 K 线与 V0 Shadow 区域',18,height/2);return;}
  let lo=Math.min(...values),hi=Math.max(...values);const margin=Math.max(10,(hi-lo)*.08);lo-=margin;hi+=margin;
  const y=v=>pad.top+(hi-Number(v))/(hi-lo)*h;
  context.font='11px system-ui';context.textBaseline='middle';
  for(let i=0;i<=5;i++){const value=lo+(hi-lo)*i/5,at=y(value);context.strokeStyle='#243044';context.beginPath();context.moveTo(pad.left,at);context.lineTo(pad.left+w,at);context.stroke();context.fillStyle='#98aac4';context.fillText(price(value),pad.left+w+6,at);}
  for(const z of legacy){const weekly=z.hierarchy==='Weekly',color=weekly?'173,139,250':'65,192,239',top=y(z.zone_high),bottom=y(z.zone_low);
   context.fillStyle=`rgba(${color},.08)`;context.fillRect(pad.left,top,w,Math.max(2,bottom-top));context.strokeStyle=`rgba(${color},.35)`;context.setLineDash([4,5]);context.strokeRect(pad.left,top,w,Math.max(2,bottom-top));context.setLineDash([]);
   context.fillStyle=weekly?'#aa99db':'#5ab1cd';context.fillText(zoneText(z),pad.left+5,top+10);
  }
  if(hasShadow){const top=y(zoneHigh),bottom=y(zoneLow),broken=Boolean(shadow.current_broken);context.fillStyle=broken?'rgba(255,157,89,.05)':'rgba(255,157,89,.13)';context.fillRect(pad.left,top,w,Math.max(2,bottom-top));context.strokeStyle=broken?'rgba(255,157,89,.35)':'rgba(255,157,89,.86)';context.setLineDash(broken?[6,5]:[]);context.strokeRect(pad.left,top,w,Math.max(2,bottom-top));context.setLineDash([]);context.fillStyle=broken?'#b68464':'#ffad72';context.fillText('V0 Daily 顶部50%'+(broken?' · 失效':''),pad.left+5,top+10);}
  const step=w/Math.max(1,slice.length);
  slice.forEach((c,i)=>{const x=pad.left+step*(i+.5),up=c.close>=c.open;context.strokeStyle=up?'#50d3aa':'#f17b8e';context.fillStyle=context.strokeStyle;context.beginPath();context.moveTo(x,y(c.high));context.lineTo(x,y(c.low));context.stroke();context.fillRect(x-Math.max(1,step*.27),y(Math.max(c.open,c.close)),Math.max(2,step*.54),Math.max(1,Math.abs(y(c.open)-y(c.close))));});
  if(latest!=null){context.strokeStyle='#f0bd63';context.setLineDash([4,3]);context.beginPath();context.moveTo(pad.left,y(latest));context.lineTo(pad.left+w,y(latest));context.stroke();context.setLineDash([]);}
  context.fillStyle='#8ba0bc';if(slice.length){context.fillText(tick(slice[0].time),pad.left,height-13);const text=tick(slice.at(-1).time);context.fillText(text,Math.max(pad.left,width-pad.right-context.measureText(text).width),height-13);}
 }
 const tick=time=>interval==='1d'||interval==='1w'?new Date(time).toISOString().slice(0,10):utc(time).slice(0,11);
 const zoom=delta=>{count=Math.max(10,Math.min(Math.max(10,candles.length),count+delta));draw();};
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?5:-5);},{passive:false});
 canvas.addEventListener('pointerdown',e=>{startX=e.clientX;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(startX==null||e.pointerType==='touch')return;const delta=Math.round((e.clientX-startX)/12);if(delta){end=Math.max(Math.min(count,candles.length),Math.min(candles.length,end-delta));startX=e.clientX;draw();}});
 canvas.addEventListener('pointerup',()=>{startX=null;});canvas.addEventListener('pointercancel',()=>{startX=null;});
 canvas.addEventListener('touchstart',e=>{if(e.touches.length===2)touchSpan=Math.abs(e.touches[0].clientX-e.touches[1].clientX);},{passive:true});
 canvas.addEventListener('touchmove',e=>{if(e.touches.length!==2||touchSpan==null)return;e.preventDefault();const next=Math.abs(e.touches[0].clientX-e.touches[1].clientX);if(Math.abs(next-touchSpan)>10){zoom(next>touchSpan?-5:5);touchSpan=next;}},{passive:false});
 canvas.addEventListener('touchend',()=>{touchSpan=null;});
 const observer=new ResizeObserver(draw);observer.observe(canvas);
 return {update(data,newCandles,period=interval){state=data;if(newCandles){interval=period;candles=newCandles.slice(-chartPeriod(interval).limit);end=candles.length;}draw();},setPeriod(period){interval=period;candles=[];count=50;end=0;draw();},zoom,clear(){candles=[];state=null;interval=defaultInterval;end=0;draw();}};
}
