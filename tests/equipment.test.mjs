import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentPage} from '../scripts/equipment-page.mjs';
import {transformPage} from '../scripts/public-boundary.mjs';
import fs from 'node:fs';

test('equipment page provides non-transactional sourcing categories',()=>{
  const html=equipmentPage();
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  for(const c of ['Computers and workstations','Networking and wireless','Monitors and peripherals','Printers and imaging','Servers and storage','Power and accessories']){
    assert.ok(html.includes(c),c);
  }
  assert.match(html,/Request for quotation/);
  assert.match(html,/No information is transmitted or stored/);
  assert.doesNotMatch(html,/sk-[A-Za-z0-9]+|client_secret|access_token|unitCost|real-time stock/i);
});
test('equipment navigation is available and private opportunity forms remain intact',()=>{
 const nav='<div class="nav-links"><a href="/contractors">Contractor network</a></div>';
 const html=transformPage(nav+'<input name="source">','/contractors/admin/opportunities');
 assert.match(html,/href="\/equipment"/);
 assert.match(html,/name="source"/);
});
test('equipment quote script never sends a request or exposes an API key',()=>{
 const js=fs.readFileSync(new URL('../assets/equipment.js',import.meta.url),'utf8');
 assert.match(js,/mailto:info@tripointgs.com/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|x-api-key|client_secret|GetPriceAvailability/);
});
