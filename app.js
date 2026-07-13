const ids = ['price','productCost','inboundShipping','packaging','outboundShipping','platformFee','paymentFee','paymentFixed','discount','adCost','returnRate','dailySales','inventory','leadTime','safetyDays'];
const $ = id => document.getElementById(id);
const num = id => Number($(id).value) || 0;
const money = value => `${$('currency').value}${value.toFixed(2)}`;
let latest = null;

function calculate() {
  const price = num('price');
  const discountedPrice = price * (1 - num('discount') / 100);
  const landed = num('productCost') + num('inboundShipping') + num('packaging');
  const platform = discountedPrice * num('platformFee') / 100;
  const payment = discountedPrice * num('paymentFee') / 100 + num('paymentFixed');
  const expectedReturn = discountedPrice * num('returnRate') / 100;
  const variableCosts = landed + num('outboundShipping') + platform + payment + num('adCost') + expectedReturn;
  const profit = discountedPrice - variableCosts;
  const margin = discountedPrice ? profit / discountedPrice * 100 : 0;
  const breakEven = (landed + num('outboundShipping') + num('adCost') + num('paymentFixed')) / Math.max(.01, 1 - num('platformFee') / 100 - num('paymentFee') / 100 - num('returnRate') / 100);
  const runway = num('dailySales') ? num('inventory') / num('dailySales') : 0;
  const reorderPoint = Math.ceil(num('dailySales') * (num('leadTime') + num('safetyDays')));
  latest = { name: $('productName').value || 'Untitled product', discountedPrice, landed, profit, margin, breakEven, runway, reorderPoint };

  $('resultTitle').textContent = $('productName').value || 'Untitled product';
  $('profitValue').textContent = money(profit);
  $('marginValue').textContent = `${margin.toFixed(1)}%`;
  $('landedValue').textContent = money(landed);
  $('breakEvenValue').textContent = money(breakEven);
  $('runwayValue').textContent = `${runway.toFixed(1)} days`;
  $('reorderValue').textContent = `${reorderPoint} units`;
  $('runwayNote').textContent = runway <= num('leadTime') ? 'Stock may run out before the next shipment lands.' : 'Runway covers the supplier lead-time window.';
  $('reorderNote').textContent = num('inventory') <= reorderPoint ? 'Current stock is at or below the suggested buffer.' : 'Current stock is above the suggested reorder point.';
  $('healthBadge').textContent = margin >= 30 ? 'Healthy margin' : margin >= 15 ? 'Watch margin' : 'Margin at risk';
  $('healthBadge').style.color = margin >= 30 ? 'var(--accent)' : margin >= 15 ? 'var(--blue)' : 'var(--danger)';

  const rows = [
    ['Landed cost', landed], ['Outbound shipping', num('outboundShipping')], ['Platform fee', platform], ['Payment fee', payment], ['Ad cost', num('adCost')], ['Return allowance', expectedReturn], ['Contribution profit', profit]
  ];
  const base = Math.max(discountedPrice, 1);
  $('breakdownRows').innerHTML = rows.map(([label, value]) => `<div class="bar-row ${label === 'Contribution profit' ? 'profit' : ''}"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, Math.max(0, Math.abs(value) / base * 100))}%"></i></div><b>${money(value)}</b></div>`).join('');
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one product row.');
  const headers = lines[0].split(',').map(value => value.trim().toLowerCase());
  const required = ['name', 'price', 'product_cost'];
  const missing = required.filter(key => !headers.includes(key));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  return lines.slice(1).map(line => {
    const values = line.split(',').map(value => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '0']));
  });
}

function batchRow(item) {
  const price = Number(item.price) || 0;
  const landed = (Number(item.product_cost) || 0) + (Number(item.inbound_shipping) || 0) + (Number(item.packaging) || 0);
  const discounted = price * (1 - (Number(item.discount) || 0) / 100);
  const fees = discounted * ((Number(item.platform_fee) || 0) + (Number(item.payment_fee) || 0)) / 100 + (Number(item.payment_fixed) || 0);
  const profit = discounted - landed - (Number(item.outbound_shipping) || 0) - fees - (Number(item.ad_cost) || 0) - discounted * (Number(item.return_rate) || 0) / 100;
  const margin = discounted ? profit / discounted * 100 : 0;
  const action = margin >= 30 ? ['Scale', 'action-good'] : margin >= 15 ? ['Watch', 'action-watch'] : ['Review', 'action-risk'];
  return { name: item.name, margin, profit, action };
}

function renderBatch(rows) {
  rows = rows.map(batchRow);
  $('batchPanel').hidden = false;
  $('batchCount').textContent = `${rows.length} SKUs`;
  $('batchRows').innerHTML = rows.sort((a, b) => b.margin - a.margin).map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.margin.toFixed(1)}%</td><td>${money(row.profit)}</td><td class="${row.action[1]}">${row.action[0]}</td></tr>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function download(filename, content, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

$('calculator').addEventListener('submit', event => { event.preventDefault(); calculate(); });
ids.concat(['productName','currency']).forEach(id => $(id).addEventListener('input', calculate));
$('resetButton').addEventListener('click', () => { $('calculator').reset(); calculate(); });
$('csvInput').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { renderBatch(parseCsv(reader.result)); $('csvStatus').textContent = `${file.name} imported. Results are sorted by margin.`; }
    catch (error) { $('csvStatus').textContent = error.message; $('batchPanel').hidden = true; }
  };
  reader.readAsText(file);
});
$('downloadButton').addEventListener('click', () => {
  if (!latest) calculate();
  const header = 'name,discounted_price,landed_cost,contribution_profit,margin,break_even_price,inventory_runway_days,reorder_point\n';
  const row = [latest.name, latest.discountedPrice, latest.landed, latest.profit, latest.margin, latest.breakEven, latest.runway, latest.reorderPoint].map(value => JSON.stringify(value)).join(',');
  download('marginpilot-result.csv', header + row + '\n', 'text/csv');
  $('csvStatus').textContent = 'Result exported locally.';
});
calculate();
