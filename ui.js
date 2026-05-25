// ui.js - All DOM rendering, view building, and event bindings for StockSentinel

import {
  getProducts, saveProduct, deleteProduct, getProductBySKU,
  getSuppliers, saveSupplier, deleteSupplier,
  getLocations, saveLocation, deleteLocation,
  getTransactions, saveTransaction,
  getProductInventory, getInventoryValuation,
  calculateROPAndSS, getProductAlertStatus,
  getCurrentUser
} from './db.js';

// ─── NOTIFICATION LOG (in-memory, simulated alert engine) ────────────────────
const NOTIF_KEY = 'stocksentinel_notifications';

function getNotifications() {
  const raw = localStorage.getItem(NOTIF_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveNotification(n) {
  const notifs = getNotifications();
  notifs.unshift(n);
  localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 100)));
}

export function clearNotifications() {
  localStorage.removeItem(NOTIF_KEY);
}

/**
 * Evaluate all products for low stock / critical status and generate
 * simulated alert log entries (SMS/Email) when thresholds are crossed.
 */
export function runAlertEngine() {
  const products = getProducts();
  const suppliers = getSuppliers();
  const existing = getNotifications();

  products.forEach(p => {
    const status = getProductAlertStatus(p.ProductID);
    if (status === 'OK') return;

    const stock = getProductInventory(p.ProductID);
    const calc = calculateROPAndSS(p.ProductID);
    const supplier = suppliers.find(s => s.SupplierID === p.SupplierID);
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];

    // Avoid duplicate notifications for same product on same day
    const alreadyNotifiedToday = existing.some(n =>
      n.ProductID === p.ProductID && n.Date.startsWith(todayStr) && n.Status === status
    );
    if (alreadyNotifiedToday) return;

    if (status === 'CRITICAL') {
      saveNotification({
        NotifID: 'n_' + Date.now() + '_' + p.ProductID,
        Date: now,
        ProductID: p.ProductID,
        SKU: p.SKU,
        ProductName: p.ProductName,
        Status: 'CRITICAL',
        Channel: 'SMS',
        Message: `🚨 CRITICAL: ${p.ProductName} (${p.SKU}) is OUT OF STOCK. Immediate replenishment required. Supplier: ${supplier?.SupplierName || 'Unknown'}.`,
        To: supplier?.PhoneNumber || '+1-555-0000'
      });
    } else if (status === 'LOW_STOCK') {
      saveNotification({
        NotifID: 'n_' + Date.now() + '_' + p.ProductID,
        Date: now,
        ProductID: p.ProductID,
        SKU: p.SKU,
        ProductName: p.ProductName,
        Status: 'LOW_STOCK',
        Channel: 'EMAIL',
        Message: `⚠️ Low Stock Alert: ${p.ProductName} (${p.SKU}) has ${stock} units remaining, below ROP of ${calc.rop}. Safety Stock: ${calc.safetyStock}. Recommended reorder from ${supplier?.SupplierName || 'supplier'}.`,
        To: supplier?.Email || 'procurement@store.com'
      });
    }
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt$(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function statusBadge(status) {
  if (status === 'CRITICAL') return `<span class="badge badge-danger">● Out of Stock</span>`;
  if (status === 'LOW_STOCK') return `<span class="badge badge-warning">▲ Low Stock</span>`;
  return `<span class="badge badge-success">✓ Healthy</span>`;
}

function txTypeBadge(type) {
  if (type === 'Inbound') return `<span class="badge badge-success">↑ IN</span>`;
  if (type === 'Outbound') return `<span class="badge badge-danger">↓ OUT</span>`;
  return `<span class="badge badge-warning">± ADJ</span>`;
}

function rowClass(status) {
  if (status === 'CRITICAL') return 'row-danger';
  if (status === 'LOW_STOCK') return 'row-warning';
  return '';
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

export function renderDashboard() {
  const products = getProducts();

  let lowCount = 0, criticalCount = 0;
  products.forEach(p => {
    const s = getProductAlertStatus(p.ProductID);
    if (s === 'LOW_STOCK') lowCount++;
    if (s === 'CRITICAL') criticalCount++;
  });

  document.getElementById('count-low').textContent = lowCount;
  document.getElementById('count-critical').textContent = criticalCount;

  // Alert callout banners
  const alertsContainer = document.getElementById('dashboard-alerts-container');
  alertsContainer.innerHTML = '';
  products.forEach(p => {
    const status = getProductAlertStatus(p.ProductID);
    if (status === 'OK') return;
    const stock = getProductInventory(p.ProductID);
    const calc = calculateROPAndSS(p.ProductID);
    const cls = status === 'CRITICAL' ? 'danger' : 'warning';
    const icon = status === 'CRITICAL' ? '🚨' : '⚠️';
    alertsContainer.innerHTML += `
      <div class="alert-callout ${cls}">
        <span class="alert-callout-icon">${icon}</span>
        <div class="alert-callout-text">
          <h4>${p.ProductName} <span style="font-weight:400; font-size:0.8rem; opacity:0.7;">${p.SKU}</span></h4>
          <p>${status === 'CRITICAL' ? 'Out of stock — order immediately.' : `${stock} units left — ROP: ${calc.rop}, Safety Stock: ${calc.safetyStock}`}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('quick-checkin-btn').click()">Restock</button>
      </div>`;
  });

  // Movement velocity chart (last 7 days)
  renderMovementChart();

  // Replenishment priority list
  renderReplenishList(products);
}

function renderMovementChart() {
  const chartEl = document.getElementById('movement-chart');
  if (!chartEl) return;

  const txs = getTransactions();
  const now = new Date('2026-05-23T12:00:00Z');
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    days.push({ key, label: d.toLocaleDateString('en-US', { weekday: 'short' }), inbound: 0, outbound: 0 });
  }

  txs.forEach(tx => {
    const dateKey = tx.TransactionDate.split('T')[0];
    const day = days.find(d => d.key === dateKey);
    if (!day) return;
    if (tx.TransactionType === 'Inbound') day.inbound += tx.Quantity;
    if (tx.TransactionType === 'Outbound') day.outbound += tx.Quantity;
  });

  const maxVal = Math.max(...days.map(d => Math.max(d.inbound, d.outbound)), 1);

  chartEl.innerHTML = days.map(d => {
    const inH = Math.round((d.inbound / maxVal) * 100);
    const outH = Math.round((d.outbound / maxVal) * 100);
    return `
      <div class="sim-chart-bar-wrapper" title="${d.key}: In ${d.inbound}, Out ${d.outbound}">
        <div style="display:flex; align-items:flex-end; gap:2px; height:100%;">
          <div class="sim-chart-bar" style="height:${inH}%; background: linear-gradient(to top, var(--color-success), hsl(142,70%,60%)); width:48%;"></div>
          <div class="sim-chart-bar" style="height:${outH}%; background: linear-gradient(to top, var(--color-danger), hsl(0,84%,70%)); width:48%;"></div>
        </div>
        <span class="sim-chart-label">${d.label}</span>
      </div>`;
  }).join('');
}

function renderReplenishList(products) {
  const container = document.getElementById('replenish-list-container');
  if (!container) return;

  const alerts = products
    .map(p => ({ p, status: getProductAlertStatus(p.ProductID), stock: getProductInventory(p.ProductID), rop: calculateROPAndSS(p.ProductID).rop }))
    .filter(x => x.status !== 'OK')
    .sort((a, b) => a.stock - b.stock);

  if (alerts.length === 0) {
    container.innerHTML = `<p class="card-subtext text-center" style="padding: 1rem;">✓ All products are well stocked.</p>`;
    return;
  }

  container.innerHTML = alerts.map(({ p, status, stock, rop }) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.6rem 0; border-bottom: 1px solid var(--glass-border);">
      <div>
        <div style="font-size:0.85rem; font-weight:600;">${p.ProductName}</div>
        <div style="font-size:0.75rem; color: var(--text-muted);">${p.SKU}</div>
      </div>
      <div style="text-align:right;">
        ${statusBadge(status)}
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Qty: ${stock} / ROP: ${rop}</div>
      </div>
    </div>`).join('');
}

// ─── CATALOG — PRODUCTS TABLE ─────────────────────────────────────────────────

export function renderProductsTable(filterText = '', filterCategory = 'ALL', filterStatus = 'ALL') {
  const products = getProducts();
  const suppliers = getSuppliers();
  const locations = getLocations();
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  // Populate category dropdown
  const catSelect = document.getElementById('filter-product-category');
  if (catSelect && catSelect.options.length <= 1) {
    const cats = [...new Set(products.map(p => p.Category).filter(Boolean))];
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catSelect.appendChild(opt);
    });
  }

  const filtered = products.filter(p => {
    const search = filterText.toLowerCase();
    const matchText = !search ||
      p.ProductName.toLowerCase().includes(search) ||
      p.SKU.toLowerCase().includes(search) ||
      (p.Category || '').toLowerCase().includes(search);
    const matchCat = filterCategory === 'ALL' || p.Category === filterCategory;
    const status = getProductAlertStatus(p.ProductID);
    const matchStatus = filterStatus === 'ALL' ||
      (filterStatus === 'OK' && status === 'OK') ||
      (filterStatus === 'LOW' && status === 'LOW_STOCK') ||
      (filterStatus === 'CRITICAL' && status === 'CRITICAL');
    return matchText && matchCat && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="color: var(--text-muted); padding: 2rem;">No products match your filters.</td></tr>`;
    return;
  }

  const currentUser = getCurrentUser();

  tbody.innerHTML = filtered.map(p => {
    const supp = suppliers.find(s => s.SupplierID === p.SupplierID);
    const loc = locations.find(l => l.LocationID === p.LocationID);
    const stock = getProductInventory(p.ProductID);
    const calc = calculateROPAndSS(p.ProductID);
    const status = getProductAlertStatus(p.ProductID);
    const isAdmin = currentUser.Role === 'Admin';

    return `<tr class="${rowClass(status)}" id="product-row-${p.ProductID}">
      <td><code style="background:var(--bg-tertiary); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${p.SKU}</code></td>
      <td><strong>${p.ProductName}</strong></td>
      <td>${p.Category || '—'}</td>
      <td>${loc ? loc.LocationName : '—'}</td>
      <td>${supp ? supp.SupplierName : '—'}</td>
      <td class="text-right">${fmt$(p.UnitCost)}</td>
      <td class="text-right">${fmt$(p.RetailPrice)}</td>
      <td class="text-right" style="font-weight:700;">${stock}</td>
      <td class="text-right">${calc.rop} <span style="color:var(--text-muted); font-size:0.75rem;">(SS:${calc.safetyStock})</span></td>
      <td>${statusBadge(status)}</td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="window._editProduct('${p.ProductID}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window._deleteProduct('${p.ProductID}')">Del</button>` : '<span style="color:var(--text-muted); font-size:0.8rem;">View only</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── CATALOG — SUPPLIERS TABLE ────────────────────────────────────────────────

export function renderSuppliersTable(filterText = '') {
  const suppliers = getSuppliers();
  const tbody = document.getElementById('suppliers-table-body');
  if (!tbody) return;

  const filtered = !filterText ? suppliers : suppliers.filter(s =>
    s.SupplierName.toLowerCase().includes(filterText.toLowerCase()) ||
    s.ContactName.toLowerCase().includes(filterText.toLowerCase()) ||
    s.Email.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding: 2rem;">No suppliers found.</td></tr>`;
    return;
  }

  const currentUser = getCurrentUser();
  const isAdmin = currentUser.Role === 'Admin';

  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><strong>${s.SupplierName}</strong></td>
      <td>${s.ContactName}</td>
      <td><a href="mailto:${s.Email}" style="color:var(--accent-primary);">${s.Email}</a></td>
      <td>${s.PhoneNumber}</td>
      <td><span class="badge badge-success">${s.PaymentTerms || '—'}</span></td>
      <td>${s.AvgLeadTime}d avg / ${s.MaxLeadTime}d max</td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="window._editSupplier('${s.SupplierID}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window._deleteSupplier('${s.SupplierID}')">Del</button>` : '<span style="color:var(--text-muted); font-size:0.8rem;">View only</span>'}
        </div>
      </td>
    </tr>`).join('');
}

// ─── LOCATIONS TABLE ─────────────────────────────────────────────────────────

export function renderLocationsTable(filterText = '') {
  const locations = getLocations();
  const tbody = document.getElementById('locations-table-body');
  if (!tbody) return;

  const filtered = !filterText ? locations : locations.filter(l =>
    l.LocationName.toLowerCase().includes(filterText.toLowerCase()) ||
    (l.LocationType || '').toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-muted); padding: 2rem;">No locations found.</td></tr>`;
    return;
  }

  const currentUser = getCurrentUser();
  const isAdmin = currentUser.Role === 'Admin';

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><strong>${l.LocationName}</strong></td>
      <td>${l.LocationType || '—'}</td>
      <td><span class="badge ${l.IsActive ? 'badge-success' : 'badge-warning'}">${l.IsActive ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="window._editLocation('${l.LocationID}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window._deleteLocation('${l.LocationID}')">Del</button>` : '<span style="color:var(--text-muted); font-size:0.8rem;">View only</span>'}
        </div>
      </td>
    </tr>`).join('');
}

// ─── LEDGER / TRANSACTIONS TABLE ─────────────────────────────────────────────

export function renderLedgerTable(filterProductId = 'ALL', filterType = 'ALL') {
  const txs = getTransactions();
  const products = getProducts();
  const locations = getLocations();

  // Populate product filter dropdown
  const productSelect = document.getElementById('filter-tx-product');
  if (productSelect && productSelect.options.length <= 1) {
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.ProductID; opt.textContent = `${p.SKU} – ${p.ProductName}`;
      productSelect.appendChild(opt);
    });
  }

  const tbody = document.getElementById('ledger-table-body');
  if (!tbody) return;

  const filtered = txs.filter(tx => {
    const matchProd = filterProductId === 'ALL' || tx.ProductID === filterProductId;
    const matchType = filterType === 'ALL' || tx.TransactionType === filterType;
    return matchProd && matchType;
  });

  // Sort newest first
  filtered.sort((a, b) => new Date(b.TransactionDate) - new Date(a.TransactionDate));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:var(--text-muted); padding:2rem;">No transactions match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(tx => {
    const prod = products.find(p => p.ProductID === tx.ProductID);
    const loc = locations.find(l => l.LocationID === tx.LocationID);
    
    let qtySign = '';
    if (tx.TransactionType === 'Outbound') {
      qtySign = `-${Math.abs(tx.Quantity)}`;
    } else if (tx.TransactionType === 'Inbound') {
      qtySign = `+${tx.Quantity}`;
    } else { // Adjustment
      qtySign = tx.Quantity >= 0 ? `+${tx.Quantity}` : `${tx.Quantity}`;
    }
    const qtyColor = qtySign.startsWith('-') ? 'var(--color-danger)' : qtySign.startsWith('+') ? 'var(--color-success)' : 'inherit';

    return `
      <tr>
        <td style="font-size:0.82rem; color:var(--text-secondary);">${fmtDate(tx.TransactionDate)}</td>
        <td><code style="background:var(--bg-tertiary); padding:2px 6px; border-radius:4px; font-size:0.78rem;">${prod ? prod.SKU : '—'}</code></td>
        <td>${prod ? prod.ProductName : tx.ProductID}</td>
        <td style="font-size:0.85rem;">${loc ? loc.LocationName : '—'}</td>
        <td>${txTypeBadge(tx.TransactionType)}</td>
        <td class="text-right" style="font-weight:700; font-size:1.05rem; color: ${qtyColor};">${qtySign}</td>
        <td style="font-size:0.82rem; color:var(--text-secondary);">${tx.ReferenceNumber || '—'}</td>
        <td style="font-size:0.82rem;">${tx.UserID === '301' ? 'Sarah C.' : tx.UserID === '302' ? 'John D.' : tx.UserID}</td>
        <td style="font-size:0.82rem; color:var(--text-secondary);">${tx.Notes || '—'}</td>
      </tr>`;
  }).join('');
}

// ─── NOTIFICATIONS FEED ───────────────────────────────────────────────────────

export function renderNotificationsFeed() {
  const container = document.getElementById('notifications-feed-container');
  if (!container) return;

  const notifs = getNotifications();

  if (notifs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:4rem 2rem; color:var(--text-muted);">
        <div style="font-size:3rem; margin-bottom:1rem;">🔔</div>
        <h3 style="color:var(--text-secondary); margin-bottom:0.5rem;">No Alerts Generated</h3>
        <p>All products are within healthy stock thresholds. Alerts will appear here when stock falls below ROP or hits zero.</p>
      </div>`;
    return;
  }

  container.innerHTML = notifs.map(n => {
    const isEmail = n.Channel === 'EMAIL';
    const isCritical = n.Status === 'CRITICAL';
    const icon = isCritical ? '🚨' : isEmail ? '📧' : '📱';

    return `
      <div class="notification-log-item ${n.Channel} ${isCritical ? 'CRITICAL' : ''}">
        <div class="notification-text">
          <h4>${icon} ${isCritical ? 'CRITICAL ALERT' : 'LOW STOCK ALERT'} — ${n.ProductName}</h4>
          <p>${n.Message}</p>
          <div style="margin-top:0.5rem;">
            <span class="notification-type-badge">${n.Channel}</span>
            <span class="notification-type-badge" style="margin-left:4px;">${n.To}</span>
          </div>
        </div>
        <div class="notification-meta">
          <div>${fmtDate(n.Date)}</div>
          <div style="margin-top:4px;">${n.SKU}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── SCAN RESULT CARD ─────────────────────────────────────────────────────────

export function showScanResult(product) {
  const card = document.getElementById('scan-result-card');
  if (!card) return;

  const stock = getProductInventory(product.ProductID);
  const locations = getLocations();
  const loc = locations.find(l => l.LocationID === product.LocationID);

  document.getElementById('scan-product-sku').textContent = `SKU: ${product.SKU}`;
  document.getElementById('scan-product-name').textContent = product.ProductName;
  document.getElementById('scan-product-stock').textContent = stock;
  document.getElementById('scan-product-bin').textContent = loc ? loc.LocationName : '—';
  document.getElementById('scan-product-cost').textContent = fmt$(product.UnitCost);
  document.getElementById('scan-product-val').textContent = fmt$(stock * product.UnitCost);
  document.getElementById('scan-product-id').value = product.ProductID;

  // Populate location dropdown in quick-action form
  const locSelect = document.getElementById('scan-tx-location');
  if (locSelect) {
    locSelect.innerHTML = locations.map(l => `<option value="${l.LocationID}">${l.LocationName}</option>`).join('');
    if (product.LocationID) {
      locSelect.value = product.LocationID;
    }
  }

  card.classList.add('active');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateTxQtyValidation('scan-tx-type', 'scan-tx-qty');
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────────

function openProductModal(productId = null) {
  const suppliers = getSuppliers();
  const suppSelect = document.getElementById('prod-supplier');
  suppSelect.innerHTML = suppliers.map(s =>
    `<option value="${s.SupplierID}">${s.SupplierName}</option>`
  ).join('');

  const locations = getLocations();
  const locSelect = document.getElementById('prod-location');
  if (locSelect) {
    locSelect.innerHTML = locations.map(l =>
      `<option value="${l.LocationID}">${l.LocationName}</option>`
    ).join('');
  }

  if (productId) {
    const p = getProducts().find(x => x.ProductID === productId);
    if (!p) return;
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('prod-id').value = p.ProductID;
    document.getElementById('prod-sku').value = p.SKU;
    document.getElementById('prod-name').value = p.ProductName;
    document.getElementById('prod-category').value = p.Category || '';
    document.getElementById('prod-cost').value = p.UnitCost;
    document.getElementById('prod-price').value = p.RetailPrice;
    document.getElementById('prod-supplier').value = p.SupplierID;
    if (locSelect) locSelect.value = p.LocationID || '';
    document.getElementById('prod-threshold').value = p.ReorderThreshold;
  } else {
    document.getElementById('product-modal-title').textContent = 'New Product Master SKU';
    document.getElementById('product-form').reset();
    document.getElementById('prod-id').value = '';
  }
  openModal('product-modal');
}

// ─── SUPPLIER MODAL ───────────────────────────────────────────────────────────

function openSupplierModal(supplierId = null) {
  if (supplierId) {
    const s = getSuppliers().find(x => x.SupplierID === supplierId);
    if (!s) return;
    document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
    document.getElementById('supp-id').value = s.SupplierID;
    document.getElementById('supp-name').value = s.SupplierName;
    document.getElementById('supp-contact').value = s.ContactName;
    document.getElementById('supp-email').value = s.Email;
    document.getElementById('supp-phone').value = s.PhoneNumber;
    document.getElementById('supp-terms').value = s.PaymentTerms || '';
    document.getElementById('supp-lead-avg').value = s.AvgLeadTime;
    document.getElementById('supp-lead-max').value = s.MaxLeadTime;
  } else {
    document.getElementById('supplier-modal-title').textContent = 'New Supplier Profile';
    document.getElementById('supplier-form').reset();
    document.getElementById('supp-id').value = '';
  }
  openModal('supplier-modal');
}

// ─── LOCATION MODAL ───────────────────────────────────────────────────────────

function openLocationModal(locationId = null) {
  if (locationId) {
    const l = getLocations().find(x => x.LocationID === locationId);
    if (!l) return;
    document.getElementById('location-modal-title').textContent = 'Edit Location';
    document.getElementById('loc-id').value = l.LocationID;
    document.getElementById('loc-name').value = l.LocationName;
    document.getElementById('loc-type').value = l.LocationType || 'Warehouse';
  } else {
    document.getElementById('location-modal-title').textContent = 'New Storage Location';
    document.getElementById('location-form').reset();
    document.getElementById('loc-id').value = '';
  }
  openModal('location-modal');
}

export function updateTxQtyValidation(typeSelectId, qtyInputId) {
  const typeSelect = document.getElementById(typeSelectId);
  const qtyInput = document.getElementById(qtyInputId);
  if (!typeSelect || !qtyInput) return;
  
  if (typeSelect.value === 'Adjustment') {
    qtyInput.setAttribute('min', '-99999');
    qtyInput.setAttribute('placeholder', 'e.g. -5 or 10');
  } else {
    qtyInput.setAttribute('min', '1');
    qtyInput.setAttribute('placeholder', 'e.g. 10');
    if (parseInt(qtyInput.value) < 1) qtyInput.value = '1';
  }
}

// ─── TRANSACTION MODAL ────────────────────────────────────────────────────────

export function openTransactionModal(prefilledProductId = null) {
  const products = getProducts();
  const locations = getLocations();

  const txProdSelect = document.getElementById('tx-product');
  txProdSelect.innerHTML = products.map(p =>
    `<option value="${p.ProductID}" ${p.ProductID === prefilledProductId ? 'selected' : ''}>${p.SKU} — ${p.ProductName}</option>`
  ).join('');

  const txLocSelect = document.getElementById('tx-location');
  txLocSelect.innerHTML = locations.map(l =>
    `<option value="${l.LocationID}">${l.LocationName}</option>`
  ).join('');

  document.getElementById('transaction-form').reset();
  if (prefilledProductId) txProdSelect.value = prefilledProductId;

  openModal('transaction-modal');
  updateTxQtyValidation('tx-type', 'tx-qty');
}

// ─── REGISTER ALL UI EVENT LISTENERS ─────────────────────────────────────────

export function initUIEvents() {
  // Close modal buttons
  document.getElementById('product-modal-close')?.addEventListener('click', () => closeModal('product-modal'));
  document.getElementById('product-form-cancel')?.addEventListener('click', () => closeModal('product-modal'));
  document.getElementById('supplier-modal-close')?.addEventListener('click', () => closeModal('supplier-modal'));
  document.getElementById('supplier-form-cancel')?.addEventListener('click', () => closeModal('supplier-modal'));
  document.getElementById('location-modal-close')?.addEventListener('click', () => closeModal('location-modal'));
  document.getElementById('location-form-cancel')?.addEventListener('click', () => closeModal('location-modal'));
  document.getElementById('tx-modal-close')?.addEventListener('click', () => closeModal('transaction-modal'));
  document.getElementById('tx-form-cancel')?.addEventListener('click', () => closeModal('transaction-modal'));

  // Click outside modal to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });

  // Quick transaction button (topbar)
  document.getElementById('quick-checkin-btn')?.addEventListener('click', () => openTransactionModal());

  // PRODUCT CRUD
  document.getElementById('add-product-btn')?.addEventListener('click', () => openProductModal());
  document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const product = {
      ProductID: document.getElementById('prod-id').value || null,
      SKU: document.getElementById('prod-sku').value.trim().toUpperCase(),
      ProductName: document.getElementById('prod-name').value.trim(),
      Category: document.getElementById('prod-category').value.trim(),
      UnitCost: document.getElementById('prod-cost').value,
      RetailPrice: document.getElementById('prod-price').value,
      SupplierID: document.getElementById('prod-supplier').value,
      LocationID: document.getElementById('prod-location').value,
      ReorderThreshold: document.getElementById('prod-threshold').value,
      IsActive: true
    };
    await saveProduct(product);
    closeModal('product-modal');
    renderProductsTable();
    renderDashboard();
    runAlertEngine();
  });

  // SUPPLIER CRUD
  document.getElementById('add-supplier-btn')?.addEventListener('click', () => openSupplierModal());
  document.getElementById('supplier-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = {
      SupplierID: document.getElementById('supp-id').value || null,
      SupplierName: document.getElementById('supp-name').value.trim(),
      ContactName: document.getElementById('supp-contact').value.trim(),
      Email: document.getElementById('supp-email').value.trim(),
      PhoneNumber: document.getElementById('supp-phone').value.trim(),
      PaymentTerms: document.getElementById('supp-terms').value.trim(),
      AvgLeadTime: document.getElementById('supp-lead-avg').value,
      MaxLeadTime: document.getElementById('supp-lead-max').value
    };
    await saveSupplier(supplier);
    closeModal('supplier-modal');
    renderSuppliersTable();
  });

  // LOCATION CRUD
  document.getElementById('add-location-btn')?.addEventListener('click', () => openLocationModal());
  document.getElementById('location-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const location = {
      LocationID: document.getElementById('loc-id').value || null,
      LocationName: document.getElementById('loc-name').value.trim(),
      LocationType: document.getElementById('loc-type').value,
      IsActive: true
    };
    await saveLocation(location);
    closeModal('location-modal');
    renderLocationsTable();
  });

  // TRANSACTION FORM SUBMIT
  document.getElementById('transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = parseInt(document.getElementById('tx-qty').value);
    if (qty === 0 || isNaN(qty)) {
      alert('Quantity cannot be zero.');
      return;
    }
    const currentUser = getCurrentUser();
    const tx = {
      ProductID: document.getElementById('tx-product').value,
      TransactionType: document.getElementById('tx-type').value,
      Quantity: qty,
      LocationID: document.getElementById('tx-location').value,
      ReferenceNumber: document.getElementById('tx-ref').value.trim(),
      Notes: document.getElementById('tx-notes').value.trim(),
      UserID: currentUser.UserID,
      TransactionDate: new Date().toISOString()
    };
    await saveTransaction(tx);
    closeModal('transaction-modal');
    renderDashboard();
    renderLedgerTable();
    runAlertEngine();
    renderNotificationsFeed();
  });

  // SCAN QUICK MOVEMENT FORM
  document.getElementById('scan-quick-movement-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qty = parseInt(document.getElementById('scan-tx-qty').value);
    if (qty === 0 || isNaN(qty)) {
      alert('Quantity cannot be zero.');
      return;
    }
    const currentUser = getCurrentUser();
    const tx = {
      ProductID: document.getElementById('scan-product-id').value,
      TransactionType: document.getElementById('scan-tx-type').value,
      Quantity: qty,
      LocationID: document.getElementById('scan-tx-location').value,
      Notes: document.getElementById('scan-tx-notes').value || 'Recorded via scanner',
      UserID: currentUser.UserID,
      TransactionDate: new Date().toISOString()
    };
    await saveTransaction(tx);
    // Feedback
    const btn = document.getElementById('scan-submit-btn');
    btn.textContent = '✓ Movement Saved!';
    btn.style.backgroundColor = 'var(--color-success)';
    setTimeout(() => {
      btn.textContent = 'Submit Movement';
      btn.style.backgroundColor = '';
      document.getElementById('scan-result-card').classList.remove('active');
    }, 2000);
    renderDashboard();
    runAlertEngine();
  });

  // Dynamic validation for transaction quantity fields
  document.getElementById('tx-type')?.addEventListener('change', () => {
    updateTxQtyValidation('tx-type', 'tx-qty');
  });
  document.getElementById('scan-tx-type')?.addEventListener('change', () => {
    updateTxQtyValidation('scan-tx-type', 'scan-tx-qty');
  });

  // CATALOG TABS
  document.getElementById('tab-products-btn')?.addEventListener('click', () => {
    document.getElementById('tab-products-btn').classList.add('active');
    document.getElementById('tab-suppliers-btn').classList.remove('active');
    document.getElementById('catalog-products-pane').classList.remove('hidden');
    document.getElementById('catalog-suppliers-pane').classList.add('hidden');
  });
  document.getElementById('tab-suppliers-btn')?.addEventListener('click', () => {
    document.getElementById('tab-suppliers-btn').classList.add('active');
    document.getElementById('tab-products-btn').classList.remove('active');
    document.getElementById('catalog-suppliers-pane').classList.remove('hidden');
    document.getElementById('catalog-products-pane').classList.add('hidden');
    renderSuppliersTable();
  });

  // SEARCH AND FILTERS — Products
  document.getElementById('search-products')?.addEventListener('input', (e) => {
    renderProductsTable(
      e.target.value,
      document.getElementById('filter-product-category').value,
      document.getElementById('filter-product-status').value
    );
  });
  document.getElementById('filter-product-category')?.addEventListener('change', (e) => {
    renderProductsTable(
      document.getElementById('search-products').value,
      e.target.value,
      document.getElementById('filter-product-status').value
    );
  });
  document.getElementById('filter-product-status')?.addEventListener('change', (e) => {
    renderProductsTable(
      document.getElementById('search-products').value,
      document.getElementById('filter-product-category').value,
      e.target.value
    );
  });

  // SEARCH — Suppliers
  document.getElementById('search-suppliers')?.addEventListener('input', (e) => {
    renderSuppliersTable(e.target.value);
  });

  // SEARCH — Locations
  document.getElementById('search-locations')?.addEventListener('input', (e) => {
    renderLocationsTable(e.target.value);
  });

  // FILTERS — Ledger
  document.getElementById('filter-tx-product')?.addEventListener('change', (e) => {
    renderLedgerTable(e.target.value, document.getElementById('filter-tx-type').value);
  });
  document.getElementById('filter-tx-type')?.addEventListener('change', (e) => {
    renderLedgerTable(document.getElementById('filter-tx-product').value, e.target.value);
  });
  document.getElementById('new-tx-btn')?.addEventListener('click', () => openTransactionModal());

  // NOTIFICATIONS
  document.getElementById('clear-notifications-btn')?.addEventListener('click', () => {
    clearNotifications();
    renderNotificationsFeed();
  });

  // Global window delegates for table row action buttons
  window._editProduct = (id) => openProductModal(id);
  window._deleteProduct = async (id) => {
    if (confirm('Delete this product? Its transaction history is preserved.')) {
      await deleteProduct(id);
      renderProductsTable();
      renderDashboard();
    }
  };
  window._editSupplier = (id) => openSupplierModal(id);
  window._deleteSupplier = async (id) => {
    if (confirm('Delete this supplier?')) {
      await deleteSupplier(id);
      renderSuppliersTable();
    }
  };
  window._editLocation = (id) => openLocationModal(id);
  window._deleteLocation = async (id) => {
    if (confirm('Delete this location?')) {
      await deleteLocation(id);
      renderLocationsTable();
    }
  };
}

// ─── USER / ROLE DISPLAY ─────────────────────────────────────────────────────

export function updateUserDisplay(user) {
  const avatar = document.getElementById('sidebar-avatar');
  const username = document.getElementById('sidebar-username');
  const userrole = document.getElementById('sidebar-userrole');

  if (avatar) avatar.textContent = initials(user.FullName);
  if (username) username.textContent = user.FullName;
  if (userrole) userrole.textContent = user.Role === 'Admin' ? 'Shop Owner' : 'Floor Worker';

  // Toggle admin-only action buttons
  const adminOnlyBtns = ['add-product-btn', 'add-supplier-btn', 'add-location-btn'];
  adminOnlyBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = user.Role === 'Admin' ? '' : 'none';
  });
}
