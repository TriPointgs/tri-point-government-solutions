/**
 * Private quote calculator page shell.
 * This page contains no pricing, contractor or supplier records.
 * Calculations are available only through the authenticated /api/equipment-admin endpoint.
 */
export function equipmentAdminPage(){
return `
<div class="crumb"><a href="/">Home</a> / <a href="/equipment">Equipment</a> / Private workbench</div>
<section class="section">
  <div class="page-head"><p class="eyebrow">Private staff workspace</p>
    <h1>Equipment quotation workbench</h1>
    <p class="lead">Estimate a resale price from manually verified supplier costs, freight and fees. This tool does not retrieve TD SYNNEX prices, store quotes, email buyers or place purchases.</p>
  </div>
  <div class="panel narrow">
    <p class="fine">Sign in through the <a href="/contractors/admin">Tri-Point administrator login</a> first. The existing administrator session is required.</p>
    <form id="equipment-estimate-form">
      <label class="field">Quantity <input type="number" name="quantity" min="1" max="100000" value="1" step="1" required></label>
      <label class="field">Supplier unit cost (USD) <input type="text" name="unitCost" inputmode="decimal" placeholder="0.00" autocomplete="off" required></label>
      <label class="field">Total freight cost (USD) <input type="text" name="freight" inputmode="decimal" value="0.00" autocomplete="off" required></label>
      <label class="field">Other landed fees (USD) <input type="text" name="fees" inputmode="decimal" value="0.00" autocomplete="off" required></label>
      <label class="field">Markup on landed cost (%) <input type="number" name="markup" step="0.01" min="0" max="500" value="12" required></label>
      <label class="field">Minimum gross margin (%) <input type="number" name="margin" step="0.01" min="0" max="89.99" value="0" required></label>
      <label class="field">Minimum total profit (USD) <input type="text" name="minimumProfit" inputmode="decimal" value="0.00" autocomplete="off" required></label>
      <div class="actions"><button type="submit">Calculate private draft quote</button></div>
    </form>
    <p id="equipment-estimate-status" role="status" aria-live="polite">Enter supplier costs that you have checked independently.</p>
    <div id="equipment-estimate-output" hidden>
      <h2>Draft estimate only</h2>
      <dl id="equipment-estimate-values"></dl>
      <p class="fine">Estimated profit excludes taxes, processing charges, returns, financing, customer-specific fulfillment obligations and other unentered costs. Confirm product authorization, buyer pricing eligibility, warranty, stock, and final terms before preparing a formal offer.</p>
    </div>
  </div>
</section>`;
}
