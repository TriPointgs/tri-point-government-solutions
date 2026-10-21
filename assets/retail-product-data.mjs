// Pure, bounded presentation of returned source data. Never fills in absent specifications.
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
export function safeImageData(value){return typeof value==='string'&&value.length<=550000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);}
export function matchesProduct(response,p){return response?.status==='matched'&&response?.identityVerified===true&&norm(response?.product?.brand)===norm(p.manufacturer)&&norm(response?.product?.partNumber)===norm(p.partNumber);}
export function selectProductHighlights(specs=[]){
 const data=(Array.isArray(specs)?specs:[]).filter(x=>typeof x?.name==='string'&&typeof x?.value==='string'&&x.value.trim()).slice(0,120),used=new Set(),out=[];
 const groups=[['Processor',/^(processor model|processor family|processor)$/i,'cpu'],['Memory',/^(internal memory|memory capacity|installed memory|ram)$/i,'memory'],['Storage',/^(total storage capacity|ssd capacity|storage capacity)$/i,'storage'],['Display',/^(display diagonal|screen size)$/i,'display'],['Operating system',/^(operating system installed|operating system)$/i,'system'],['Connectivity',/^(top wi-fi standard|wi-fi standards|ethernet lan data rates)$/i,'network']];
 for(const [label,pattern,icon]of groups){const i=data.findIndex(x=>pattern.test(x.name.trim()));if(i>=0){used.add(i);out.push({label,value:data[i].value,sourceName:data[i].name,icon});}}
 for(const [i,x]of data.entries()){if(out.length>=6)break;if(used.has(i))continue;out.push({label:x.name,value:x.value,sourceName:x.name,icon:'spec'});}
 return out;
}
export function sameOffer(offer,p,quantity,zip){return offer?.sku===p.sku&&norm(offer.partNumber)===norm(p.partNumber)&&norm(offer.manufacturer)===norm(p.manufacturer)&&offer.quantity===quantity&&offer.zip===zip;}
export function currentOffer(offer,now=Date.now()){const checked=Date.parse(offer?.checkedAt),until=Date.parse(offer?.validUntil);return Number.isFinite(checked)&&Number.isFinite(until)&&checked<=now+30000&&until>now&&now-checked<=900000;}
export function priceLabel(offer,now=Date.now()){return currentOffer(offer,now)&&offer.currency==='USD'&&Number.isSafeInteger(offer.unitPriceCents)&&offer.unitPriceCents>0?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(offer.unitPriceCents/100):'Price pending';}
