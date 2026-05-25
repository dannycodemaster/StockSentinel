// scanner.js - QR/Barcode scanning integration for StockSentinel
// Integrates html5-qrcode library with fallback mock scanner

import { getProductBySKU, getLocations } from './db.js';
import { showScanResult } from './ui.js';

let html5QrCode = null;
let isScannerActive = false;

/**
 * Initializes the camera-based QR/Barcode scanner.
 * Uses the html5-qrcode library loaded via CDN in index.html.
 * Falls back gracefully if library is unavailable (e.g., desktop without camera).
 */
export function initScanner() {
  const startBtn = document.getElementById('start-camera-btn');
  const mockScanBtn = document.getElementById('mock-scan-btn');
  const mockInput = document.getElementById('mock-barcode-input');

  if (startBtn) {
    startBtn.addEventListener('click', toggleCameraScanner);
  }

  if (mockScanBtn) {
    mockScanBtn.addEventListener('click', () => handleMockScan());
  }

  if (mockInput) {
    mockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleMockScan();
      }
    });
  }

  // Quick-fill scan-tx-location dropdown
  populateScanLocationDropdown();
}

/**
 * Populates the location dropdown inside the scan result quick-action form.
 */
export function populateScanLocationDropdown() {
  const locSelect = document.getElementById('scan-tx-location');
  if (!locSelect) return;
  const locations = getLocations();
  locSelect.innerHTML = locations.map(l =>
    `<option value="${l.LocationID}">${l.LocationName}</option>`
  ).join('');
}

/**
 * Toggle camera scanner on and off.
 */
async function toggleCameraScanner() {
  const startBtn = document.getElementById('start-camera-btn');
  const placeholderText = document.getElementById('camera-placeholder-text');

  if (isScannerActive) {
    await stopCameraScanner();
    if (startBtn) startBtn.textContent = 'Enable Camera Scanning';
    return;
  }

  // Check if html5-qrcode library is available
  if (typeof Html5Qrcode === 'undefined') {
    showScannerError('Camera scanning library failed to load. Please use the simulated scan input below.');
    return;
  }

  try {
    if (placeholderText) placeholderText.style.display = 'none';
    if (startBtn) startBtn.textContent = 'Stop Camera';

    html5QrCode = new Html5Qrcode('camera-reader-element');

    const cameras = await Html5Qrcode.getCameras();
    if (!cameras || cameras.length === 0) {
      showScannerError('No cameras detected on this device. Use simulated scan instead.');
      return;
    }

    // Prefer rear/environment camera on mobile
    const cameraId = cameras.find(c => /back|rear|environment/i.test(c.label))?.id || cameras[0].id;

    await html5QrCode.start(
      cameraId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        // Success callback: decodedText is the barcode/QR value
        handleScannedCode(decodedText);
      },
      (errorMessage) => {
        // Per-frame error - suppress for smooth experience
      }
    );

    isScannerActive = true;

  } catch (err) {
    console.error('Camera scanner error:', err);
    showScannerError('Could not access camera. Please check permissions or use simulated scan.');
    if (startBtn) startBtn.textContent = 'Enable Camera Scanning';
    if (placeholderText) placeholderText.style.display = 'flex';
  }
}

/**
 * Stops the running camera scanner cleanly.
 */
async function stopCameraScanner() {
  if (html5QrCode && isScannerActive) {
    try {
      await html5QrCode.stop();
    } catch (e) { /* already stopped */ }
    html5QrCode = null;
    isScannerActive = false;

    const placeholderText = document.getElementById('camera-placeholder-text');
    if (placeholderText) placeholderText.style.display = 'flex';
  }
}

/**
 * Called when a real or mocked barcode/QR code is successfully decoded.
 * Looks up product by the decoded text as SKU and surfaces the result card.
 * @param {string} code - The scanned or entered text (treated as SKU)
 */
export function handleScannedCode(code) {
  if (!code || !code.trim()) return;

  const sku = code.trim().toUpperCase();
  const product = getProductBySKU(sku);

  if (product) {
    showScanResult(product);
    // Auto-stop camera after a successful scan
    stopCameraScanner();
    const startBtn = document.getElementById('start-camera-btn');
    if (startBtn) startBtn.textContent = 'Enable Camera Scanning';
  } else {
    showScannerError(`No product found for code: "${sku}". Check the SKU in the catalog.`);
  }
}

/**
 * Handles mock/simulated barcode scan from the text input.
 */
function handleMockScan() {
  const mockInput = document.getElementById('mock-barcode-input');
  if (!mockInput) return;
  const code = mockInput.value.trim();
  if (!code) return;

  // Animate the input to signal scan was received
  mockInput.style.borderColor = 'var(--accent-primary)';
  setTimeout(() => {
    mockInput.style.borderColor = '';
    mockInput.value = '';
  }, 600);

  handleScannedCode(code);
}

/**
 * Displays a scanner error state in the viewport.
 * @param {string} message - The human-readable error message
 */
function showScannerError(message) {
  const placeholder = document.getElementById('camera-placeholder-text');
  if (placeholder) {
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
      <svg viewBox="0 0 24 24" width="40" height="40" style="stroke: var(--color-danger); fill:none; stroke-width:1.5; margin-bottom: 0.5rem;">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="var(--color-danger)" stroke="none"/>
      </svg>
      <p style="color: var(--color-danger); font-size: 0.85rem;">${message}</p>
      <button class="btn btn-secondary btn-sm mt-2" id="start-camera-btn" onclick="document.getElementById('start-camera-btn').textContent='Enable Camera Scanning'">Try Again</button>
    `;
    // Re-attach event after innerHTML replace
    document.getElementById('start-camera-btn')?.addEventListener('click', toggleCameraScanner);
  }
}

/**
 * Stops the scanner when navigating away from the scanner view.
 * Should be called whenever the scanner view is hidden.
 */
export function cleanupScanner() {
  stopCameraScanner();
}
