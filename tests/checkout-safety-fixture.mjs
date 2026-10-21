import {randomUUID} from 'node:crypto';
import {createShopService} from '../lib/shop-cart-service.mjs';
import {memoryProductStore} from '../lib/product-controls-store.mjs';
import {memoryCartStore} from '../lib/shop-cart-store.mjs';
import {memorySmartStore} from '../lib/smart-pricing-store.mjs';
import {memoryMarketPriceStore} from '../lib/market-price-store.mjs';
import {memoryCheckoutStore,CHECKOUT_NOTICE} from '../lib/checkout-draft.mjs';
export const NOW=Date.parse('2026-10-21T14:00:00.000Z');
export function reviewInput(revision=1){return {requestId:randomUUID(),revision,contact:{name:'Synthetic Buyer',email:'buyer@example.invalid',organization:'Synthetic QA',phone:''},address:{line1:'123 Test Street',line2:'',city:'Leesburg',state:'FL',postalCode:'34748',country:'US'},consent:true,noticeVersion:CHECKOUT_NOTICE};}
export async function checkoutFixture({clock=()=>NOW,store,lookupHook,cartReadHook}={}){
 const products=memoryProductStore(),baseCart=memoryCartStore(),settings=memorySmartStore(),checkoutStore=store||memoryCheckoutStore(),owner=randomUUID(),calls={price:0,freight:0,cartSave:0};
 const p={id:'TD-12345',sku:'12345',mfgPart:'TEST-12345',manufacturer:'EXAMPLE',description:'Synthetic notebook',category:'laptops',categoryConfirmed:true,condition:'new',decision:'draft',review:{resaleConfirmed:true,contentConfirmed:true},lastCheckFailure:null};
 const s=await products.read();s.state.items=[p];s.state.revision=1;await products.save(s.state,s.etag);
 const cartStore={read:async id=>{if(cartReadHook)await cartReadHook();return baseCart.read(id);},save:async(...args)=>{calls.cartSave++;return baseCart.save(...args);}};
 const td={lookup:async()=>{calls.price++;if(lookupHook)await lookupHook();return [{source:'tdsynnex-priceavailability',environment:'production',checkedAt:new Date(clock()).toISOString(),sku:'12345',mfgPart:'TEST-12345',status:'Active',priceType:'REGULAR',identityMatched:true,currency:'USD',costCents:10000,stockQuantity:100,endUserRequired:false,parcelShippable:true,issues:[]}];},freight:async q=>{calls.freight++;return {environment:'production',checkedAt:new Date(clock()).toISOString(),zip:q.zip,currency:'USD',amountCents:1250,extraChargesComplete:true,shipmentCount:1};}};
 const service=createShopService({env:{VERCEL_ENV:'preview'},products,cartStore,checkoutStore,td,settings,marketStore:memoryMarketPriceStore(),clock});
 await service.change(owner,{action:'add',sku:'12345',quantity:2,revision:0});return {service,products,baseCart,cartStore,checkoutStore,settings,owner,calls,td,clock};
}
