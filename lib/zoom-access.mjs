import {requireAdmin} from './security.mjs';
import {HttpError} from './model.mjs';
import {zoomPublicEnabled} from './zoom-release.mjs';
export function quoteAccess(req,publicEnabled=zoomPublicEnabled()){
 const query=new URL(req.url,'https://tripointgs.com').searchParams;
 const review=!publicEnabled||query.get('review')==='1';
 if(review){try{requireAdmin(req);}catch(error){if(error.status===401)throw new HttpError(404,'This page is not available.');throw error;}}
 return {review,publicEnabled};
}
