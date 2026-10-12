/**
 * Preview-only import staging screen. All controls operate through
 * the authenticated read-only simulation endpoint, not supplier systems.
 */
export function equipmentImportPage(){
  return `
<div class="crumb"><a href="/">Home</a> / <a href="/equipment">Equipment</a> / <a href="/equipment/admin">Workbench</a> / Catalog simulation</div>
<section class="section">
 <div class="page-head">
  <p class="eyebrow">Preview only · synthetic data</p>
  <h1>Equipment catalog import diagnostics</h1>
  <p class="lead">Validate a synthetic product catalog and simulated hourly stock updates without importing, saving, publishing, or transmitting data to TD SYNNEX.</p>
 </div>
 <div class="panel narrow">
  <p><strong>Staff sign-in required.</strong> The same <a href="/contractors/admin">Tri-Point administrator session</a> is used for this tool.</p>
  <p class="fine">Only the `TP_SYNTHETIC_CATALOG_CSV_V1` and `TP_SYNTHETIC_HOURLY_STOCK_CSV_V1` test formats are accepted. SKU values must start with `SYN-`. Do not paste real supplier catalog files, credentials, customer contact records or confidential prices.</p>
  <form id="equipment-import-form">
   <label class="field">Synthetic catalog CSV
    <textarea name="catalogCsv" id="equipment-import-catalog" rows="9" maxlength="131072" required placeholder="sku,mfgPN,manufacturer,description,category,status,priceType,unitCost"></textarea>
   </label>
   <label class="field">Synthetic hourly stock CSV
    <textarea name="stockCsv" id="equipment-import-stock" rows="7" maxlength="131072" required placeholder="sku,quantity,stockAt"></textarea>
   </label>
   <label class="field">Stock file mode
    <select name="mode"><option value="full">Full inventory snapshot (all catalog SKUs)</option><option value="delta">Delta inventory update (only changed SKUs)</option></select>
   </label>
   <label class="check"><input type="checkbox" name="synthetic" required><span>I confirm these are synthetic example records, not customer or supplier data.</span></label>
   <div class="actions">
    <button id="equipment-load-example" type="button" class="button secondary">Load synthetic example</button>
    <button type="submit">Run dry-run validation</button>
   </div>
  </form>
  <p id="equipment-import-status" role="status" aria-live="polite">No catalog data has been imported.</p>
  <div id="equipment-import-summary" hidden>
   <h2>Validation summary</h2>
   <dl id="equipment-import-results"></dl>
   <p class="fine">This is a non-persistent simulation. Products are never approved for public display, quoting or purchasing. Production endpoints reject these imports.</p>
  </div>
 </div>
</section>`;
}
