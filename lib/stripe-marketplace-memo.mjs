import {HttpError} from './model.mjs';

export const STRIPE_MARKETPLACE_MEMO_VERSION=1;
export const STRIPE_MARKETPLACE_LABEL='TPGS Marketplace';

// A version belongs to the saved creation attempt, never to a browser request.
// Older attempts omit it so retries retain their original Stripe parameters.
export function applyMarketplaceStripeMemo(params,{id,purpose,version}={}){
 if(version===undefined)return params;
 if(version!==STRIPE_MARKETPLACE_MEMO_VERSION||!['order','sandbox'].includes(purpose)||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw new HttpError(409,'Stripe payment memo version requires review. Retry only the original saved request.');
 params.metadata={...params.metadata,tp_business_unit:STRIPE_MARKETPLACE_LABEL};
 params.payment_intent_data={...params.payment_intent_data,metadata:{...params.payment_intent_data?.metadata,tp_business_unit:STRIPE_MARKETPLACE_LABEL},description:purpose==='sandbox'?`${STRIPE_MARKETPLACE_LABEL} | SANDBOX TEST ${id} | No goods or services`:`${STRIPE_MARKETPLACE_LABEL} | TEST order ${id}`};
 return params;
}
