// Owner-selected release policy. This is not a customer authentication provider.
export const MARKETPLACE_BUYER_ACCESS='account';
export function marketplaceBuyerPolicy(){return {
 buyerAccess:MARKETPLACE_BUYER_ACCESS,ownerSelected:true,accountRequiredBeforeCheckout:true,
 guestCheckoutAllowed:false,customerAccountsImplemented:false,publicCheckoutEnabled:false
};}