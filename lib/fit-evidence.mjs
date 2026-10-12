// Preliminary evidence only: no percentage scores, eligibility decisions or inferred distances.
const normalized = value => String(value || '').trim().toLowerCase().replace(/\s+county$/, '');
const stateCode = value => typeof value === 'string' && /^[a-z]{2}$/i.test(value.trim()) ? value.trim().toUpperCase() : '';
const values = value => Array.isArray(value) ? value : [];
const missing = value => value == null || value === '' || value === 'unknown';
const numeric = (value, minimum) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 ? 'Needs confirmation' : value >= minimum ? 'Declared match' : 'Needs review';
const stale = (profile, fields) => fields.some(field => profile.needsReverification?.[field] === true);

export function geographyEvidence(profile, requirement) {
 const state = stateCode(requirement.state), county = normalized(requirement.county), currentState = stateCode(profile.state);
 if (!state && !county) return 'Not specified';
 if (state && currentState && state !== currentState) return 'Needs review';
 // County names are not globally unique. Never infer their state or a travel distance.
 if (!state || !currentState) return 'Needs confirmation';
 if (stale(profile, county ? ['state', 'serviceCounties', 'statewide'] : ['state'])) return 'Needs confirmation';
 if (!county) return 'Declared match';
 if (profile.statewide === true) return 'Declared match';
 const counties = values(profile.serviceCounties).filter(value => typeof value === 'string' && value.trim());
 if (!counties.length) return 'Needs confirmation';
 return counties.some(value => normalized(value) === county) ? 'Declared match' : 'Needs review';
}

export function evaluateOpportunityFit(profile, opportunity) {
 const r = opportunity.requirements || {}, rows = [];
 function add(key, label, requirement, current, result, fields = []) {
  if (result !== 'Not specified' && result !== 'Needs review' && stale(profile, fields)) result = 'Needs confirmation';
  rows.push({key, label, requirement:requirement ?? null, current:current ?? null, result});
 }
 const trades = [profile.trade, ...values(profile.additionalServices)].filter(Boolean);
 add('trade','Trade',r.trade,trades,!r.trade?'Not specified':!trades.length?'Needs confirmation':trades.includes(r.trade)?'Declared match':'Needs review',['trade','additionalServices']);
 add('geography','Geography',{state:r.state||'',county:r.county||''},{state:profile.state??null,counties:values(profile.serviceCounties),statewide:profile.statewide===true,travelRadius:profile.travelRadius??null},geographyEvidence(profile,r));
 let staffing = r.crewSize == null ? 'Not specified' : numeric(profile.crewSize, r.crewSize);
 // Enough employees overall does not establish an available crew for this assignment.
 if (staffing === 'Declared match') staffing = 'Needs confirmation';
 add('crewSize','Total company crew — confirm project-available staff',r.crewSize,profile.crewSize,staffing,['crewSize']);
 add('maxProject','Declared project-size capacity',r.maxProject,profile.maxProject,r.maxProject==null?'Not specified':numeric(profile.maxProject,r.maxProject),['maxProject']);
 for (const [key,label,field] of [['insurance','General liability insurance','insured'],['workersComp','Workers compensation','workersComp'],['licensed','Licensing','licensed']]) {
  add(key,label,r[key]===true,profile[field],!r[key]?'Not specified':missing(profile[field])?'Needs confirmation':profile[field]==='yes'?'Declared match':'Needs review',[field]);
 }
 const samResult = !r.sam ? 'Not specified' : r.role !== 'prime' ? 'Needs confirmation' : missing(profile.sam) ? 'Needs confirmation' : profile.sam === 'yes' ? 'Declared match' : 'Needs review';
 add('sam',r.role==='prime'?'Prime SAM registration':'SAM applicability — verify subcontractor requirement',r.sam===true,profile.sam,samResult,['sam']);
 for (const [key,label,current,fields] of [['availability','Project availability',profile.availability,['availability']],['experience','Experience',values(profile.experience),['experience']],['equipment','Project equipment',profile.equipment,['equipment']],['travel','Travel',profile.travelRadius,['travelRadius','serviceCounties','statewide']],['compliance','Other compliance',profile.certifications,['certifications']]]) {
  add(key,label,r[key]||'',current,r[key]?'Needs confirmation':'Not specified',fields);
 }
 const required = rows.filter(row=>row.result!=='Not specified');
 return {
  rows,
  score:rows.filter(row=>row.result==='Declared match').length,
  decision:!required.length?'Requirements not specified':required.some(row=>row.result!=='Declared match')?'Needs review':'Potential fit',
  notice:'Preliminary self-reported fit only. Changes flagged for re-verification are not confirmed. Total company staffing is not staff available for this project. County matching needs a state; no ZIP distance is inferred. Check the complete solicitation and prime/subcontractor obligations before selection.'
 };
}
