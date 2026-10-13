import {escapeHtml as e} from './model.mjs';
const money=value=>value==null?'Not available':'$'+(value/100).toFixed(2);
export function mountCustomerQuotePanel(container,lead,{request,run,refresh,status,hasUnsaved}){
 const panel=document.createElement('section');panel.className='panel';
 const prior=(lead.customerQuotes||[]).slice().reverse().map(q=>`<article class="z-quote-record">
 <strong>${e(q.status)}</strong> · ${e(q.approvedAt||'')}<p>Value: ${money(q.priceCents)} · License count: ${e(q.seatEstimate)}</p>
 ${q.sentAt?`<p>Manually sent: ${e(q.sentAt)} to ${e(q.recipient||'')} · Evidence: ${e(q.manualEvidence||'')}</p>`:''}
 <details><summary>Previously approved quotation</summary><pre class="z-quote-message">${e(q.body)}</pre></details></article>`).join('');
 panel.innerHTML=`<h2>Customer quotation preparation</h2>
 <p class="fine">Staff-only. Requires saved licensing configuration, license count, distributor cost, proposed customer price and price basis above. This form does not email the buyer, place an order or create an invoice.</p>
 <form id="zc-terms">
 <fieldset class="form-section"><legend>Review customer-facing terms</legend>
 <label class="field" for="zc-term">License term and subscription period *</label><input id="zc-term" name="licenseTerm" maxlength="250" required placeholder="Example: 12-month subscription from confirmed start date">
 <label class="field" for="zc-valid">Quotation valid through *</label><input id="zc-valid" name="validUntil" type="date" required>
 <label class="field" for="zc-tax">Taxes and charges *</label><input id="zc-tax" name="taxTreatment" maxlength="180" required placeholder="Example: taxes excluded; reviewed at invoicing">
 <label class="field" for="zc-delivery">Provisioning and delivery conditions *</label><textarea id="zc-delivery" name="delivery" maxlength="800" required placeholder="Timing subject to distributor and publisher confirmation"></textarea>
 <label class="field" for="zc-exclusions">Exclusions and assumptions *</label><textarea id="zc-exclusions" name="exclusions" maxlength="1000" required placeholder="State only verified exclusions and dependencies"></textarea>
 <label class="field" for="zc-distributor-ref">Verified distributor pricing reference (internal only) *</label><input id="zc-distributor-ref" name="distributorReference" maxlength="220" required placeholder="Distributor quote number/thread, verified date and basis">
 <div class="actions"><button type="submit">Generate customer quote draft</button></div>
 <p class="fine">Do not invent subscription dates, license features, publisher terms, taxes, discounts or contract vehicles. Distributor cost and margin stay internal.</p></fieldset></form>
 <div id="zc-preview" hidden><h3>Internal quotation review</h3>
 <p class="fine" id="zc-financials"></p>
 <label class="field" for="zc-subject">Proposed email subject</label><input id="zc-subject" readonly>
 <label class="field" for="zc-body">Proposed buyer-facing quotation text</label><textarea id="zc-body" readonly rows="18"></textarea>
 <div class="actions"><button type="button" id="zc-copy" class="secondary">Copy reviewed quote text</button></div>
 <form id="zc-approve"><fieldset class="form-section"><legend>Manual internal approval</legend>
 <label class="check"><input type="checkbox" name="reviewedAllTerms" required><span>I reviewed the exact product, seats, validity, terms, cost, price and buyer-facing text.</span></label>
 <label class="check"><input type="checkbox" name="approveInternalOnly" required><span>I approve this quotation internally. I understand no email or order is sent.</span></label>
 <label class="check" id="zc-loss-line" hidden><input type="checkbox" name="acknowledgeLoss"><span>This quotation is below distributor cost; I expressly acknowledge the estimated loss.</span></label>
 <button type="submit">Approve internally (no sending)</button></fieldset></form></div>
 <div id="zc-manual-send"></div>
 <h3>Quotation approval history</h3>${prior||'<p class="fine">No approved customer quotations recorded.</p>'}`;
 container.append(panel);
 const $=selector=>panel.querySelector(selector);
 let current=null;
 const getTerms=()=>Object.fromEntries(new FormData($('#zc-terms')).entries());
 const invalidate=()=>{current=null;$('#zc-preview').hidden=true;};
 $('#zc-terms').addEventListener('input',invalidate);
 $('#zc-terms').addEventListener('change',invalidate);
 $('#zc-terms').addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;run(async()=>{const data=await request('/api/zoom-sales',{action:'draft-customer-quote',id:lead.id,revision:lead.revision,terms:getTerms()});
  current=data.draft;$('#zc-subject').value=current.subject;$('#zc-body').value=current.body;
  $('#zc-financials').textContent='Staff-only check: proposed price '+money(current.priceCents)+'; distributor cost '+money(current.costCents)+'; estimated gross profit '+money(current.profitCents)+'; estimated gross margin '+current.marginPercent+'%.';
  $('#zc-loss-line').hidden=current.profitCents>=0;$('#zc-preview').hidden=false;
  status('Customer quotation draft prepared for internal review. Nothing has been sent.');
 });});
 $('#zc-copy').addEventListener('click',async()=>{if(!current)return;try{await navigator.clipboard.writeText($('#zc-body').value);status('Quotation text copied. Nothing was sent.');}catch{$('#zc-body').focus();$('#zc-body').select();status('Clipboard unavailable; copy the highlighted text manually.');}});
 $('#zc-approve').addEventListener('submit',event=>{event.preventDefault();if(!current||!event.currentTarget.reportValidity())return;
  if(hasUnsaved()&&!confirm('Unsaved internal pricing edits are not included in this quote. Discard them and continue?'))return;
  if(!confirm('Approve this exact reviewed quotation internally? No message will be sent.'))return;
  const d=new FormData(event.currentTarget);
  run(async()=>{const data=await request('/api/zoom-sales',{action:'approve-customer-quote',id:lead.id,revision:lead.revision,terms:current.terms,fingerprint:current.fingerprint,reviewedAllTerms:d.has('reviewedAllTerms'),approveInternalOnly:d.has('approveInternalOnly'),acknowledgeLoss:d.has('acknowledgeLoss'),confirm:true});await refresh(data.lead);status('Quotation approved internally. No buyer email or order was generated.');});
 });
 const approved=(lead.customerQuotes||[]).filter(q=>q.status==='approved_internal').at(-1);
 if(approved){
  $('#zc-manual-send').innerHTML=`<form id="zc-record"><fieldset class="form-section"><legend>Log customer quotation manually sent</legend>
  <p class="fine">Approved quote date: ${e(approved.approvedAt)}. This website does not send the quotation. Record only after using your authorized Tri-Point business mailbox.</p>
  <label class="field" for="zc-recipient">Buyer business email (must match original inquiry)</label><input id="zc-recipient" type="email" name="recipient" value="${e(lead.inquiry.email)}" readonly>
  <label class="field" for="zc-evidence">Manual email thread/reference *</label><textarea id="zc-evidence" name="evidence" required maxlength="500" minlength="8"></textarea>
  <label class="check"><input name="sent" type="checkbox" required><span>I confirm that I manually sent the exact approved quotation. This action only records my statement.</span></label>
  <button type="submit">Record manually sent quotation</button></fieldset></form>`;
  $('#zc-record').addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;
   if(!confirm('Confirm that this approved quotation was sent manually to the buyer? This site will not send mail.'))return;
   const d=new FormData(event.currentTarget);
   run(async()=>{const result=await request('/api/zoom-sales',{action:'record-customer-quote-sent',id:lead.id,revision:lead.revision,quoteId:approved.id,fingerprint:approved.fingerprint,recipient:String(d.get('recipient')||''),evidence:String(d.get('evidence')||''),acknowledgedManualSend:d.has('sent'),confirm:true});await refresh(result.lead);status('Manual customer-quotation send recorded. No website email was sent.');});
  });
 }
}
