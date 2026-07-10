// app.js - StockSentinel Application Entry Point & Navigation Router

import { initDB, resetDB, getCurrentUser, getUsers, setCurrentUser, getDBStatus, getProducts, getLocations, saveTransaction, deleteTransactionsByReference } from './db.js';
import {
  initUIEvents,
  updateUserDisplay,
  renderDashboard,
  renderProductsTable,
  renderSuppliersTable,
  renderLocationsTable,
  renderLedgerTable,
  renderNotificationsFeed,
  runAlertEngine
} from './ui.js';
import { initScanner, cleanupScanner, populateScanLocationDropdown } from './scanner.js';

// ─── NAVIGATION CONFIGURATION ─────────────────────────────────────────────────

const VIEWS = [
  {
    id: 'dashboard-view',
    title: 'Dashboard',
    subtitle: 'Live overview of inventory metrics',
    onEnter: () => renderDashboard()
  },
  {
    id: 'catalog-view',
    title: 'Catalog',
    subtitle: 'Products master list & supplier directory',
    onEnter: () => renderProductsTable()
  },
  {
    id: 'locations-view',
    title: 'Locations',
    subtitle: 'Warehouse bins, showroom floors and storage rooms',
    onEnter: () => renderLocationsTable()
  },
  {
    id: 'ledger-view',
    title: 'Transactions',
    subtitle: 'Full inventory movement history & ledger',
    onEnter: () => renderLedgerTable()
  },
  {
    id: 'scanner-view',
    title: 'Scanner',
    subtitle: 'Scan product barcodes & QR codes via camera',
    onEnter: () => populateScanLocationDropdown(),
    onLeave: () => cleanupScanner()
  },
  {
    id: 'notifications-view',
    title: 'Alert Center',
    subtitle: 'Simulated SMS & email low-stock notifications log',
    onEnter: () => renderNotificationsFeed()
  },
  {
    id: 'selling-view',
    title: 'Sell',
    subtitle: 'Record sales transactions and reduce stock',
    onEnter: () => { }
  },
  {
    id: 'sales-history-view',
    title: 'Sales History',
    subtitle: 'All finalized sale receipts — reprint any past transaction',
    onEnter: () => renderSalesHistoryView()
  }
];

let currentViewId = 'dashboard-view';

// ─── NAVIGATION ROUTER ────────────────────────────────────────────────────────

function navigateTo(viewId) {
  if (viewId === currentViewId) return;

  const prevView = VIEWS.find(v => v.id === currentViewId);
  if (prevView?.onLeave) prevView.onLeave();

  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

  const targetEl = document.getElementById(viewId);
  if (targetEl) {
    targetEl.classList.add('active');
    currentViewId = viewId;
  }

  const targetView = VIEWS.find(v => v.id === viewId);
  if (targetView) {
    const titleEl = document.getElementById('view-title');
    const subtitleEl = document.getElementById('view-subtitle');
    if (titleEl) titleEl.textContent = targetView.title;
    if (subtitleEl) subtitleEl.textContent = targetView.subtitle;
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  if (targetView?.onEnter) targetView.onEnter();
}

function initNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(item.dataset.view);
      }
    });
  });

  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });
}

// ─── ROLE SWITCHER ────────────────────────────────────────────────────────────

function initRoleSwitcher() {
  const adminBtn = document.getElementById('role-admin-btn');
  const workerBtn = document.getElementById('role-worker-btn');

  if (!adminBtn || !workerBtn) return;

  adminBtn.addEventListener('click', () => {
    const users = getUsers();
    const admin = users.find(u => u.Role === 'Admin');
    if (!admin) return;
    setCurrentUser(admin.UserID);
    adminBtn.classList.add('active');
    workerBtn.classList.remove('active');
    updateUserDisplay(admin);
    refreshCurrentView();
  });

  workerBtn.addEventListener('click', () => {
    const users = getUsers();
    const worker = users.find(u => u.Role === 'Worker');
    if (!worker) return;
    setCurrentUser(worker.UserID);
    workerBtn.classList.add('active');
    adminBtn.classList.remove('active');
    updateUserDisplay(worker);
    refreshCurrentView();
  });
}

function refreshCurrentView() {
  const view = VIEWS.find(v => v.id === currentViewId);
  if (view?.onEnter) view.onEnter();
}

function updateDatabaseStatusDisplay() {
  const statusEl = document.getElementById('db-status');
  if (!statusEl) return;

  const status = getDBStatus();
  statusEl.classList.toggle('online', status.remoteEnabled);
  statusEl.classList.toggle('offline', !status.remoteEnabled);
  statusEl.textContent = status.remoteEnabled ? 'Database: Supabase' : 'Database: Local fallback';
  statusEl.title = status.message;
}

function initSyncButton() {
  const syncBtn = document.getElementById('sync-db-btn');
  if (!syncBtn) return;

  syncBtn.addEventListener('click', async () => {
    const originalText = syncBtn.textContent;
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';

    await initDB();
    runAlertEngine();
    refreshCurrentView();
    updateDatabaseStatusDisplay();

    syncBtn.textContent = getDBStatus().remoteEnabled ? 'Synced' : 'Retry Sync';
    setTimeout(() => {
      syncBtn.disabled = false;
      syncBtn.textContent = originalText;
    }, 1400);
  });
}

// ─── RESET DEMO DATA ─────────────────────────────────────────────────────────

function initResetButton() {
  document.getElementById('reset-db-btn')?.addEventListener('click', async () => {
    if (confirm('Reset all data to the original demo seed data? This cannot be undone.')) {
      await resetDB();
      const user = getCurrentUser();
      updateUserDisplay(user);
      updateDatabaseStatusDisplay();

      document.getElementById('role-admin-btn')?.classList.add('active');
      document.getElementById('role-worker-btn')?.classList.remove('active');

      runAlertEngine();
      refreshCurrentView();

      const btn = document.getElementById('reset-db-btn');
      const orig = btn.textContent;
      btn.textContent = '✓ Data Reset!';
      btn.style.color = 'var(--color-success)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 2000);
    }
  });
}

// ─── SALES HISTORY & RECEIPT PRINT ────────────────────────────────────────────

const SALES_HISTORY_KEY = 'stocksentinel_sales_history';

function getSalesHistory() {
  try { return JSON.parse(localStorage.getItem(SALES_HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function printReceiptFromRecord(sale) {
  const rows = sale.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align:center;">${item.qty}</td>
      <td>&#8358;${Number(item.price).toFixed(2)}</td>
      <td>&#8358;${Number(item.subtotal).toFixed(2)}</td>
    </tr>`).join('');

  const printWindow = window.open('', '_blank', 'height=640,width=820');
  printWindow.document.write(`
    <html>
    <head>
      <title>Receipt - ${sale.receiptId}</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif; padding: 28px; color: #222; background: #fff; }
        .header { text-align: center; margin-bottom: 18px; }
        .header h1 { font-size: 1.6rem; font-weight: 700; color: #1a1a2e; }
        .header .subtitle { font-size: 0.85rem; color: #777; margin-top: 2px; }
        .divider { border: none; border-top: 2px dashed #ccc; margin: 14px 0; }
        .meta { font-size: 0.88rem; margin-bottom: 4px; color: #444; }
        .receipt-id { font-size: 0.75rem; color: #aaa; text-align: center; margin-bottom: 6px; }
        .edited-badge { color: #e91e63; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #f0f4f8; padding: 9px 10px; text-align: left; font-size: 0.85rem; border-bottom: 1px solid #ddd; }
        td { padding: 8px 10px; font-size: 0.88rem; border-bottom: 1px solid #f0f0f0; }
        tbody tr:last-child td { border-bottom: none; }
        .total-row td { font-weight: 700; font-size: 1rem; padding-top: 12px; border-top: 2px dashed #ccc; }
        .footer { text-align: center; margin-top: 28px; font-size: 0.8rem; color: #888; }
        @media print { body { padding: 12px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>StockSentinel</h1>
        <div class="subtitle">Official Sales Receipt</div>
      </div>
      <div class="receipt-id">Receipt #${sale.receiptId}${sale.edited ? ' <span class="edited-badge">(Edited)</span>' : ''}</div>
      <hr class="divider">
      <p class="meta"><strong>Location:</strong> ${sale.locationName}</p>
      <p class="meta"><strong>Date:</strong> ${sale.dateTime}</p>
      <p class="meta"><strong>Seller:</strong> ${sale.sellerName || '-'}</p>
      ${sale.notes ? `<p class="meta"><strong>Notes:</strong> ${sale.notes}</p>` : ''}
      <table>
        <thead>
          <tr><th>Item</th><th style="text-align:center;">Qty</th><th>Price</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="3">Grand Total</td>
            <td>&#8358;${Number(sale.grandTotal).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <p>Thank you for your purchase!</p>
        <p>Powered by StockSentinel</p>
      </div>
      <script>window.onload = () => window.print();<\/script>
    </body>
    </html>`);
  printWindow.document.close();
}

function renderSalesHistoryView() {
  const tbody = document.getElementById('sales-history-table-body');
  if (!tbody) return;

  const history = getSalesHistory();

  if (history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="color: var(--text-secondary); padding: 2.5rem;">
          No sales recorded yet. Finalize a sale on the <strong>Sale</strong> page to see history here.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = history.map((sale, idx) => `
    <tr>
      <td>
        <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;">${sale.receiptId}</code>
        ${sale.edited ? '<span class="badge" style="background: rgba(233,30,99,0.15); color:#e91e63; margin-left:4px; font-size:0.7rem; padding: 2px 5px; border-radius:3px;">Edited</span>' : ''}
      </td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${sale.dateTime}</td>
      <td style="font-size: 0.85rem;">${sale.locationName}</td>
      <td>
        <span class="badge badge-success">${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</span>
      </td>
      <td class="text-right" style="font-weight: 700; color: var(--color-success);">
        &#8358;${Number(sale.grandTotal).toFixed(2)}
      </td>
      <td style="font-size: 0.82rem; color: var(--text-secondary);">${sale.notes || '&#8212;'}</td>
      <td class="text-center">
        <div style="display: inline-flex; gap: 0.5rem; justify-content: center;">
          <button class="btn btn-secondary btn-sm" id="reprint-btn-${idx}" onclick="window._reprintSale(${idx})" title="Reprint Receipt">&#128424; Reprint</button>
          <button class="btn btn-primary btn-sm" id="edit-cart-btn-${idx}" onclick="window._openReceiptEditor(${idx})" title="View and Edit this Receipt">&#9998; Edit</button>
        </div>
      </td>
    </tr>`).join('');

  window._reprintSale = (idx) => {
    const h = getSalesHistory();
    if (h[idx]) printReceiptFromRecord(h[idx]);
  };

  window._openReceiptEditor = (idx) => {
    const h = getSalesHistory();
    const sale = h[idx];
    if (sale) openReceiptEditModal(sale);
  };
}

function initClearSalesHistoryButton() {
  document.getElementById('clear-sales-history-btn')?.addEventListener('click', () => {
    if (confirm('Clear all sales history? This cannot be undone.')) {
      localStorage.removeItem(SALES_HISTORY_KEY);
      renderSalesHistoryView();
    }
  });
}

function initLogoutButton() {
  const handler = () => {
    localStorage.removeItem('stocksentinel_current_user');
    window.location.href = 'index.html';
  };
  document.getElementById('logout-btn')?.addEventListener('click', handler);
  document.getElementById('logout-btn-top')?.addEventListener('click', handler);
}

// ─── RECEIPT EDIT MODAL ───────────────────────────────────────────────────────

let _modalCart = [];
let _modalSale = null;

function openReceiptEditModal(sale) {
  _modalSale = sale;
  _modalCart = sale.items.map(i => ({ ...i }));

  // Populate header
  document.getElementById('receipt-modal-title').textContent = 'Receipt #' + sale.receiptId;
  document.getElementById('receipt-modal-subtitle').textContent =
    sale.dateTime + '  -  Seller: ' + (sale.sellerName || '-') + (sale.edited ? '  -  Previously Edited' : '');

  // Populate location dropdown
  const locSel = document.getElementById('receipt-modal-location');
  const locations = getLocations();
  locSel.innerHTML = locations.map(l =>
    `<option value="${l.LocationID}" ${l.LocationName === sale.locationName ? 'selected' : ''}>${l.LocationName}</option>`
  ).join('');

  // Populate notes
  document.getElementById('receipt-modal-notes').value = sale.notes || '';

  // Populate add-item product dropdown
  const products = getProducts();
  const prodSel = document.getElementById('receipt-modal-new-product');
  prodSel.innerHTML = products.map(p =>
    `<option value="${p.ProductID}" data-price="${p.RetailPrice}" data-name="${p.ProductName}">${p.SKU} - ${p.ProductName}</option>`
  ).join('');

  const updateNewPrice = () => {
    const opt = prodSel.options[prodSel.selectedIndex];
    document.getElementById('receipt-modal-new-price').value = opt ? Number(opt.dataset.price).toFixed(2) : '';
  };
  prodSel.onchange = updateNewPrice;
  updateNewPrice();

  renderModalItems();
  document.getElementById('receipt-edit-modal').classList.add('active');
}

function renderModalItems() {
  const tbody = document.getElementById('receipt-modal-items-body');
  if (_modalCart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:var(--text-secondary);padding:1.5rem;">No items. Add one using the button above.</td></tr>';
    document.getElementById('receipt-modal-grand-total').textContent = '&#8358;0.00';
    return;
  }

  tbody.innerHTML = _modalCart.map((item, i) => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td class="text-center">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <button type="button" class="btn-qty" data-action="dec" data-i="${i}">&#8722;</button>
          <span style="min-width:28px;text-align:center;font-weight:700;">${item.qty}</span>
          <button type="button" class="btn-qty" data-action="inc" data-i="${i}">+</button>
        </div>
      </td>
      <td class="text-right" style="color:var(--text-secondary);">&#8358;${Number(item.price).toFixed(2)}</td>
      <td class="text-right" style="font-weight:700;">&#8358;${Number(item.subtotal).toFixed(2)}</td>
      <td class="text-center">
        <button type="button" class="btn-remove" data-action="del" data-i="${i}">&#10005;</button>
      </td>
    </tr>`).join('');

  const total = _modalCart.reduce((s, it) => s + it.subtotal, 0);
  document.getElementById('receipt-modal-grand-total').textContent = '&#8358;' + total.toFixed(2);
}

function initReceiptEditModal() {
  const modal = document.getElementById('receipt-edit-modal');
  if (!modal) return;

  const closeModal = () => {
    modal.classList.remove('active');
    document.getElementById('receipt-modal-add-row').style.display = 'none';
    _modalSale = null;
    _modalCart = [];
  };

  document.getElementById('receipt-modal-close').addEventListener('click', closeModal);
  document.getElementById('receipt-modal-cancel-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Print current modal state
  document.getElementById('receipt-modal-print-btn').addEventListener('click', () => {
    if (!_modalSale) return;
    // Build a snapshot with current modal edits for print preview
    const locSel = document.getElementById('receipt-modal-location');
    const locationName = locSel.options[locSel.selectedIndex]?.text || _modalSale.locationName;
    const notes = document.getElementById('receipt-modal-notes').value.trim();
    const grandTotal = _modalCart.reduce((s, it) => s + it.subtotal, 0);
    printReceiptFromRecord({
      ..._modalSale,
      locationName,
      notes,
      items: _modalCart.map(i => ({ ...i })),
      grandTotal
    });
  });

  // Item qty / delete (delegated)
  document.getElementById('receipt-modal-items-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i, 10);
    const action = btn.dataset.action;

    if (action === 'inc') {
      _modalCart[i].qty++;
      _modalCart[i].subtotal = _modalCart[i].price * _modalCart[i].qty;
    } else if (action === 'dec') {
      if (_modalCart[i].qty > 1) {
        _modalCart[i].qty--;
        _modalCart[i].subtotal = _modalCart[i].price * _modalCart[i].qty;
      } else {
        _modalCart.splice(i, 1);
      }
    } else if (action === 'del') {
      _modalCart.splice(i, 1);
    }
    renderModalItems();
  });

  // Show / hide Add Item panel
  document.getElementById('receipt-modal-add-item-btn').addEventListener('click', () => {
    const row = document.getElementById('receipt-modal-add-row');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('receipt-modal-cancel-add-btn').addEventListener('click', () => {
    document.getElementById('receipt-modal-add-row').style.display = 'none';
  });

  // Confirm Add Item
  document.getElementById('receipt-modal-confirm-add-btn').addEventListener('click', () => {
    const prodSel = document.getElementById('receipt-modal-new-product');
    const opt = prodSel.options[prodSel.selectedIndex];
    if (!opt) return;
    const qty = parseInt(document.getElementById('receipt-modal-new-qty').value, 10) || 1;
    const price = Number(opt.dataset.price) || 0;
    const productId = opt.value;
    const name = opt.dataset.name;

    const existing = _modalCart.find(it => it.productId === productId);
    if (existing) {
      existing.qty += qty;
      existing.subtotal = existing.price * existing.qty;
    } else {
      _modalCart.push({ productId, name, price, qty, subtotal: price * qty });
    }
    renderModalItems();
    document.getElementById('receipt-modal-add-row').style.display = 'none';
    document.getElementById('receipt-modal-new-qty').value = 1;
  });

  // Save Changes
  document.getElementById('receipt-modal-save-btn').addEventListener('click', async () => {
    if (!_modalSale) return;
    if (_modalCart.length === 0) { alert('Receipt must have at least one item.'); return; }

    const saveBtn = document.getElementById('receipt-modal-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const receiptId = _modalSale.receiptId;
      const locSel = document.getElementById('receipt-modal-location');
      const locationName = locSel.options[locSel.selectedIndex]?.text || _modalSale.locationName;
      const locationId = locSel.value;
      const notes = document.getElementById('receipt-modal-notes').value.trim();
      const grandTotal = _modalCart.reduce((s, it) => s + it.subtotal, 0);
      const currentUser = getCurrentUser() || { FullName: '-', UserID: '302' };

      // 1. Delete old transactions for this receipt
      await deleteTransactionsByReference(receiptId);

      // 2. Save new transactions
      for (const item of _modalCart) {
        await saveTransaction({
          ProductID: item.productId,
          TransactionType: 'Outbound',
          Quantity: item.qty,
          LocationID: locationId,
          ReferenceNumber: receiptId,
          Notes: notes,
          UserID: currentUser.UserID || '302',
          TransactionDate: new Date().toISOString()
        });
      }

      // 3. Build updated record
      const updatedRecord = {
        ..._modalSale,
        locationName,
        notes,
        items: _modalCart.map(i => ({ ...i })),
        grandTotal,
        edited: true
        // dateTime intentionally kept from original
      };

      // 4. Replace in history
      const history = getSalesHistory();
      const idx = history.findIndex(r => r.receiptId === receiptId);
      if (idx !== -1) {
        history[idx] = updatedRecord;
      } else {
        history.unshift(updatedRecord);
      }
      localStorage.setItem(SALES_HISTORY_KEY, JSON.stringify(history));

      // 5. Update modal state
      _modalSale = updatedRecord;

      // 6. Re-render history table
      renderSalesHistoryView();

      // 7. Print updated receipt
      printReceiptFromRecord(updatedRecord);

      alert('Receipt updated successfully!');
      closeModal();

    } catch (err) {
      console.error('Receipt save error:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

// ─── APPLICATION BOOTSTRAP ────────────────────────────────────────────────────

async function boot() {
  await initDB();

  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  runAlertEngine();
  initNavigation();
  initUIEvents();
  initScanner();
  initRoleSwitcher();
  initResetButton();
  initLogoutButton();
  initSyncButton();
  initClearSalesHistoryButton();
  initReceiptEditModal();

  updateUserDisplay(user);
  updateDatabaseStatusDisplay();

  const defaultView = VIEWS.find(v => v.id === 'dashboard-view');
  if (defaultView?.onEnter) defaultView.onEnter();

  console.log('%c StockSentinel booted successfully ', 'background:#0ea5e9; color:#fff; font-weight:bold; border-radius:4px; padding:4px 8px;');
  console.log('Database:', getDBStatus().message);
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(error => {
    console.error('StockSentinel failed to boot:', error);
    alert('StockSentinel could not start. Check the console for details.');
  });
});
