// app.js - StockSentinel Application Entry Point & Navigation Router

import { initDB, resetDB, getCurrentUser, getUsers, setCurrentUser, getDBStatus } from './db.js';
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
    onEnter: () => {}
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

/**
 * Navigates to a view by its ID. Handles enter/leave callbacks,
 * updates the page title, and toggles active states on nav items.
 * @param {string} viewId - The ID of the target view section
 */
function navigateTo(viewId) {
  if (viewId === currentViewId) return;

  // Trigger onLeave for previous view if defined
  const prevView = VIEWS.find(v => v.id === currentViewId);
  if (prevView?.onLeave) prevView.onLeave();

  // Hide all views
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

  // Show target view
  const targetEl = document.getElementById(viewId);
  if (targetEl) {
    targetEl.classList.add('active');
    currentViewId = viewId;
  }

  // Update page title and subtitle
  const targetView = VIEWS.find(v => v.id === viewId);
  if (targetView) {
    const titleEl = document.getElementById('view-title');
    const subtitleEl = document.getElementById('view-subtitle');
    if (titleEl) titleEl.textContent = targetView.title;
    if (subtitleEl) subtitleEl.textContent = targetView.subtitle;
  }

  // Update active state on sidebar nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  // Update active state on mobile nav items
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  // Trigger onEnter for new view
  if (targetView?.onEnter) targetView.onEnter();
}

/**
 * Attaches click navigation handlers to all sidebar and mobile nav items.
 */
function initNavigation() {
  // Desktop sidebar nav
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(item.dataset.view);
      }
    });
  });

  // Mobile bottom nav
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
    // Re-render current view to reflect permission changes
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

/**
 * Re-triggers the current view's onEnter to refresh rendered content
 * after permission changes (role switch).
 */
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

      // Reset role buttons to match default Admin
      document.getElementById('role-admin-btn')?.classList.add('active');
      document.getElementById('role-worker-btn')?.classList.remove('active');

      // Re-run alert engine
      runAlertEngine();

      // Reload current view
      refreshCurrentView();

      // Show brief feedback
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

// ─── SALES HISTORY VIEW ───────────────────────────────────────────────────────

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
      <td>₦${Number(item.price).toFixed(2)}</td>
      <td>₦${Number(item.subtotal).toFixed(2)}</td>
    </tr>`).join('');

  const printWindow = window.open('', '_blank', 'height=640,width=820');
  printWindow.document.write(`
    <html>
    <head>
      <title>Receipt — ${sale.receiptId}</title>
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
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #f0f4f8; padding: 9px 10px; text-align: left; font-size: 0.85rem; border-bottom: 1px solid #ddd; }
        td { padding: 8px 10px; font-size: 0.88rem; border-bottom: 1px solid #f0f0f0; }
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
      <div class="receipt-id">Receipt #${sale.receiptId}</div>
      <hr class="divider">
      <p class="meta"><strong>Location:</strong> ${sale.locationName}</p>
      <p class="meta"><strong>Date:</strong> ${sale.dateTime}</p>
      ${sale.notes ? `<p class="meta"><strong>Notes:</strong> ${sale.notes}</p>` : ''}
      <table>
        <thead>
          <tr>
            <th>Item</th><th style="text-align:center;">Qty</th><th>Price</th><th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="3">Grand Total</td>
            <td>₦${Number(sale.grandTotal).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <p>Thank you for your purchase! 🙏</p>
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
        <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;">
          ${sale.receiptId}
        </code>
      </td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${sale.dateTime}</td>
      <td style="font-size: 0.85rem;">${sale.locationName}</td>
      <td>
        <span class="badge badge-success">${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</span>
      </td>
      <td class="text-right" style="font-weight: 700; color: var(--color-success);">
        ₦${Number(sale.grandTotal).toFixed(2)}
      </td>
      <td style="font-size: 0.82rem; color: var(--text-secondary);">${sale.notes || '—'}</td>
      <td class="text-center">
        <button
          class="btn btn-secondary btn-sm"
          id="reprint-btn-${idx}"
          onclick="window._reprintSale(${idx})"
        >🖨️ Reprint</button>
      </td>
    </tr>`).join('');

  // Expose reprint handler globally for inline onclick
  window._reprintSale = (idx) => {
    const h = getSalesHistory();
    if (h[idx]) printReceiptFromRecord(h[idx]);
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

// ─── APPLICATION BOOTSTRAP ────────────────────────────────────────────────────

async function boot() {
  // 1. Initialize the database (seeds localStorage if empty)
  await initDB();

  // Enforce login
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  // 2. Run the alert engine to populate notification log on first load
  runAlertEngine();

  // 3. Initialize navigation routing
  initNavigation();

  // 4. Initialize all UI event listeners (forms, modals, filters, tabs)
  initUIEvents();

  // 5. Initialize the barcode/QR scanner module
  initScanner();

  // 6. Initialize the role switcher
  initRoleSwitcher();

  // 7. Initialize the reset button handler
  initResetButton();

  // 7.5. Initialize the logout button handler
  initLogoutButton();

  // 8. Initialize the manual database sync handler
  initSyncButton();

  // 9. Initialize clear sales history button
  initClearSalesHistoryButton();

  // 9. Display current user profile in the sidebar
  updateUserDisplay(user);
  updateDatabaseStatusDisplay();

  // 10. Render the default landing view (Dashboard)
  const defaultView = VIEWS.find(v => v.id === 'dashboard-view');
  if (defaultView?.onEnter) defaultView.onEnter();

  console.log('%c StockSentinel booted successfully ', 'background:#0ea5e9; color:#fff; font-weight:bold; border-radius:4px; padding:4px 8px;');
  console.log('Database:', getDBStatus().message);
}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  boot().catch(error => {
    console.error('StockSentinel failed to boot:', error);
    alert('StockSentinel could not start. Check the console for details.');
  });
});
