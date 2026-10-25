const q=new URL(location.href).searchParams,id=q.get('order');
if(q.getAll('order').length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id||'')&&[...q.keys()].every(k=>['order','canceled','view'].includes(k)))location.replace('/shop-preview/checkout?order='+id);
