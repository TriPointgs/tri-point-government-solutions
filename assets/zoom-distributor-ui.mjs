import {escapeHtml as e} from './model.mjs';
export function mountDistributorPanel(container,lead,{request,run,refresh,status,hasUnsaved}){
 const panel=document.createElement('section');panel.className='panel';
 const rows=(lead.distributorRequests||[]).map(r=>`<article class="z-distributor-record"><strong>${e(r.sentAt)}</strong><p>To: ${e(r.recipient)} · Evidence: ${e(r.reference)}</p><p class="fine">Organization shared: ${r.disclosure?.organization?'Yes':'No'} · RFQ shared: ${r.disclosure?.rfq?'Yes':'No'} · Provider shared: ${r.disclosure?.provider?'Yes':'No'}</p><details><summary>Stored manually sent email copy</summary><pre class="z-distributor-copy">${e(r.body)}</pre></details></article>`).join('');
 panel.innerHTML=`<h2>Carahsoft pricing request preparation</h2><p class="fine">Staff-only draft and manual-send log. Preparing or copying a draft never sends an email, places an order, registers a deal or approves a price.</p>
 <form id="zd-choices"><fieldset class="form-section"><legend>Optional information to disclose</legend>
 <label class="check"><input name="organization" type="checkbox"><span>Include end-user organization name</span></label>
 <label class="check"><input name="rfq" type="checkbox"><span>Include RFQ/solicitation reference</span></label>
 <label class="check"><input name="provider" type="checkbox"><span>Include current provider/product</span></label>
 <p class="fine">Customer contacts, notes, internal costs, margins, and private document URLs are never included.</p></fieldset>
 <button type="submit">Prepare distributor pricing draft</button></form>
 <div id="zd-preview" hidden><label class="field" for="zd-subject">Draft subject</label><input id="zd-subject" readonly>
 <label class="field" for="zd-body">Draft body — review before copying</label><textarea id="zd-body" readonly rows="16"></textarea>
 <div class="actions"><button type="button" id="zd-copy-subject" class="secondary">Copy subject</button><button type="button" id="zd-copy-body" class="secondary">Copy message</button></div>
 <p class="fine">Email must be sent manually through an authorized Tri-Point mailbox to a verified distributor contact.</p>
 <form id="zd-record"><fieldset class="form-section"><legend>Record a manually sent message</legend>
 <label class="field" for="zd-recipient">Distributor email address *</label><input id="zd-recipient" name="recipient" type="email" required maxlength="254">
 <label class="field" for="zd-reference">Sending evidence/reference *</label><textarea id="zd-reference" name="reference" minlength="8" maxlength="500" required placeholder="Sent using business email; cite the message thread or reference"></textarea>
 <label class="check"><input type="checkbox" name="sent" required><span>I confirm I manually sent the reviewed text. This only records that activity; this website does not send the request.</span></label>
 <button type="submit">Record manual send</button></fieldset></form></div>
 <h3>Distributor request history</h3>${rows||'<p class="fine">No requests recorded yet.</p>'}`;
 container.append(panel);
 const $=selector=>panel.querySelector(selector);
 let draft=null;
 $('#zd-choices').addEventListener('change',()=>{draft=null;$('#zd-preview').hidden=true;status('Disclosure selections changed. Prepare and review a new draft.');});
 $('#zd-choices').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const d=new FormData(event.currentTarget);const disclosure={organization:d.has('organization'),rfq:d.has('rfq'),provider:d.has('provider')};const result=await request('/api/zoom-sales',{action:'draft-distributor',id:lead.id,revision:lead.revision,disclosure});draft=result.draft;$('#zd-subject').value=draft.subject;$('#zd-body').value=draft.body;$('#zd-preview').hidden=false;status('Draft ready. No email has been sent.');});});
 for(const [button,field] of [['#zd-copy-subject','#zd-subject'],['#zd-copy-body','#zd-body']]){
  $(button).addEventListener('click',async()=>{try{await navigator.clipboard.writeText($(field).value);status('Copied for manual review. No email sent.');}catch{$(field).focus();$(field).select();status('Clipboard blocked. Copy the selected text manually.');}});
 }
 $('#zd-record').addEventListener('submit',event=>{event.preventDefault();if(!draft||!event.currentTarget.reportValidity())return;
  if(hasUnsaved()&&!confirm('Saving a distributor activity record will discard unsaved lead edits. Continue?'))return;
  if(!confirm('Confirm you personally sent the reviewed request outside this website. This action does not send an email.'))return;
  const d=new FormData(event.currentTarget);
  run(async()=>{const result=await request('/api/zoom-sales',{action:'record-distributor',id:lead.id,revision:lead.revision,disclosure:draft.disclosure,digest:draft.digest,recipient:String(d.get('recipient')||''),reference:String(d.get('reference')||''),acknowledgedManualSend:d.has('sent'),confirm:true});await refresh(result.lead);status('Manual distributor request recorded. No email was sent by the site.');});
 });
}
