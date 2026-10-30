import {trackingURL} from './td-order-status.mjs';
// One customer-safe view over the read-only handoff and separately scoped purchase pilot.
import {createSupplierHandoff} from './supplier-handoff.mjs';
import {createSupplierDispatch} from './supplier-dispatch.mjs';
export function buyerFulfillmentView(handoff,dispatch,{now=Date.now()}={}){
 const base={state:'supplier-not-confirmed',observedAt:null,tracking:[],deliveryConfirmed:false,supplierTestAttempted:false,realSupplierOrderSubmitted:false};
 if(dispatch?.releaseStopped===true)return {...base,state:'supplier-release-stopped',observedAt:dispatch.stoppedAt||null};
 if(dispatch?.attempted===true){
  // The dispatch reference uses a different supplier scope. Never attach unrelated handoff tracking.
  const at=Date.parse(dispatch.checkedAt),fresh=Number.isFinite(at)&&at<=now+30000&&now-at<900000;
  return {...base,supplierTestAttempted:true,state:!fresh?'supplier-test-update-stale':dispatch.supplierAccepted===true?'supplier-test-acknowledged':dispatch.state==='rejected'?'supplier-test-rejected':'supplier-test-review-required',observedAt:fresh?dispatch.checkedAt:null};
 }
 const at=Date.parse(handoff?.observedAt),fresh=Number.isFinite(at)&&at<=now+30000&&now-at<900000;
 if(handoff&&['supplier-record-matched','supplier-reported-backorder'].includes(handoff.state)&&fresh&&Array.isArray(handoff.tracking))return {...base,state:handoff.state,observedAt:handoff.observedAt,tracking:handoff.tracking.slice(0,100).map(x=>({carrier:typeof x.carrier==='string'?x.carrier.slice(0,80):'',number:x.number,url:trackingURL(x.carrier,x.number)})).filter(x=>x.url)};
 if(handoff?.state==='supplier-update-stale'||(handoff?.observedAt&&!fresh))return {...base,state:'supplier-update-stale'};
 return base;
}
export function createBuyerFulfillment({env=process.env,handoff=createSupplierHandoff({env}),dispatch=createSupplierDispatch({env}),clock=()=>Date.now()}={}){
 return async id=>{const d=await dispatch.read(id);const h=d.attempted?null:await handoff.buyerView(id);return buyerFulfillmentView(h,d,{now:clock()});};
}
