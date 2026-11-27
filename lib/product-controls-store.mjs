// Private, bounded pilot selection. This is NOT the 1.2-million-row supplier index.
import {get,head,put,BlobNotFoundError} from '@vercel/blob';
import {HttpError} from './model.mjs';
import {newProductWorkspace,PRODUCT_LIMIT} from './product-controls-model.mjs';
const PATH='preview/product-selection/workspace-v1.json';
export function createProductWorkspaceStore({env=process.env,blob={get,head,put}}={}) {
  const guard=()=>{if(env.VERCEL_ENV==='production')throw new HttpError(503,'Product selection is still a preview release.');};
  return {
    async read(){
      guard();let before;
      try{before=await blob.head(PATH);}catch(e){if(e instanceof BlobNotFoundError)return {state:newProductWorkspace(),etag:null};throw e;}
      const r=await blob.get(PATH,{access:'private',useCache:false});if(!r)throw new HttpError(409,'Selection changed while loading. Refresh.');
      const raw=await new Response(r.stream).text();if(Buffer.byteLength(raw)>4000000)throw new HttpError(503,'Pilot selection exceeded its storage bound.');
      const state=JSON.parse(raw),after=await blob.head(PATH);
      if(!before.etag||before.etag!==after.etag)throw new HttpError(409,'Selection changed while loading. Refresh.');
      if(state.schemaVersion!==1||state.mode!=='preview'||!Array.isArray(state.items)||state.items.length>PRODUCT_LIMIT)throw new HttpError(503,'Unexpected product workspace.');
      return {state,etag:after.etag};
    },
    async save(state,etag){
      guard();if(state.mode!=='preview'||state.items.length>PRODUCT_LIMIT)throw new HttpError(400,'Invalid pilot workspace.');
      const raw=JSON.stringify(state);if(Buffer.byteLength(raw)>4000000)throw new HttpError(400,'Product selection is too large.');
      try{await blob.put(PATH,raw,{access:'private',addRandomSuffix:false,contentType:'application/json',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}
      catch(e){if(/already.?exists|precondition/i.test((e.name||'')+' '+e.message))throw new HttpError(409,'Another session changed this selection. Refresh before retrying.');throw e;}
    }
  };
}
export function memoryProductStore(){let state=newProductWorkspace();return {async read(){return {state:structuredClone(state),etag:state.revision?String(state.revision):null};},async save(next,etag){if(etag!==(state.revision?String(state.revision):null))throw new HttpError(409,'Concurrent selection update.');state=structuredClone(next);}};}
