const q=new URL(location.href).searchParams,id=q.get('order');
if(q.getAll('order').length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id||'')&&[...q.keys()].every(k=>['order','canceled','view'].includes(k))){
 // The neutral landing page carries no payment proof. A same-origin read restores Strict-cookie routing.
 let destination='/shop-preview/checkout?order='+id;
 try{const r=await fetch('/api/shop?view=cart-checkout-pay-return&order='+id,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.ok&&(await r.json()).destination==='/buyer-preview/checkout')destination='/buyer-preview/checkout';}catch{}
 location.replace(destination);
}
