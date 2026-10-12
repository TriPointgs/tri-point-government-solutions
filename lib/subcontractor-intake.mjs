import {HttpError,validateApplication} from './model.mjs';
export const SUBCONTRACTOR_CONSENT_VERSION='subcontractor-2026-10-11';
// Only new public submissions pass here. Existing applications are not revalidated or rewritten.
export function validateSubcontractorApplication(input){
 if(!input||input.consentVersion!==SUBCONTRACTOR_CONSENT_VERSION)throw new HttpError(400,'The subcontractor application terms have changed. Refresh this page, review the terms, and submit again.');
 const profile=validateApplication(input);
 if(profile.interests.some(value=>value!=='subcontracting'))throw new HttpError(400,'This application is for subcontracting with Tri-Point only. Refresh the page and review the current application.');
 return {...profile,interests:['subcontracting'],alertsOptIn:false,networkRole:'subcontractor',consentVersion:SUBCONTRACTOR_CONSENT_VERSION};
}
