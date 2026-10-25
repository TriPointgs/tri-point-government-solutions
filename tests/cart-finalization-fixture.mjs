import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {checkoutFixture,reviewInput,NOW} from './checkout-safety-fixture.mjs';
import {env as paymentEnv} from './payment-first-fixture.mjs';
import {createOrderFinalization} from '../lib/checkout-finalization.mjs';
import {createFinalOrderStore,memoryFinalOrderStore,finalizationOrderId,createFinalizationPolicyReader} from '../lib/final-order-store.mjs';
import {createStripeTaxQuote,isVerifiedTaxQuote,validateTaxCalculation,taxCalculationRequest} from '../lib/stripe-tax-quote.mjs';
import {checkoutSessionPlan} from '../lib/stripe-checkout-session.mjs';
const ENV={...paymentEnv,TP_TEST_ORDER_FINALIZATION_ENABLED:'true',TP_STRIPE_TEST_TAX_ENABLED:'true',TP_STRIPE_TAX_SETUP_APPROVED:'true'};
export async function finalizationFixture({env=ENV,clock=()=>NOW,taxHook,store=memoryFinalOrderStore()}={}){
 const t=await checkoutFixture({clock}),ps=await t.products.read();ps.state.items[0].commerce={advertisingReview:'no-map',mapEvidence:'Synthetic-reviewed'};ps.state.revision++;await t.products.save(ps.state,ps.etag);
 const settings=await t.settings.settings();settings.state.policy.settingsConfirmed=true;settings.state.cartDefaults={confirmed:true,paymentFeeBps:0,paymentFixedCents:0,adminFeeBps:0,reserveBps:0,handlingCents:0,otherCostCents:0,extraPaymentBaseCents:0};settings.state.revision++;await t.settings.saveSettings(settings.state,settings.etag);
 const input=reviewInput();await t.service.prepareCheckout(t.owner,input);let p={schemaVersion:1,mode:'test',revision:1,expiresAt:new Date(NOW+86400000).toISOString(),terms:{approved:true,version:'synthetic-purchase-v1',contentDigest:'a'.repeat(64),approvedAt:new Date(NOW-1000).toISOString()},tax:{reviewed:true,reviewEvidence:'b'.repeat(64),products:[{sku:'12345',manufacturerPart:'TEST-12345',code:'txcd_99999999'}]},shipping:{approved:true,strategy:'merchant-fixed-from-td-zip-quote',reviewEvidence:'c'.repeat(64)}};
 const counts={account:0,tax:0};let taxError=false,taxChange=null;
 const client={accounts:{async retrieve(){counts.account++;return {id:env.TP_STRIPE_TEST_ACCOUNT_ID};}},tax:{calculations:{async create(r){counts.tax++;if(taxHook)await taxHook(t);if(taxError)throw Error('PRIVATE PROVIDER MESSAGE');const subtotal=r.line_items.reduce((s,x)=>s+x.amount,0);return {id:'taxcalc_SYNTHETICFINAL123',object:'tax.calculation',currency:'usd',amount_total:subtotal+r.shipping_cost.amount+1500,tax_amount_exclusive:1500,tax_amount_inclusive:0,expires_at:Math.floor((clock()+1800000)/1000),customer_details:r.customer_details,...taxChange};}}}};
 const tax=createStripeTaxQuote({env,stripeClient:client,clock}),policies={read:async()=>structuredClone(p)},service=createOrderFinalization({env,shop:t.service,policies,tax,store,clock}),request={reviewId:input.requestId,termsVersion:p.terms.version,termsAccepted:true};
 return {...t,env,policies,store,tax,counts,request,finalizer:service,setPolicy(v){p=v;},policy:()=>p,setTaxError(){taxError=true;},setTaxChange(v){taxChange=v;}};
}
