/**
 * First equipment storefront section.
 * Do not embed prices, inventory quantities, TD SYNNEX credentials, or invented SKUs.
 * A public catalog is not enabled until an authorized product feed is connected.
 */
export function equipmentPage() {
  const categories = [
    ['Computers and workstations','Desktops, business laptops, workstations and fleet refreshes.'],
    ['Networking and wireless','Switches, routers, wireless access points and network accessories.'],
    ['Monitors and peripherals','Displays, docks, keyboards, mice and workplace accessories.'],
    ['Printers and imaging','Printers, multifunction devices and consumables.'],
    ['Servers and storage','Servers, storage systems, drives and data center components.'],
    ['Power and accessories','UPS systems, batteries, power distribution and related equipment.']
  ];
  const cards = categories.map(([title,detail]) =>
    `<article class="card"><h3>${title}</h3><p>${detail}</p><button type="button" class="equipment-category" data-equipment-category="${title}">Request ${title.toLowerCase()} quote</button></article>`
  ).join('');

  return `
    <div class="crumb"><a href="/">Home</a> / Equipment</div>
    <section class="hero">
      <div>
        <p class="eyebrow">Business &amp; institutional technology sourcing</p>
        <h1>Equipment sourcing for organizations that need a precise quote.</h1>
        <p class="lead">Tell Tri-Point Government Solutions what equipment you need, how many units, and where they must be delivered. We review product specifications and sourcing options before presenting a quotation.</p>
        <div class="actions">
          <a class="button" href="#equipment-request">Request equipment quote</a>
          <a class="button secondary" href="#equipment-categories">Explore categories</a>
        </div>
        <p class="fine">Availability, manufacturer authorization, lead times and final prices require verification. This page does not offer live inventory or checkout.</p>
      </div>
      <aside class="panel accent">
        <p class="eyebrow">What to include</p>
        <h2>Specific requirements make quoting easier.</h2>
        <ol class="steps">
          <li><strong>Manufacturer and part number.</strong><p>Include the exact model, or specify acceptable equivalents.</p></li>
          <li><strong>Quantity and configuration.</strong><p>Provide minimum technical requirements and needed accessories.</p></li>
          <li><strong>Destination and due date.</strong><p>Include delivery ZIP code and any procurement deadline.</p></li>
        </ol>
      </aside>
    </section>
    <section id="equipment-categories" class="section">
      <div class="section-title">
        <p class="eyebrow">Equipment categories</p>
        <h2>Tell us what you are trying to purchase.</h2>
        <p>These represent sourcing categories, not an inventory claim. Select a category to prefill your quotation request.</p>
      </div>
      <div class="grid">${cards}</div>
    </section>
    <section id="equipment-request" class="section">
      <div class="section-title">
        <p class="eyebrow">Request for quotation</p>
        <h2>Prepare your equipment request.</h2>
        <p>The form prepares an email in your mail application. <strong>You must send that email</strong> for Tri-Point to receive your request. No information is transmitted or stored by this page.</p>
      </div>
      <form id="equipment-quote-form" class="panel narrow">
        <label class="field">Organization / company <input name="company" type="text" autocomplete="organization" maxlength="120" required></label>
        <label class="field">Contact email <input name="email" type="email" autocomplete="email" maxlength="200" required></label>
        <label class="field">Buyer type
          <select name="buyerType" required>
            <option value="">Select buyer type</option>
            <option>Business / commercial</option>
            <option>K–12 education</option>
            <option>Higher education</option>
            <option>Federal government</option>
            <option>State / local government</option>
            <option>Other organization</option>
          </select>
        </label>
        <label class="field">Equipment category
          <select id="equipment-quote-category" name="category" required>
            <option value="">Select category</option>
            ${categories.map(([title])=>`<option value="${title}">${title}</option>`).join('')}
            <option>Other technology equipment</option>
          </select>
        </label>
        <label class="field">Manufacturer, model or part numbers <input name="partNumbers" type="text" maxlength="300" placeholder="Exact SKU / MPN, or acceptable alternatives"></label>
        <label class="field">Quantity <input name="quantity" type="number" min="1" max="100000" step="1" required></label>
        <label class="field">Required specifications <textarea name="requirements" rows="5" maxlength="1800" required placeholder="Describe equipment, configuration, acceptable equivalents, warranty, and delivery requirements."></textarea></label>
        <label class="field">Delivery ZIP code <input name="deliveryZip" type="text" inputmode="text" maxlength="12" placeholder="ZIP / postal code" required></label>
        <label class="field">Quote or delivery deadline (optional) <input name="deadline" type="text" maxlength="100" placeholder="Include date, time, and time zone"></label>
        <p class="fine">Do not enter payment card details, passwords, Social Security numbers, or confidential procurement documents. For long equipment schedules, send the supporting files through an appropriate approved channel after contacting us.</p>
        <div class="actions"><button type="submit">Prepare email request</button><a class="button secondary" href="mailto:info@tripointgs.com?subject=Equipment%20RFQ">Email Tri-Point directly</a></div>
        <p id="equipment-quote-status" role="status" aria-live="polite"></p>
        <noscript><p>Email your equipment list, quantities, requirements and delivery ZIP to <a href="mailto:info@tripointgs.com">info@tripointgs.com</a>; this form needs JavaScript to prepare an email.</p></noscript>
      </form>
    </section>
  `;
}
