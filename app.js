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

// ─── APPLICATION BOOTSTRAP ────────────────────────────────────────────────────

async function boot() {
  // 1. Initialize the database (seeds localStorage if empty)
  await initDB();

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

  // 8. Initialize the manual database sync handler
  initSyncButton();

  // 9. Display current user profile in the sidebar
  const user = getCurrentUser();
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
