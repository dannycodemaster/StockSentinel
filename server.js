// server.js – Express server that serves static assets and proxies Alpha Vantage
import express from 'express';
import nodemailer from 'nodemailer';



import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.post('/api/send-invoice', async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId required' });
  try {
    const { getProductBySKU, getSuppliers } = await import('./db.js');
    const product = getProductBySKU(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const suppliers = getSuppliers();
    const supplier = suppliers.find(s => s.SupplierID === product.SupplierID);
    if (!supplier || !supplier.Email) return res.status(404).json({ error: 'Supplier email not found' });
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password'
      }
    });
    const mailOptions = {
      from: process.env.SMTP_FROM || 'no-reply@stocksentinel.com',
      to: supplier.Email,
      subject: `Out‑of‑Stock Invoice for ${product.ProductName} (${product.SKU})`,
      html: `<p>Dear ${supplier.SupplierName || 'Supplier'},</p>
        <p>The following item is out of stock and requires immediate replenishment:</p>
        <ul>
          <li><strong>Product:</strong> ${product.ProductName}</li>
          <li><strong>SKU:</strong> ${product.SKU}</li>
          <li><strong>Current Stock:</strong> 0</li>
        </ul>
        <p>Please arrange shipment and confirm the expected delivery date.</p>
        <p>Best regards,<br/>StockSentinel Admin</p>`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('Invoice email sent:', info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('Error sending invoice email:', e);
    res.status(500).json({ error: 'Failed to send email' });
  }
});



app.post('/api/send-order', async (req, res) => {
  const { supplierId } = req.body;
  if (!supplierId) {
    return res.status(400).json({ error: 'supplierId required' });
  }
  try {
    // Placeholder logic: In real implementation, create purchase order record.
    console.log('Send order request for supplier', supplierId);
    // For now, just respond success.
    res.json({ success: true, message: `Order request sent to supplier ${supplierId}` });
  } catch (e) {
    console.error('Error in send-order:', e);
    res.status(500).json({ error: 'Failed to process order' });
  }
});

// ---------- Static file serving (HTML, CSS, JS, etc.) ----------
app.use(express.static(path.join(__dirname)));

// ---------- Alpha Vantage proxy endpoint ----------
app.get('/api/quote/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) {
    return res.status(500).json({ error: 'API key not configured in .env' });
  }
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Alpha Vantage fetch error:', e);
    res.status(500).json({ error: 'Failed to retrieve quote' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Express server running at http://localhost:${PORT}`);
});
