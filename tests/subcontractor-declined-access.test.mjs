import test from 'node:test';
import assert from 'node:assert/strict';
import {findUniqueProfile} from '../lib/contractor-auth.mjs';
import {opportunityStore} from '../lib/opportunity-storage.mjs';
test('declined subcontractor cannot request a profile-claim email, without affecting approved profile',async()=>{
 const old=opportunityStore.pageProfiles;
 try{
  opportunityStore.pageProfiles=async()=>({records:[
   {email:'declined@example.org',status:'declined',consent:true},
   {email:'approved@example.org',status:'approved',consent:true}
  ],hasMore:false});
  assert.equal(await findUniqueProfile('declined@example.org'),null);
  const approved=await findUniqueProfile('approved@example.org');
  assert.equal(approved.status,'approved');
 }finally{opportunityStore.pageProfiles=old;}
});
