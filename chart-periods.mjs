export const chartPeriods=Object.freeze([
 {interval:'15m',label:'15分钟',limit:250},{interval:'4h',label:'4小时',limit:250},
 {interval:'1d',label:'1天',limit:200},{interval:'1w',label:'1周',limit:150}
].map(Object.freeze));
export const defaultInterval='4h';
export const chartPeriod=interval=>chartPeriods.find(p=>p.interval===interval)??null;
export function createChartLoader({load,onSelection=()=>{},onLoading=()=>{},onCandles=()=>{},onError=()=>{},now=Date.now}){
 let selected=defaultInterval,sequence=0;const cache=new Map();
 return{get selected(){return selected;},get cacheSize(){return cache.size;},
  clear(){sequence++;selected=defaultInterval;cache.clear();onLoading(false);onSelection(chartPeriod(selected));},
  async select(interval=selected,{force=false}={}){
   const period=chartPeriod(interval);if(!period)throw Error('不支持的K线周期');
   const switched=interval!==selected;selected=interval;const request=++sequence;onSelection(period,switched);
   const saved=cache.get(interval);
   if(!force&&saved&&saved.until>now()){onCandles(saved.candles,period);onLoading(false);return true;}
   onLoading(true);
   try{
    const data=await load(interval);
    if(request!==sequence)return false;
    if(data.interval!==interval||!Array.isArray(data.candles)||data.candles.length>period.limit)throw Error('K线数据不完整，请重新加载');
    const candles=data.candles.slice(-period.limit);cache.set(interval,{candles,until:now()+60000});
    onCandles(candles,period);return true;
   }catch(error){if(request===sequence)onError(error);return false;}
   finally{if(request===sequence)onLoading(false);}
  }
 };
}
