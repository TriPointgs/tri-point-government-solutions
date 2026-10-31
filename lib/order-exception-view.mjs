// Customer-safe saved observations only. No provider transport or mutation capabilities.
import {fault,orderId} from './order-extension-store.mjs';
const states=new Set(['not-requested','uncertain','pending','requires_action','succeeded','failed','canceled']);
const descriptions={
 'not-requested':'No refund request is recorded in this workspace. This is not a check for refunds made elsewhere.',
 uncertain:'The test refund result is uncertain. Staff must reconcile the existing attempt; do not request a replacement payment or refund.',
 pending:'The last saved provider check reported a pending test refund. Completion is not confirmed.',
 requires_action:'The last saved provider check reported that the test refund needs attention. Contact Tri-Point for review.',
 succeeded:'The last saved provider check reported a successful full test refund. This is not proof of bank credit; no live funds are involved.',
 failed:'The last saved provider check reported a failed test refund. Staff review is required; no automatic replacement refund is allowed.',
 canceled:'The last saved provider check reported a canceled test refund. This does not cancel a supplier order or confirm bank credit.',
 stale:'The saved test refund status needs a staff recheck. Do not make another payment or request a replacement refund.'
};
export function orderExceptionView(order,release,refund,{now=Date.now()}={}){
 if(order?.mode!=='test'||release?.mode!=='test'||refund?.mode!=='test'||release.orderId!==order.id||refund.orderId!==order.id||!states.has(refund.state)||!Number.isSafeInteger(refund.revision)||refund.revision<0||typeof release.releaseStopped!=='boolean'||typeof release.supplierAttempted!=='boolean'||typeof refund.attempted!=='boolean')fault('Saved exception status cannot be verified.',503);
 orderId(order.id);if(release.releaseStopped&&release.supplierAttempted)fault('Conflicting supplier hold state requires review.',409);
 const attempted=refund.attempted;if(attempted!== (refund.state!=='not-requested')||(attempted&&(!release.releaseStopped||release.supplierAttempted||refund.revision<1||!Number.isSafeInteger(refund.amountCents)||refund.amountCents<=0||refund.amountCents!==order.totalCents))||(!attempted&&(refund.revision!==0||refund.amountCents!==null||refund.checkedAt!==null)))fault('Saved refund does not match this stopped test order.',409);
 const at=refund.checkedAt===null?null:Date.parse(refund.checkedAt);
 if((refund.checkedAt!==null&&(!Number.isFinite(at)||at>now+30000))||(attempted&&refund.state!=='uncertain'&&at===null))fault('Saved refund observation time cannot be verified.',503);
 const state=attempted&&at!==null&&now-at>=900000?'stale':refund.state;
 const stopText=release.releaseStopped?'Supplier release is stopped. This alone does not close an existing checkout, cancel a supplier order or refund a payment.':'';
 return {releaseStopped:release.releaseStopped,refund:{state,attempted,amountCents:attempted?refund.amountCents:null,observedAt:refund.checkedAt,needsStaffReview:attempted&&state!=='succeeded',savedOnly:true,bankCreditVerified:false},notice:[stopText,...(attempted?[descriptions[state]]:[])].filter(Boolean).join(' ')};
}
export const refundStatusDescription=state=>descriptions[state]||descriptions.uncertain;
