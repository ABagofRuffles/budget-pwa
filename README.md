# QuickBudget

A Progressive Web App (PWA) for personal budget tracking and financial management. Track income, expenses, manage monthly budgets, and import transactions from bank statement PDFs. Built with vanilla JavaScript—no frameworks, no dependencies (except PDF.js for PDF parsing).

## Features

- 💰 **Transaction Tracking** - Add income and expenses with descriptions, categories, and dates
- 📊 **Budget Worksheet** - Comprehensive monthly budget planning with tabbed navigation and categories for:
  - Household Income
  - Essential Expenses (Housing, Utilities, Food, Transportation, Debt, Healthcare)
  - Discretionary Expenses (Child Care, Education, Personal Care, Clothing, Gifts, Recreation, Entertainment)
  - Other Expenses
- 📄 **PDF Import** - Upload bank statements or receipts to automatically extract transactions with intelligent categorization
- 🔍 **Search & Filter** - Real-time search by description or category, filter by transaction type (Income/Expense/All)
- 📈 **Totals Dashboard** - View income, expenses, and net balance at a glance
- 💾 **Local Storage** - All data stored locally in your browser (privacy-first, no cloud sync, no server required)
- 📱 **PWA Support** - Install as a standalone app on your device for offline access and app-like experience
- 🌓 **Dark Mode** - Automatic dark mode support based on system preferences
- 📤 **CSV Export/Import** - Export all transactions to CSV for backup or external analysis, and import CSV files to restore or merge transactions
- 🗑️ **Delete Transactions** - Remove individual transactions with one click
- ✏️ **Edit Imported Transactions** - Review and edit extracted PDF transactions before importing
- 🗑️ **Clear All Data** - Reset the app by clearing all transactions and worksheet data (with double confirmation for safety)
- 🔒 **Security Features** - Content Security Policy (CSP), Subresource Integrity (SRI), and security headers for protection against XSS and clickjacking

## Getting Started

### Running Locally

Since this is a PWA that uses service workers, you need to serve it over HTTP (not `file://`). Here are a few options:

#### Option 1: Python HTTP Server
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

#### Option 2: Node.js http-server
```bash
npx http-server -p 8000
```

#### Option 3: PHP
```bash
php -S localhost:8000
```

#### Option 4: VS Code Live Server
Install the "Live Server" extension, then right-click `index.html` and select "Open with Live Server".

### Installing as PWA

1. Open the app in a supported browser (Chrome, Edge, Safari, Firefox)
2. Look for the install prompt in the address bar, or
3. Use the browser menu: **Install QuickBudget** or **Add to Home Screen**
4. The app will work offline after installation

## File Structure

```
budget-pwa/
├── index.html          # Main HTML structure and UI with security headers
├── styles.css          # All CSS styling and dark mode support
├── script.js           # Application logic and functionality
├── manifest.json       # PWA manifest configuration
├── service-worker.js   # Service worker for offline functionality and caching
├── .gitignore          # Git ignore patterns
└── README.md           # This file
```

## Technology Stack

- **HTML5** - Semantic structure and accessibility
- **CSS3** - Modern styling with CSS variables, flexbox/grid, and automatic dark mode support
- **Vanilla JavaScript (ES6+)** - No frameworks or dependencies, pure JavaScript
- **PDF.js (v3.11.174)** - Client-side PDF text extraction for bank statement import (loaded from CDN with SRI)
- **Service Workers** - Offline functionality with hybrid caching strategy:
  - Network-first for HTML and JavaScript files (try network, fallback to cache if offline)
  - Cache-first for other assets (CSS, images, etc.)
- **LocalStorage API** - Client-side data persistence (no server required)
- **Security** - Content Security Policy (CSP), Subresource Integrity (SRI), X-Frame-Options, Referrer-Policy

## Usage

### Adding Transactions

1. Use the transaction form at the top of the page:
   - **Description** - What the transaction is for (required)
   - **Amount** - Transaction amount (required, supports decimals)
   - **Type** - Select Income (+) or Expense (-)
   - **Category** - Optional category (e.g., Groceries, Rent, Gas) - helps with organization
   - **Date** - Transaction date (defaults to today if not specified)
2. Click **Add** to save the transaction
3. View all transactions in the **Transactions** tab below
4. Transactions are automatically sorted by date (newest first)

### Importing from PDF

1. Scroll to the **Import from PDF** section (or use the menu)
2. Drag and drop a PDF file or click the upload area to browse
3. The app will automatically extract transactions from bank statements
4. Review the extracted transactions:
   - Each transaction shows description, category (auto-inferred), date, type, and amount
   - Check/uncheck transactions you want to import
   - Click **Edit** on any transaction to modify it before importing
5. Click **Add Selected Transactions** to import checked transactions
6. Use **Clear** to reset and try a different PDF

**Note:** The PDF parser works best with standard bank statement formats. It automatically categorizes transactions based on merchant names and descriptions.

### Budget Worksheet

1. Click the **Budget Worksheet** tab (or use the menu to jump to specific sections)
2. Use the sub-tabs to navigate between worksheet sections:
   - Monthly Household Income
   - Monthly Essential Expenses
   - Monthly Discretionary Expenses
   - Other Monthly Expenses
3. Fill in monthly amounts for each category
4. View automatic calculations:
   - **Subtotals** - For each category (e.g., Housing, Utilities)
   - **Section Totals** - For each major section
   - **Summary** - Overview showing Income, Essential Expenses, Discretionary Expenses, Other Expenses, and Total Expenses
5. All data is automatically saved as you type

### Importing from CSV

1. Click the **Import CSV** button in the header (or use the menu)
2. Select a CSV file exported from QuickBudget (or a compatible CSV with columns: Date, Type, Description, Category, Amount)
3. Choose how to import:
   - **Add** - Merges imported transactions with your existing data
   - **Replace** - Replaces all existing transactions with the CSV data
4. The app will validate and import valid transactions, skipping any rows with errors

**CSV Format:** The CSV should have headers: `Date`, `Type`, `Description`, `Category`, `Amount`
- Date format: YYYY-MM-DD (e.g., 2024-01-15)
- Type: `income` or `expense`
- Description: Transaction description (required)
- Category: Optional category name
- Amount: Numeric value (e.g., 45.67)

**Note:** CSV files exported from QuickBudget can be imported directly. The app handles quoted fields, escaped quotes, and sanitized fields automatically.

### Menu Navigation

Click the hamburger menu (☰) in the top-left to access:
- **Transactions** - Jump to the transactions list
- **Import PDF** - Scroll to the PDF upload section
- **Import CSV** - Import transactions from a CSV file
- **Budget Worksheet Sections** - Navigate directly to specific worksheet categories:
  - Monthly Household Income
  - Monthly Essential Expenses (with subcategories)
  - Monthly Discretionary Expenses (with subcategories)
  - Other Monthly Expenses
- **Export CSV** - Download all transactions as CSV
- **Clear All Data** - Permanently delete all transactions and worksheet data (requires double confirmation)

The menu provides quick navigation to any section of the budget worksheet, with expandable categories for easy access to specific line items.

**⚠️ Warning:** The "Clear All Data" option permanently deletes all your data. Make sure to export your data to CSV first if you want to keep a backup.

## Data Storage

All data is stored locally in your browser's localStorage:
- Transactions: `qb_txns_v1`
- Worksheet data: `qb_ws_v1`

**Important Notes:**
- Clearing browser data will delete your transactions. Consider exporting to CSV regularly for backup.
- You can restore your data by importing a previously exported CSV file (see "Importing from CSV" section).
- Data is stored per browser/device—there's no cloud sync.
- If you encounter storage quota errors, delete some old transactions or clear browser storage.

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS 11.3+)
- Any modern browser with Service Worker support

## Security

QuickBudget includes several security features to protect your data:

- **Content Security Policy (CSP)** - Prevents XSS attacks by restricting resource loading
- **Subresource Integrity (SRI)** - Ensures PDF.js library hasn't been tampered with
- **Security Headers** - X-Frame-Options, Referrer-Policy, and Permissions-Policy headers
- **Input Validation** - Date validation and sanitization to prevent injection attacks
- **Local-Only Processing** - All PDF processing happens client-side; files never leave your device

## Privacy

- All data stays in your browser
- No server, no cloud, no tracking, no analytics
- Your financial data never leaves your device
- PDF processing is done entirely client-side using PDF.js

## Development

### Service Worker Caching

The service worker implements a hybrid caching strategy:
- **HTML pages**: Network-first (updates immediately when online, works offline)
- **JavaScript files**: Network-first (ensures fresh code, falls back to cache if offline)
- **Other assets** (CSS, images): Cache-first (fast loading, updates on refresh)

Cache version is `qb-cache-v3`. To force cache updates, increment the cache version in `service-worker.js`.

**Note:** External CDN resources (like PDF.js) are not intercepted by the service worker and load directly from the CDN.

### Calculating SRI Hashes

To update the Subresource Integrity hash for PDF.js when updating versions, you can use PowerShell to calculate the SHA-512 hash:

```powershell
$url = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"
$content = Invoke-WebRequest -Uri $url -UseBasicParsing
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content.Content)
$hash = [System.Security.Cryptography.SHA512]::Create().ComputeHash($bytes)
$hashString = [Convert]::ToBase64String($hash)
Write-Host "sha512-$hashString"
```

Alternatively, you can use online SRI hash generators or browser developer tools to generate the hash.

## License

This project is open source and available for personal use.

## Contributing

Feel free to fork, modify, and use this project for your own budget tracking needs!

