import {initQuotePicker} from './quote-selection.js';
await initQuotePicker({onChange:items=>{document.getElementById('quote-continue-count').textContent=items.length?items.length+' selected '+(items.length===1?'item is':'items are')+' ready to carry into the form.':'You can also describe a general requirement in the form.';}});
