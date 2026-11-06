// Only visible products are requested; a page is never a request to enrich the full catalog.
export function createProductImageQueue({load,render,onError,onStart=()=>{},concurrency=2,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4)throw Error('Invalid image concurrency.');
 let entries=new Map(),active=0,pauseUntil=0,timer=null,version=0,order=0,disposed=false;
 const wake=()=>{if(timer){clearTimer(timer);timer=null;}const wait=pauseUntil-now();if(wait>0){timer=setTimer(()=>{timer=null;for(const entry of entries.values())if(entry.state==='paused'&&entry.retries<1){entry.state='waiting';entry.retries++;}pump();},wait+10);return true;}return false;};
 function pump(){if(disposed||wake())return;while(active<concurrency){const entry=[...entries.values()].filter(x=>x.visible&&x.state==='waiting').sort((a,b)=>b.priority-a.priority||a.order-b.order)[0];if(!entry)return;entry.state='loading';active++;const current=version;onStart(entry.value);
   Promise.resolve().then(()=>load(entry.value)).then(result=>{if(!disposed&&current===version&&entries.get(entry.key)===entry){entry.state='done';render(entry.value,result);}},error=>{
    if(disposed)return;
    if(error?.status===429){const seconds=Math.max(1,Math.min(900,Number(error.retryAfter)||60));pauseUntil=Math.max(pauseUntil,now()+seconds*1000);}
    if(current===version&&entries.get(entry.key)===entry){entry.state=error?.status===429?'paused':'failed';onError(entry.value,error);}
   }).finally(()=>{active--;pump();});
 }}
 return {set(values){version++;entries=new Map(values.map(value=>[value.key,{key:value.key,value,visible:false,priority:0,order:order++,state:'waiting',retries:0}]));},
  visible(key,value=true,priority=0){const entry=entries.get(key);if(!entry)return;entry.visible=!!value;entry.priority=Math.max(entry.priority,priority);pump();},
  retry(key){const entry=entries.get(key);if(!entry||entry.state==='loading')return;entry.state='waiting';entry.visible=true;entry.priority=10;if(pauseUntil>now()){onError(entry.value,{status:429,retryAfter:Math.ceil((pauseUntil-now())/1000)});wake();return;}pump();},
  clear(){version++;entries.clear();},
  state(){return {active,pending:[...entries.values()].filter(x=>x.visible&&x.state==='waiting').length,pausedUntil:pauseUntil};},
  dispose(){disposed=true;version++;entries.clear();if(timer)clearTimer(timer);}};
}
export function imageFailureLabel(error){if(error?.status===429)return 'Photo lookup paused';if(error?.status===401)return 'Sign in to load photos';if(error?.code==='icecat_access_denied')return 'Photo access needs attention';return 'Photo temporarily unavailable';}
export function imageResultLabel(result){if(result?.imageStatus==='download-failed')return 'Photo temporarily unavailable';if(result?.status==='account-or-brand-access-held')return 'Photo not available for this account';if(result?.status==='identity-mismatch')return 'Exact-product photo not found';return 'No product photo supplied';}
