// Shared clean route helpers; no tokens or account state.
export const SHOP_CATEGORIES=Object.freeze({laptops:'Laptops & notebooks',desktops:'Desktops & workstations',monitors:'Monitors & displays',networking:'Networking & security',software:'Software & licensing',accessories:'Computer accessories'});
export function productSlug(p){return [p.manufacturer,p.partNumber||p.mfgPart].join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,125)||'product';}
export function productRoute(p,{preview=true}={}){if(!/^[1-9]\d{0,11}$/.test(String(p.sku||'')))throw Error('Invalid product route');return (preview?'/shop-preview/product/':'/products/')+p.sku+'/'+productSlug(p);}
export function routeProduct(path){return String(path).match(/^\/shop-preview\/product\/([1-9]\d{0,11})(?:\/([a-z0-9-]{1,125}))?\/?$/)?.[1]||null;}
export function categoryRoute(id){return Object.hasOwn(SHOP_CATEGORIES,id)?'/shop-preview/category/'+id:'/shop-preview';}
export function routeCategory(path){const id=String(path).match(/^\/shop-preview\/category\/([a-z]+)$/)?.[1];return Object.hasOwn(SHOP_CATEGORIES,id)?id:null;}
