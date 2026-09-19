// Browser-safe import adapter. API validation remains authoritative for every save.
const TRADES=['janitorial','landscaping','hvac','electrical','plumbing','construction','roofing','painting','flooring','pressure-washing','pest-control','towing','fleet','printing','apparel','promotional','moving','transportation','maintenance','fencing','concrete','signage','technology','supplies','other'];
const REQUIREMENTS=['trade','state','county','crewSize','maxProject','insurance','workersComp','licensed','sam','role','availability','experience','equipment','travel','compliance'];
const INTERNAL=['source','solicitationUrl','procurementPortal','pricing','margins','bidStrategy','agency','solicitationNumber','deadline','timezone'];
const REVIEW=['fullScope','bidNoBid','compliance','pricingProfitability','suppliersSubcontractors','competitorsIncumbents','risksQuestionsDeadlines','awardStrategy'];
const DISCLOSURE=['summary','scope','location','schedule','requirements','responseDeadline'];
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function record(value,label){if(value==null)return {};if(typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be a JSON object.`);return value;}
function string(value,label,max=6000){if(value==null)return '';if(typeof value!=='string')throw Error(`${label} must be text.`);const result=value.trim();if(result.length>max)throw Error(`${label} exceeds ${max} characters. Split or summarize that section before importing; no content was truncated.`);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))throw Error(`${label} contains unsupported control characters.`);return result;}
function textFields(source,keys,label){return Object.fromEntries(keys.map(key=>[key,string(source[key],`${label}.${key}`)]));}
function privateText(label,...parts){const present=parts.filter(p=>p[1]!=null&&p[1]!==''&&!(Array.isArray(p[1])&&!p[1].length)&&!(typeof p[1]==='object'&&!Object.keys(p[1]).length));return string(present.map(([heading,value])=>`${heading}: ${typeof value==='string'?value:JSON.stringify(value,null,2)}`).join('\n\n'),label);}
function title(value,fallback,warnings){let result=string(value,'Opportunity title',180);if(!result&&fallback){result=string(fallback,'Requisition ID',180);warnings.push('The solicitation title is empty. The requisition ID is used as a temporary title; replace it with a meaningful title before saving.');}if(!result)throw Error('Add a title at title or solicitation.title, or supply requisition_id as a temporary title.');if(/[\r\n]/.test(result))throw Error('Opportunity title must be a single line.');return result;}
function pick(source,keys){return Object.fromEntries(keys.filter(key=>own(source,key)).map(key=>[key,source[key]]));}
function canonicalRequirements(source){
 const r=pick(source,REQUIREMENTS),out={};
 for(const key of ['trade','role']){const value=r[key]??(key==='role'?'subcontractor':'');const allowed=key==='trade'?['',...TRADES]:['prime','subcontractor'];if(!allowed.includes(value))throw Error(`requirements.${key} must be ${key==='trade'?'a supported service ID':'prime or subcontractor'}.`);out[key]=value;}
 out.state=string(r.state,'requirements.state',2).toUpperCase();if(out.state&&!/^[A-Z]{2}$/.test(out.state))throw Error('requirements.state must be a two-letter state code.');
 out.county=string(r.county,'requirements.county',100);
 for(const [key,max] of [['crewSize',100000],['maxProject',100000000]]){const value=r[key];if(value==null||value===''){out[key]=null;continue;}if(!['string','number'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error(`requirements.${key} must be a whole number from 0 to ${max}.`);out[key]=Number(value);}
 for(const key of ['insurance','workersComp','licensed','sam']){if(r[key]!=null&&typeof r[key]!=='boolean')throw Error(`requirements.${key} must be true or false, without quotation marks.`);out[key]=r[key]??false;}
 for(const key of ['availability','experience','equipment','travel','compliance'])out[key]=string(r[key],`requirements.${key}`);
 return out;
}

export function parseOpportunityImport(raw){
 let input=raw;
 if(typeof raw==='string'){
  const trimmed=raw.trim();const fence=trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  try{input=JSON.parse(fence?fence[1]:trimmed);}catch{throw Error('The import is not valid JSON. Paste one complete opportunity or requisition object, optionally inside a JSON code fence.');}
 }
 input=record(input,'Import');
 if(own(input,'opportunity'))input=record(input.opportunity,'opportunity');
 const warnings=[];
 const nested=own(input,'solicitation')||own(input,'requisition_id');
 if(!nested){
  const r=record(input.requirements,'requirements');
  const opportunity={title:title(input.title,null,warnings),requirements:canonicalRequirements(r),internal:textFields(record(input.internal,'internal'),INTERNAL,'internal'),review:textFields(record(input.review,'review'),REVIEW,'review'),disclosure:textFields(record(input.disclosure,'disclosure'),DISCLOSURE,'disclosure')};
  if(['id','contacts','pendingUpdates','history','outreach','selected_for_outreach','matched_contractors','approvedAt','draft'].some(key=>own(input,key)))warnings.push('Imported identifiers, contractor selections, outreach messages, approvals and history are ignored. Select contractors and approve fresh drafts manually.');
  return {opportunity,warnings};
 }
 const s=record(input.solicitation,'solicitation'),source=record(input.source,'source'),scope=record(input.scope,'scope'),financials=record(input.financials,'financials'),compliance=record(input.compliance,'compliance'),submission=record(input.submission,'submission'),review=record(input.tri_point_review,'tri_point_review'),matching=record(input.subcontractor_matching,'subcontractor_matching'),internal=record(input.internal,'internal'),place=record(s.place_of_performance,'solicitation.place_of_performance');
 const categories=matching.trade_categories==null?[]:matching.trade_categories;
 if(!Array.isArray(categories)||categories.some(x=>typeof x!=='string'))throw Error('subcontractor_matching.trade_categories must be an array of service names or IDs.');
 const exact=categories.filter(x=>TRADES.includes(x));
 const trade=categories.length===1&&exact.length===1?exact[0]:'';
 if(categories.length&&!trade)warnings.push('Trade categories require manual review. Original categories are retained privately; select one supported primary trade without guessing.');
 const state=string(place.state,'Place of performance state',80).toUpperCase();
 if(state&&!/^[A-Z]{2}$/.test(state))warnings.push('The place-of-performance state is not a two-letter code. It is retained in the private scope; choose the matching state manually.');
 warnings.push('No opportunity information is selected for disclosure. Review the complete solicitation and explicitly choose contractor-safe details before drafting outreach.');
 warnings.push('Solicitation compliance is retained for review. Prime registration and insurance requirements are not automatically imposed on subcontractors; confirm applicability before setting matching requirements.');
 if(own(input,'outreach')||own(matching,'matched_contractors')||own(matching,'selected_for_outreach')||own(input,'contacts')||own(input,'pendingUpdates'))warnings.push('Imported outreach content, contractor matches, selections and approvals are ignored. Contact records below, if present, are retained only as private solicitation contacts.');
 const schedule=pick(s,['posted_date','questions_due','bid_due','anticipated_award_date','contract_start_date','contract_end_date','option_years']);
 const matchingNotes=pick(matching,['needed','trade_categories','service_area','minimum_requirements']);
 const opportunity={
  title:title(s.title,input.requisition_id,warnings),
  requirements:{trade,state:/^[A-Z]{2}$/.test(state)?state:'',county:'',crewSize:null,maxProject:null,insurance:false,workersComp:false,licensed:false,sam:false,role:'subcontractor',availability:privateText('requirements.availability',['Contract start',s.contract_start_date],['Contract end',s.contract_end_date],['Working hours',scope.working_hours]),experience:privateText('requirements.experience',['Experience requirements',compliance.experience_requirements]),equipment:'',travel:'',compliance:privateText('requirements.compliance',['Minimum subcontractor requirements',matching.minimum_requirements])},
  internal:{source:privateText('internal.source',['Source',source]),solicitationUrl:string(source.source_url,'source.source_url'),procurementPortal:string(submission.submission_portal??submission.portal,'submission.submission_portal'),agency:string(s.agency,'solicitation.agency'),solicitationNumber:string(s.solicitation_number,'solicitation.solicitation_number'),deadline:string(s.bid_due,'solicitation.bid_due'),timezone:'',pricing:privateText('internal.pricing',['Financials',financials]),margins:privateText('internal.margins',['Estimated gross profit',review.estimated_gross_profit],['Estimated margin percent',review.estimated_margin_percent]),bidStrategy:privateText('internal.bidStrategy',['Internal management',internal])},
  review:{fullScope:privateText('review.fullScope',['Requisition ID',input.requisition_id],['Solicitation',s],['Scope',scope],['Documents',input.documents],['Solicitation contacts',input.contacts]),bidNoBid:privateText('review.bidNoBid',['Bid status',review.bid_status],['Bid / no-bid reason',review.bid_no_bid_reason],['Fit notes',review.fit_notes]),compliance:privateText('review.compliance',['Solicitation compliance (applicability requires review)',compliance],['Submission',submission]),pricingProfitability:privateText('review.pricingProfitability',['Pricing notes',review.pricing_notes],['Estimated cost',review.estimated_cost],['Target bid price',review.target_bid_price],['Estimated gross profit',review.estimated_gross_profit],['Estimated margin percent',review.estimated_margin_percent]),suppliersSubcontractors:privateText('review.suppliersSubcontractors',['Subcontractor matching requirements',matchingNotes],['Suppliers',input.suppliers],['Subcontractors',input.subcontractors]),competitorsIncumbents:privateText('review.competitorsIncumbents',['Competitors',input.competitors],['Incumbents',input.incumbents]),risksQuestionsDeadlines:privateText('review.risksQuestionsDeadlines',['Major risks',review.major_risks],['Questions to ask',review.questions_to_ask],['Dates and schedule',schedule]),awardStrategy:privateText('review.awardStrategy',['Award strategy',review.award_strategy])},
  disclosure:Object.fromEntries(DISCLOSURE.map(key=>[key,'']))
 };
 return {opportunity,warnings};
}

