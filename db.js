// db.js - Local/Cloud Database & Business Logic Layer for StockSentinel

import { SUPABASE_CONFIG } from './supabase-config.js';

// Define local storage keys
const KEYS = {
  SUPPLIERS: 'stocksentinel_suppliers',
  PRODUCTS: 'stocksentinel_products',
  LOCATIONS: 'stocksentinel_locations',
  USERS: 'stocksentinel_users',
  TRANSACTIONS: 'stocksentinel_transactions',
  CURRENT_USER: 'stocksentinel_current_user'
};

const TABLES = {
  SUPPLIERS: 'suppliers',
  PRODUCTS: 'products',
  LOCATIONS: 'locations',
  USERS: 'users',
  TRANSACTIONS: 'transactions'
};

let supabaseClient = null;
let dbStatus = {
  provider: 'localStorage',
  remoteEnabled: false,
  message: 'Using local browser storage'
};

// Helper: load from localStorage
function loadData(key, fallback = []) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
}

// Helper: save to localStorage
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function seedLocalStorageIfEmpty() {
  if (!localStorage.getItem(KEYS.SUPPLIERS)) saveData(KEYS.SUPPLIERS, SEED_SUPPLIERS);
  if (!localStorage.getItem(KEYS.PRODUCTS)) saveData(KEYS.PRODUCTS, SEED_PRODUCTS);
  if (!localStorage.getItem(KEYS.LOCATIONS)) saveData(KEYS.LOCATIONS, SEED_LOCATIONS);
  if (!localStorage.getItem(KEYS.USERS)) saveData(KEYS.USERS, SEED_USERS);
  if (!localStorage.getItem(KEYS.TRANSACTIONS)) saveData(KEYS.TRANSACTIONS, SEED_TRANSACTIONS);
  if (!localStorage.getItem(KEYS.CURRENT_USER)) saveData(KEYS.CURRENT_USER, SEED_USERS[0]);
}

function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_CONFIG?.enabled &&
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_REF') &&
    !SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE_ANON_KEY')
  );
}

async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (typeof window === 'undefined') return null;
  if (supabaseClient) return supabaseClient;

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  return supabaseClient;
}

async function loadCloudCollection({ table, key, seed, orderBy }) {
  const client = await getSupabaseClient();
  if (!client) return;

  let query = client.from(table).select('*');
  if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });

  const { data, error } = await query;
  if (error) throw error;

  if (!data || data.length === 0) {
    const { error: seedError } = await client.from(table).insert(seed);
    if (seedError) throw seedError;
    saveData(key, seed);
    return;
  }

  saveData(key, data);
}

async function persistRecord(table, record, idField) {
  const client = await getSupabaseClient();
  if (!client) return;

  const id = record[idField];
  const { data, error: updateError } = await client
    .from(table)
    .update(record)
    .eq(idField, id)
    .select(idField);

  if (updateError) throw updateError;
  if (data && data.length > 0) return;

  const { error: insertError } = await client.from(table).insert(record);
  if (insertError) throw insertError;
}

async function deleteRecord(table, idField, id) {
  const client = await getSupabaseClient();
  if (!client) return;

  const { error } = await client.from(table).delete().eq(idField, id);
  if (error) throw error;
}

async function resetCloudToSeed() {
  const client = await getSupabaseClient();
  if (!client) return;

  const deletes = [
    [TABLES.TRANSACTIONS, 'TransactionID'],
    [TABLES.PRODUCTS, 'ProductID'],
    [TABLES.USERS, 'UserID'],
    [TABLES.LOCATIONS, 'LocationID'],
    [TABLES.SUPPLIERS, 'SupplierID']
  ];

  for (const [table, idField] of deletes) {
    const { error } = await client.from(table).delete().neq(idField, '__never_matches__');
    if (error) throw error;
  }

  const inserts = [
    [TABLES.SUPPLIERS, SEED_SUPPLIERS],
    [TABLES.LOCATIONS, SEED_LOCATIONS],
    [TABLES.USERS, SEED_USERS],
    [TABLES.PRODUCTS, SEED_PRODUCTS],
    [TABLES.TRANSACTIONS, SEED_TRANSACTIONS]
  ];

  for (const [table, seed] of inserts) {
    const { error } = await client.from(table).insert(seed);
    if (error) throw error;
  }
}

function logCloudError(action, error) {
  console.error(`StockSentinel cloud persistence failed during ${action}:`, error);
  dbStatus = {
    provider: 'localStorage',
    remoteEnabled: false,
    message: `Cloud sync failed during ${action}. Using local browser storage.`
  };
}

// Initial Seed Data
const SEED_SUPPLIERS = [
  { SupplierID: '1', SupplierName: 'TechDepot Solutions', ContactName: 'Alice Vance', Email: 'alice@techdepot.com', PhoneNumber: '+1-555-0199', PaymentTerms: 'Net 30', AvgLeadTime: 4, MaxLeadTime: 7 },
  { SupplierID: '2', SupplierName: 'OfficeComfort Wholesale', ContactName: 'Bob Sterling', Email: 'bob@comfort.com', PhoneNumber: '+1-555-0122', PaymentTerms: 'Net 15', AvgLeadTime: 6, MaxLeadTime: 10 },
  { SupplierID: '3', SupplierName: 'LinkLogistics Hardware', ContactName: 'Charlie Root', Email: 'charlie@link.com', PhoneNumber: '+1-555-0144', PaymentTerms: 'COD', AvgLeadTime: 3, MaxLeadTime: 5 }
];

const SEED_LOCATIONS = [
  { LocationID: '101', LocationName: 'Warehouse Bin A-12', LocationType: 'Warehouse', IsActive: true },
  { LocationID: '102', LocationName: 'Showroom Floor B-03', LocationType: 'Showroom', IsActive: true },
  { LocationID: '103', LocationName: 'Storage Room C (Rear)', LocationType: 'Storage Room', IsActive: true }
];

const SEED_PRODUCTS = [
  { ProductID: '201', SKU: 'TECH-MSE-100', ProductName: 'Wireless Mouse MS100', Category: 'Electronics', UnitCost: 15.00, RetailPrice: 35.00, ReorderThreshold: 15, SupplierID: '1', LocationID: '101', IsActive: true },
  { ProductID: '202', SKU: 'TECH-KEY-200', ProductName: 'Mechanical Keyboard KB200', Category: 'Electronics', UnitCost: 45.00, RetailPrice: 95.00, ReorderThreshold: 8, SupplierID: '1', LocationID: '101', IsActive: true },
  { ProductID: '203', SKU: 'ACC-HUB-030', ProductName: 'USB-C Hub Multi-port', Category: 'Accessories', UnitCost: 12.50, RetailPrice: 29.99, ReorderThreshold: 10, SupplierID: '3', LocationID: '102', IsActive: true },
  { ProductID: '204', SKU: 'FUR-CHR-400', ProductName: 'Ergonomic Office Chair', Category: 'Furniture', UnitCost: 120.00, RetailPrice: 249.00, ReorderThreshold: 4, SupplierID: '2', LocationID: '103', IsActive: true },
  { ProductID: '205', SKU: 'TECH-MON-270', ProductName: '4K UHD Monitor 27"', Category: 'Electronics', UnitCost: 180.00, RetailPrice: 349.99, ReorderThreshold: 5, SupplierID: '1', LocationID: '101', IsActive: true }
];

const SEED_USERS = [
  { UserID: '301', FullName: 'Sarah Connor', Email: 'sarah@stocksentinel.com', Role: 'Admin' },
  { UserID: '302', FullName: 'John Doe', Email: 'john@stocksentinel.com', Role: 'Worker' }
];

// Seed transactions to establish historical data for ROP/SS calculations
// Today is May 23, 2026. Seed data ranges from May 1 to May 22, 2026.
const SEED_TRANSACTIONS = [
  // Product 201: Wireless Mouse. Inbound 50. Outbound 41. Stock: 9. Threshold: 15
  { TransactionID: 't1', TransactionDate: '2026-05-01T08:00:00.000Z', ProductID: '201', LocationID: '101', UserID: '301', TransactionType: 'Inbound', Quantity: 50, ReferenceNumber: 'PO-10001', Notes: 'Initial bulk supply' },
  { TransactionID: 't2', TransactionDate: '2026-05-10T14:30:00.000Z', ProductID: '201', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 10, ReferenceNumber: 'SO-20001', Notes: 'Store stock replenishment' },
  { TransactionID: 't3', TransactionDate: '2026-05-12T11:00:00.000Z', ProductID: '201', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 5, ReferenceNumber: 'SO-20002', Notes: 'Customer sales' },
  { TransactionID: 't4', TransactionDate: '2026-05-15T16:15:00.000Z', ProductID: '201', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 12, ReferenceNumber: 'SO-20003', Notes: 'Customer sales' },
  { TransactionID: 't5', TransactionDate: '2026-05-18T09:45:00.000Z', ProductID: '201', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 8, ReferenceNumber: 'SO-20004', Notes: 'Direct online order shipment' },
  { TransactionID: 't6', TransactionDate: '2026-05-21T15:20:00.000Z', ProductID: '201', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 6, ReferenceNumber: 'SO-20005', Notes: 'Customer walk-in sales' },

  // Product 202: Keyboard. Inbound 20. Outbound 12. Stock: 8. Threshold: 8
  { TransactionID: 't7', TransactionDate: '2026-05-02T09:00:00.000Z', ProductID: '202', LocationID: '101', UserID: '301', TransactionType: 'Inbound', Quantity: 20, ReferenceNumber: 'PO-10002', Notes: 'Initial keyboard stock' },
  { TransactionID: 't8', TransactionDate: '2026-05-11T10:30:00.000Z', ProductID: '202', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 3, ReferenceNumber: 'SO-20006', Notes: 'Customer order' },
  { TransactionID: 't9', TransactionDate: '2026-05-14T13:00:00.000Z', ProductID: '202', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 2, ReferenceNumber: 'SO-20007', Notes: 'Customer order' },
  { TransactionID: 't10', TransactionDate: '2026-05-19T14:50:00.000Z', ProductID: '202', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 4, ReferenceNumber: 'SO-20008', Notes: 'Office supply request' },
  { TransactionID: 't11', TransactionDate: '2026-05-22T17:00:00.000Z', ProductID: '202', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 3, ReferenceNumber: 'SO-20009', Notes: 'Walk-in sales' },

  // Product 203: USB Hub. Inbound 30. Outbound 9. Stock: 21. Threshold: 10
  { TransactionID: 't12', TransactionDate: '2026-05-03T10:00:00.000Z', ProductID: '203', LocationID: '102', UserID: '301', TransactionType: 'Inbound', Quantity: 30, ReferenceNumber: 'PO-10003', Notes: 'Bulk hub delivery' },
  { TransactionID: 't13', TransactionDate: '2026-05-12T12:00:00.000Z', ProductID: '203', LocationID: '102', UserID: '302', TransactionType: 'Outbound', Quantity: 4, ReferenceNumber: 'SO-20010', Notes: 'Showroom purchase' },
  { TransactionID: 't14', TransactionDate: '2026-05-16T15:30:00.000Z', ProductID: '203', LocationID: '102', UserID: '302', TransactionType: 'Outbound', Quantity: 5, ReferenceNumber: 'SO-20011', Notes: 'Bulk dispatch to local retail partner' },

  // Product 204: Ergonomic Chair. Inbound 10. Outbound 4. Stock: 6. Threshold: 4
  { TransactionID: 't15', TransactionDate: '2026-05-04T11:00:00.000Z', ProductID: '204', LocationID: '103', UserID: '301', TransactionType: 'Inbound', Quantity: 10, ReferenceNumber: 'PO-10004', Notes: 'Storage stock office furniture' },
  { TransactionID: 't16', TransactionDate: '2026-05-13T16:00:00.000Z', ProductID: '204', LocationID: '103', UserID: '302', TransactionType: 'Outbound', Quantity: 2, ReferenceNumber: 'SO-20012', Notes: 'Showroom display replacement' },
  { TransactionID: 't17', TransactionDate: '2026-05-20T10:00:00.000Z', ProductID: '204', LocationID: '103', UserID: '302', TransactionType: 'Outbound', Quantity: 2, ReferenceNumber: 'SO-20013', Notes: 'Customer shipment' },

  // Product 205: Monitor. Inbound 8. Outbound 8. Stock: 0. Threshold: 5
  { TransactionID: 't18', TransactionDate: '2026-05-05T12:00:00.000Z', ProductID: '205', LocationID: '101', UserID: '301', TransactionType: 'Inbound', Quantity: 8, ReferenceNumber: 'PO-10005', Notes: 'High-end display imports' },
  { TransactionID: 't19', TransactionDate: '2026-05-14T11:30:00.000Z', ProductID: '205', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 2, ReferenceNumber: 'SO-20014', Notes: 'Corporate delivery' },
  { TransactionID: 't20', TransactionDate: '2026-05-18T14:00:00.000Z', ProductID: '205', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 3, ReferenceNumber: 'SO-20015', Notes: 'Office setup dispatch' },
  { TransactionID: 't21', TransactionDate: '2026-05-22T16:45:00.000Z', ProductID: '205', LocationID: '101', UserID: '302', TransactionType: 'Outbound', Quantity: 3, ReferenceNumber: 'SO-20016', Notes: 'Online customer sale. Stock is now empty.' }
];

// Initialize Database on module load
export async function initDB() {
  seedLocalStorageIfEmpty();

  if (!isSupabaseConfigured()) {
    dbStatus = {
      provider: 'localStorage',
      remoteEnabled: false,
      message: 'Using local browser storage. Add Supabase credentials to enable cloud persistence.'
    };
    return dbStatus;
  }

  try {
    await loadCloudCollection({ table: TABLES.SUPPLIERS, key: KEYS.SUPPLIERS, seed: SEED_SUPPLIERS, orderBy: { column: 'SupplierName' } });
    await loadCloudCollection({ table: TABLES.LOCATIONS, key: KEYS.LOCATIONS, seed: SEED_LOCATIONS, orderBy: { column: 'LocationName' } });
    await loadCloudCollection({ table: TABLES.USERS, key: KEYS.USERS, seed: SEED_USERS, orderBy: { column: 'FullName' } });
    await loadCloudCollection({ table: TABLES.PRODUCTS, key: KEYS.PRODUCTS, seed: SEED_PRODUCTS, orderBy: { column: 'SKU' } });
    await loadCloudCollection({ table: TABLES.TRANSACTIONS, key: KEYS.TRANSACTIONS, seed: SEED_TRANSACTIONS, orderBy: { column: 'TransactionDate', ascending: false } });

    dbStatus = {
      provider: 'Supabase',
      remoteEnabled: true,
      message: 'Connected to Supabase cloud database'
    };
  } catch (error) {
    logCloudError('initialization', error);
  }

  return dbStatus;
}

// Reset Database function (for utility and fresh testing)
export async function resetDB() {
  localStorage.removeItem(KEYS.SUPPLIERS);
  localStorage.removeItem(KEYS.PRODUCTS);
  localStorage.removeItem(KEYS.LOCATIONS);
  localStorage.removeItem(KEYS.USERS);
  localStorage.removeItem(KEYS.TRANSACTIONS);
  localStorage.removeItem(KEYS.CURRENT_USER);
  seedLocalStorageIfEmpty();

  if (isSupabaseConfigured()) {
    try {
      await resetCloudToSeed();
    } catch (error) {
      logCloudError('reset', error);
    }
  }
}

export function getDBStatus() {
  return dbStatus;
}

// --- CURRENT USER & ROLES ---
export function getCurrentUser() {
  return loadData(KEYS.CURRENT_USER, SEED_USERS[0]);
}

export function setCurrentUser(userId) {
  const users = getUsers();
  const user = users.find(u => u.UserID === userId);
  if (user) {
    saveData(KEYS.CURRENT_USER, user);
    return user;
  }
  return null;
}

export function getUsers() {
  return loadData(KEYS.USERS, SEED_USERS);
}

// --- SUPPLIERS ---
export function getSuppliers() {
  return loadData(KEYS.SUPPLIERS, SEED_SUPPLIERS);
}

export async function saveSupplier(supplier) {
  const suppliers = getSuppliers();
  supplier.AvgLeadTime = Number(supplier.AvgLeadTime) || 5;
  supplier.MaxLeadTime = Number(supplier.MaxLeadTime) || 8;

  if (supplier.SupplierID) {
    const idx = suppliers.findIndex(s => s.SupplierID === supplier.SupplierID);
    if (idx !== -1) {
      suppliers[idx] = { ...suppliers[idx], ...supplier };
    }
  } else {
    supplier.SupplierID = 's_' + Date.now();
    suppliers.push(supplier);
  }
  saveData(KEYS.SUPPLIERS, suppliers);
  try {
    await persistRecord(TABLES.SUPPLIERS, supplier, 'SupplierID');
  } catch (error) {
    logCloudError('supplier save', error);
  }
  return supplier;
}

export async function deleteSupplier(id) {
  let suppliers = getSuppliers();
  suppliers = suppliers.filter(s => s.SupplierID !== id);
  saveData(KEYS.SUPPLIERS, suppliers);
  try {
    await deleteRecord(TABLES.SUPPLIERS, 'SupplierID', id);
  } catch (error) {
    logCloudError('supplier delete', error);
  }
}

// --- LOCATIONS ---
export function getLocations() {
  return loadData(KEYS.LOCATIONS, SEED_LOCATIONS);
}

export async function saveLocation(location) {
  const locations = getLocations();
  if (location.LocationID) {
    const idx = locations.findIndex(l => l.LocationID === location.LocationID);
    if (idx !== -1) {
      locations[idx] = { ...locations[idx], ...location };
    }
  } else {
    location.LocationID = 'l_' + Date.now();
    location.IsActive = true;
    locations.push(location);
  }
  saveData(KEYS.LOCATIONS, locations);
  try {
    await persistRecord(TABLES.LOCATIONS, location, 'LocationID');
  } catch (error) {
    logCloudError('location save', error);
  }
  return location;
}

export async function deleteLocation(id) {
  let locations = getLocations();
  locations = locations.filter(l => l.LocationID !== id);
  saveData(KEYS.LOCATIONS, locations);
  try {
    await deleteRecord(TABLES.LOCATIONS, 'LocationID', id);
  } catch (error) {
    logCloudError('location delete', error);
  }
}

// --- PRODUCTS ---
export function getProducts() {
  return loadData(KEYS.PRODUCTS, SEED_PRODUCTS);
}

export function getProductBySKU(sku) {
  const products = getProducts();
  return products.find(p => p.SKU.trim().toUpperCase() === sku.trim().toUpperCase());
}

export async function saveProduct(product) {
  const products = getProducts();
  product.UnitCost = Number(product.UnitCost) || 0;
  product.RetailPrice = Number(product.RetailPrice) || 0;
  product.ReorderThreshold = Number(product.ReorderThreshold) || 0;

  if (product.ProductID) {
    const idx = products.findIndex(p => p.ProductID === product.ProductID);
    if (idx !== -1) {
      products[idx] = { ...products[idx], ...product };
    }
  } else {
    product.ProductID = 'p_' + Date.now();
    product.IsActive = true;
    products.push(product);
  }
  saveData(KEYS.PRODUCTS, products);
  try {
    await persistRecord(TABLES.PRODUCTS, product, 'ProductID');
  } catch (error) {
    logCloudError('product save', error);
  }
  return product;
}

export async function deleteProduct(id) {
  let products = getProducts();
  products = products.filter(p => p.ProductID !== id);
  saveData(KEYS.PRODUCTS, products);
  try {
    await deleteRecord(TABLES.PRODUCTS, 'ProductID', id);
  } catch (error) {
    logCloudError('product delete', error);
  }
}

// --- TRANSACTIONS & INVENTORY LOGIC ---
export function getTransactions() {
  return loadData(KEYS.TRANSACTIONS, SEED_TRANSACTIONS);
}

export async function saveTransaction(tx) {
  const transactions = getTransactions();
  tx.TransactionID = tx.TransactionID || 't_' + Date.now();
  tx.TransactionDate = tx.TransactionDate || new Date().toISOString();
  tx.Quantity = Number(tx.Quantity) || 0;
  transactions.push(tx);
  saveData(KEYS.TRANSACTIONS, transactions);
  try {
    await persistRecord(TABLES.TRANSACTIONS, tx, 'TransactionID');
  } catch (error) {
    logCloudError('transaction save', error);
  }
  return tx;
}

/**
 * Calculates current stock of a product dynamically by aggregating transactions.
 * Inventory = sum(Inbound) - sum(Outbound) +/- sum(Adjustment)
 */
export function getProductInventory(productId) {
  const transactions = getTransactions();
  let total = 0;
  transactions.forEach(tx => {
    if (tx.ProductID === productId) {
      if (tx.TransactionType === 'Inbound') {
        total += tx.Quantity;
      } else if (tx.TransactionType === 'Outbound') {
        total -= tx.Quantity;
      } else if (tx.TransactionType === 'Adjustment') {
        // Adjustments can be positive (stock-up) or negative (stock-down)
        total += tx.Quantity; 
      }
    }
  });
  return Math.max(0, total); // Inventory cannot be negative, though anomalies might occur
}

/**
 * Calculates total valuation: sum(Inventory per product * UnitCost per product)
 */
export function getInventoryValuation() {
  const products = getProducts();
  let totalCostValuation = 0;
  let totalRetailValuation = 0;
  products.forEach(p => {
    if (p.IsActive) {
      const qty = getProductInventory(p.ProductID);
      totalCostValuation += qty * p.UnitCost;
      totalRetailValuation += qty * p.RetailPrice;
    }
  });
  return { cost: totalCostValuation, retail: totalRetailValuation };
}

/**
 * Calculates ROP (Reorder Point) and Safety Stock (SS) based on transactions and lead times.
 * Formulas:
 *   ROP = (ADUS * LT) + SS
 *   SS = (MDS * MLT) - (ADUS * ALT)
 * Where:
 *   ADUS = Average Daily Unit Sales (over a 14-day history window)
 *   MDS = Max Daily Unit Sales (highest daily sale in that window)
 *   ALT = Average Lead Time (from Supplier, fallback to 5 days)
 *   MLT = Max Lead Time (from Supplier, fallback to 8 days)
 */
export function calculateROPAndSS(productId) {
  const product = getProducts().find(p => p.ProductID === productId);
  if (!product) return { rop: 0, safetyStock: 0, adus: 0, mds: 0, alt: 5, mlt: 8, calculated: false };

  // Fetch supplier lead times
  const suppliers = getSuppliers();
  const supplier = suppliers.find(s => s.SupplierID === product.SupplierID);
  const alt = supplier ? Number(supplier.AvgLeadTime) || 5 : 5;
  const mlt = supplier ? Number(supplier.MaxLeadTime) || 8 : 8;

  // Calculate Average Daily Unit Sales (ADUS) and Max Daily Sales (MDS) over a 30-day window
  const transactions = getTransactions();
  const now = new Date('2026-05-23T12:00:00.000Z'); // Pin to current PRD runtime date
  const windowDays = 30;
  const cutoffDate = new Date(now.getTime() - (windowDays * 24 * 60 * 60 * 1000));

  // Map of date-string -> quantity sold
  const dailySalesMap = {};
  
  // Initialize daily sales map for all days in the window with 0
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(cutoffDate.getTime() + (i * 24 * 60 * 60 * 1000));
    const dateStr = d.toISOString().split('T')[0];
    dailySalesMap[dateStr] = 0;
  }

  let totalSales = 0;
  transactions.forEach(tx => {
    if (tx.ProductID === productId && tx.TransactionType === 'Outbound') {
      const txDate = new Date(tx.TransactionDate);
      if (txDate >= cutoffDate) {
        const dateStr = tx.TransactionDate.split('T')[0];
        if (dailySalesMap[dateStr] !== undefined) {
          dailySalesMap[dateStr] += tx.Quantity;
        } else {
          dailySalesMap[dateStr] = tx.Quantity;
        }
        totalSales += tx.Quantity;
      }
    }
  });

  const dailyQuantities = Object.values(dailySalesMap);
  const adus = totalSales / windowDays;
  const mds = dailyQuantities.length > 0 ? Math.max(...dailyQuantities) : 0;

  // ROP & SS calculations
  // SS = (MDS * MLT) - (ADUS * ALT)
  const safetyStock = Math.max(0, Math.ceil((mds * mlt) - (adus * alt)));
  // ROP = (ADUS * ALT) + SS
  const rop = Math.ceil((adus * alt) + safetyStock);

  // Return both calculated formula values, and fallback to manual Product.ReorderThreshold if no sales data exists
  return {
    rop: totalSales > 0 ? rop : product.ReorderThreshold,
    safetyStock: totalSales > 0 ? safetyStock : Math.ceil(product.ReorderThreshold * 0.4),
    adus: Number(adus.toFixed(2)),
    mds: mds,
    alt: alt,
    mlt: mlt,
    calculated: totalSales > 0
  };
}

/**
 * Returns dynamic alert status for a product.
 * Returns:
 *   - 'CRITICAL' if stock is 0
 *   - 'LOW_STOCK' if stock <= ROP
 *   - 'OK' otherwise
 */
export function getProductAlertStatus(productId) {
  const stock = getProductInventory(productId);
  if (stock === 0) return 'CRITICAL';
  
  const calc = calculateROPAndSS(productId);
  if (stock <= calc.rop) return 'LOW_STOCK';
  
  return 'OK';
}
