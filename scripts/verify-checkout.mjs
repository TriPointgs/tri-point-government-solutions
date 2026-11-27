// Repeat the COMPLETE suite with independent Node test processes, deterministic
// random seeds and different concurrency. These are not independent AI agents.
import {execFileSync} from 'node:child_process';
import {readdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const logs=mkdtempSync(join(tmpdir(),'tripoint-checkout-acceptance-'));
const files=readdirSync('tests').filter(x=>x.endsWith('.test.mjs')).sort().map(x=>'tests/'+x);
const rounds=[{label:'serial',args:['--test-concurrency=1']},{label:'random-20261025',args:['--test-concurrency=4','--test-randomize','--test-random-seed=20261025']},{label:'random-7319',args:['--test-concurrency=8','--test-randomize','--test-random-seed=7319']}];
const report={node:process.version,independentAIAgents:false,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),diagnostics:'disabled for repeated local tests',rounds:[]};
for(const round of rounds){const started=Date.now();let output='';try{output=execFileSync(process.execPath,['--test',...round.args,...files],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000,env:{...process.env,TP_BLOB_STORAGE_CANARY:'off'}});}catch(e){output=String(e.stdout||'')+String(e.stderr||'');writeFileSync(join(logs,round.label+'.log'),output);console.error('FAILED '+round.label+'; log '+join(logs,round.label+'.log'));throw e;}
 writeFileSync(join(logs,round.label+'.log'),output);const count=name=>Number(output.match(new RegExp('(?:ℹ |# )'+name+' (\\d+)'))?.[1]||0),result={label:round.label,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),milliseconds:Date.now()-started};if(!result.tests||result.failed||result.passed+result.skipped!==result.tests)throw Error('Unexpected test summary for '+round.label);report.rounds.push(result);console.log(JSON.stringify(result));}
writeFileSync(join(logs,'report.json'),JSON.stringify(report,null,2));console.log('CHECKOUT_ACCEPTANCE_REPORT '+join(logs,'report.json'));
