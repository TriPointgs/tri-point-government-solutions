// This is a release control, not a UI preference. Do not infer approval from reseller status.
export const ZOOM_CONTENT_VERSION='zoom-solutions-2026-10-12-v1';
export const ZOOM_APPROVAL=Object.freeze({
 contentVersion:ZOOM_CONTENT_VERSION,
 triPointApproved:false,
 zoomMarketingApproved:false,
 approvalReference:'',
 approvedAt:''
});
export function zoomPublicEnabled(env=process.env,approval=ZOOM_APPROVAL){
 return env.VERCEL_ENV==='production' && env.TP_ZOOM_PUBLIC_ENABLED==='true' &&
  approval.contentVersion===ZOOM_CONTENT_VERSION && approval.triPointApproved===true &&
  approval.zoomMarketingApproved===true && typeof approval.approvalReference==='string' &&
  approval.approvalReference.trim().length>0 && /^\d{4}-\d{2}-\d{2}$/.test(approval.approvedAt);
}
