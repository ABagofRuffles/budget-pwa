// ============================================================================
// STORAGE HELPERS
// ============================================================================
// LocalStorage key for transactions data
const KEY = 'qb_txns_v1';

/**
 * Validate transaction object structure to prevent malicious data injection
 * @param {*} txn - Transaction object to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateTransactionSchema(txn) {
  if (!txn || typeof txn !== 'object') return false;
  if (typeof txn.id !== 'string' || txn.id.length === 0 || txn.id.length > 100) return false;
  if (typeof txn.desc !== 'string' || txn.desc.length === 0 || txn.desc.length > 200) return false;
  if (typeof txn.amount !== 'number' || !isFinite(txn.amount) || txn.amount < 0 || txn.amount > 999999999.99) return false;
  if (txn.type !== 'income' && txn.type !== 'expense') return false;
  if (txn.cat !== undefined && (typeof txn.cat !== 'string' || txn.cat.length > 100)) return false;
  if (txn.date !== undefined && !validateDate(txn.date)) return false;
  return true;
}

/**
 * Load transactions from localStorage
 * @returns {Array} Array of transaction objects
 */
const load = () => {
  try {
    const data = localStorage.getItem(KEY);
    if (!data) {
      return [];
    }
    const parsed = JSON.parse(data);
    // Validate that data is an array
    if (!Array.isArray(parsed)) {
      console.error('[Storage] Invalid data format in localStorage: expected array');
      return [];
    }
    if (parsed.length > 0) {
      console.log('[Storage] Loaded', parsed.length, 'transaction(s)');
    }
    // Validate and filter out invalid transactions (defense against localStorage manipulation)
    const valid = parsed.filter(txn => validateTransactionSchema(txn));
    if (valid.length !== parsed.length) {
      console.warn('[Storage] Filtered out', parsed.length - valid.length, 'invalid transaction(s)');
    }
    return valid;
  } catch (e) {
    console.error('[Storage] Error loading transactions from localStorage:', e);
    // Return empty array if corrupted, allow user to continue
    return [];
  }
};

/**
 * Save transactions to localStorage
 * @param {Array} data - Array of transaction objects to save
 */
const save = (data) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please delete some transactions or clear your browser storage.');
      console.error('[Storage] localStorage quota exceeded');
    } else {
      console.error('[Storage] Error saving transactions to localStorage:', e);
      alert('Error saving data. Please try again.');
    }
  }
};

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================
// Form input elements 
const descEl = document.getElementById('desc');
const amtEl = document.getElementById('amt');
const typeEl = document.getElementById('type');
const catEl = document.getElementById('cat');
const dateEl = document.getElementById('date');
const addBtn = document.getElementById('addBtn');

// Display elements
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const filterTypeEl = document.getElementById('filterType');
const incomeTotalEl = document.getElementById('incomeTotal');
const expenseTotalEl = document.getElementById('expenseTotal');
const netTotalEl = document.getElementById('netTotal');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const csvFileInput = document.getElementById('csvFileInput');
const worksheetEl = document.getElementById('worksheet');

// Menu elements
const menuToggle = document.getElementById('menuToggle');
const sideMenu = document.getElementById('sideMenu');
const menuOverlay = document.getElementById('menuOverlay');
const closeMenuBtn = document.getElementById('closeMenuBtn');
const menuTransactions = document.getElementById('menuTransactions');
const menuPdfUpload = document.getElementById('menuPdfUpload');
const menuCsvImport = document.getElementById('menuCsvImport');
const menuWorksheetSection = document.getElementById('menuWorksheetSection');
const menuExport = document.getElementById('menuExport');
const menuClearData = document.getElementById('menuClearData');

// PDF upload elements
const pdfUploadArea = document.getElementById('pdfUploadArea');
const pdfFileInput = document.getElementById('pdfFileInput');
const pdfStatus = document.getElementById('pdfStatus');
const extractedTransactions = document.getElementById('extractedTransactions');
const pdfActions = document.getElementById('pdfActions');
const addSelectedBtn = document.getElementById('addSelectedBtn');
const clearPdfBtn = document.getElementById('clearPdfBtn');

// ============================================================================
// APPLICATION STATE
// ============================================================================
// Load transactions from storage
let txns = load();
// Temporary storage for transactions extracted from PDF
let extractedTxns = [];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================
/**
 * Validate and normalize a date string in YYYY-MM-DD format
 * Prevents date manipulation attacks by ensuring strict format validation
 * @param {string} dateStr - Date string to validate
 * @returns {string|null} Normalized date string (YYYY-MM-DD) or null if invalid
 */
function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  // Must match YYYY-MM-DD format exactly
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateStr.match(dateRegex);
  if (!match) return null;
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  
  // Validate ranges
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  // Create date and verify components match (prevents dates like 2024-02-30)
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || 
      date.getMonth() !== month - 1 || 
      date.getDate() !== day) {
    return null;
  }
  
  // Return normalized date string
  return date.toISOString().slice(0, 10);
}

/**
 * Validate that a number is finite and within acceptable range
 * @param {*} value - Value to validate
 * @param {number} max - Maximum allowed value
 * @returns {number|null} Valid number or null
 */
function validateNumber(value, max = 999999999.99) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!isFinite(num) || isNaN(num)) return null;
  if (Math.abs(num) > max) return null;
  return num;
}

// ============================================================================
// WORKSHEET STORAGE
// ============================================================================
// LocalStorage key for worksheet data
const WS_KEY = 'qb_ws_v1';
// Load worksheet data from storage (with validation to prevent malicious data)
let wsData = (() => {
  try {
    const data = localStorage.getItem(WS_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    // Validate that all values are valid numbers
    const validated = {};
    for (const key in parsed) {
      if (parsed.hasOwnProperty(key)) {
        const validatedValue = validateNumber(parsed[key]);
        validated[key] = validatedValue !== null ? validatedValue : 0;
      }
    }
    return validated;
  } catch (e) {
    console.error('Error loading worksheet data from localStorage:', e);
    return {};
  }
})();

// ============================================================================
// WORKSHEET STRUCTURE
// ============================================================================
/**
 * Defines the structure of the budget worksheet with sections, categories, and items.
 * Each section can have either:
 * - items: Simple list of items (for income and other expenses)
 * - categories: Grouped items under category headers (for essential/discretionary expenses)
 */
const WORKSHEET = [
  { title: 'Monthly Household Income', items: [
    'Primary take-home pay',
    'Secondary take-home pay',
    'Child support',
    'Alimony',
    'Other'
  ]},
  { title: 'Monthly Essential Expenses (Things You Need to Have)', categories: [
    { name: 'Housing', items: ['Mortgage or rent', 'Property taxes', 'Home/Renter\'s insurance', 'Other'] },
    { name: 'Utilities', items: ['Electricity', 'Natural gas', 'Water/Sewer', 'Cell phone', 'Internet/Cable', 'Trash'] },
    { name: 'Food', items: ['Groceries', 'Dining out', 'School/work lunches'] },
    { name: 'Transportation', items: ['Gas', 'Parking/Tolls', 'Maintenance', 'Public transportation'] },
    { name: 'Debt & Monthly Obligations', items: ['Credit card payments', 'Student loan payments', 'Child support', 'Alimony', 'Personal loan payments', 'Other debt'] },
    { name: 'Healthcare', items: ['Health insurance', 'Dental insurance', 'Medication', 'Medical bills', 'Other'] }
  ]},
  { title: 'Monthly Discretionary Expenses (Things You Want)', categories: [
    { name: 'Child & Dependent Care', items: ['Daycare/After-school', 'Babysitting', 'Summer camps', 'Other'] },
    { name: 'Education', items: ['Tuition', 'Books/Supplies', 'Student fees', 'Other'] },
    { name: 'Personal Care', items: ['Haircuts', 'Salon services', 'Gym memberships', 'Cosmetics/Toiletries'] },
    { name: 'Clothing', items: ['Adult clothing', 'Children\'s clothing', 'Dry cleaning', 'Laundry'] },
    { name: 'Gifts', items: ['Birthdays', 'Holidays', 'Charitable donations', 'Other'] },
    { name: 'Recreational', items: ['Hobbies', 'Vacation', 'Sporting events', 'Other'] },
    { name: 'Entertainment', items: ['Movies', 'Concerts', 'Streaming/Subscriptions', 'Other'] }
  ]},
  { title: 'Other Monthly Expenses', items: ['Miscellaneous'] }
];

/**
 * Save worksheet data to localStorage
 */
function saveWorksheet(){
  try {
    localStorage.setItem(WS_KEY, JSON.stringify(wsData));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please clear some worksheet data.');
      console.error('[Worksheet] localStorage quota exceeded');
    } else {
      console.error('[Worksheet] Error saving worksheet data:', e);
    }
  }
}

/**
 * Create a worksheet input field for a budget item
 * @param {HTMLElement} container - Parent container to append the field to
 * @param {string} labelText - Label text for the input
 * @param {string} key - Unique key for storing the value (format: "section-category-item")
 */
function createWorksheetField(container, labelText, key){
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  const input = document.createElement('input');
  const inputId = `ws-${key}`;
  
  label.textContent = labelText;
  label.htmlFor = inputId;
  
  // Configure input as number field for currency
  input.type = 'number';
  input.step = '0.01';
  input.inputMode = 'decimal';
  input.id = inputId;
  
  // Load saved value if it exists (validate to prevent localStorage manipulation)
  if(wsData[key] !== undefined) {
    const validated = validateNumber(wsData[key]);
    input.value = validated !== null ? validated : '';
  }
  
  // Save value on input and update totals
  input.addEventListener('input', ()=>{
    const validated = validateNumber(input.value);
    wsData[key] = validated !== null ? validated : 0;
    saveWorksheet();
    updateWorksheetTotals();
  });
  
  field.appendChild(label);
  field.appendChild(input);
  container.appendChild(field);
}

/**
 * Render the entire budget worksheet UI
 * Creates sub-tabs for each section and builds the form fields
 */
function renderWorksheet(){
  const worksheetSubTabs = document.getElementById('worksheetSubTabs');
  worksheetEl.innerHTML = '';
  worksheetSubTabs.innerHTML = '';

  // Create sub-tabs for each worksheet section
  WORKSHEET.forEach((section, si) => {
    const subTab = document.createElement('button');
    subTab.className = `sub-tab ${si === 0 ? 'active' : ''}`;
    subTab.dataset.section = si;
    // Remove parenthetical text from tab display for cleaner UI
    subTab.textContent = section.title.replace(/\s*\([^)]*\)\s*$/, '');
    subTab.addEventListener('click', () => {
      // Remove active state from all sub-tabs and sections
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.worksheet-section').forEach(s => s.classList.remove('active'));
      // Add active state to clicked sub-tab and corresponding section
      subTab.classList.add('active');
      document.getElementById(`worksheet-section-${si}`).classList.add('active');
    });
    worksheetSubTabs.appendChild(subTab);
  });

  // Create worksheet sections with form fields
  WORKSHEET.forEach((section, si)=>{
    const sectionDiv = document.createElement('div');
    sectionDiv.className = `worksheet-section ${si === 0 ? 'active' : ''}`;
    sectionDiv.id = `worksheet-section-${si}`;

    // Create card container for this section
    const card = document.createElement('div');
    card.className = 'card worksheet-card';
    const h2 = document.createElement('h2');
    h2.textContent = section.title;
    card.appendChild(h2);

    // Handle sections with simple items (no categories)
    if(section.items){
      const simpleBlock = document.createElement('div');
      simpleBlock.className = 'category-block simple-block';
      section.items.forEach((item, ii)=>{
        // Key format: "sectionIndex-0-itemIndex" (0 indicates no category)
        const key = `${si}-0-${ii}`;
        createWorksheetField(simpleBlock, item, key);
      });
      card.appendChild(simpleBlock);
    }

    // Handle sections with categories
    if(section.categories){
      section.categories.forEach((cat, ci)=>{
        const block = document.createElement('div');
        block.className = 'category-block';
        const h3 = document.createElement('h3');
        h3.textContent = cat.name;
        block.appendChild(h3);
        
        // Create fields for each item in this category
        cat.items.forEach((item, ii)=>{
          // Key format: "sectionIndex-categoryIndex-itemIndex"
          const key = `${si}-${ci}-${ii}`;
          createWorksheetField(block, item, key);
        });
        
        // Add category subtotal display
        const ctotal = document.createElement('div');
        ctotal.className = 'subtotal';
        ctotal.id = `cat-${si}-${ci}-total`;
        ctotal.textContent = 'Subtotal: $0.00';
        block.appendChild(ctotal);
        card.appendChild(block);
      });
    }

    // Add section total display
    const stotal = document.createElement('div');
    stotal.className = 'section-total';
    stotal.id = `sec-${si}-total`;
    stotal.textContent = 'Section Total: $0.00';
    card.appendChild(stotal);

    sectionDiv.appendChild(card);
    worksheetEl.appendChild(sectionDiv);
  });

  // Create summary card showing totals for all sections (using safe DOM methods)
  const summary = document.createElement('div');
  summary.className = 'card worksheet-summary';
  const h2 = document.createElement('h2');
  h2.textContent = 'Summary';
  summary.appendChild(h2);
  const totalsDiv = document.createElement('div');
  totalsDiv.className = 'totals';
  
  // Create pills for each total
  const createPill = (label, id) => {
    const pill = document.createElement('div');
    pill.className = 'pill';
    const labelDiv = document.createElement('div');
    const small = document.createElement('small');
    small.textContent = label;
    labelDiv.appendChild(small);
    const strong = document.createElement('strong');
    strong.id = id;
    strong.textContent = '$0.00';
    pill.appendChild(labelDiv);
    pill.appendChild(strong);
    return pill;
  };
  
  totalsDiv.appendChild(createPill('Income', 'ws-income-total'));
  totalsDiv.appendChild(createPill('Essential', 'ws-essential-total'));
  totalsDiv.appendChild(createPill('Discretionary', 'ws-discretionary-total'));
  totalsDiv.appendChild(createPill('Other', 'ws-other-total'));
  totalsDiv.appendChild(createPill('Expenses Total', 'ws-expenses-total'));
  
  summary.appendChild(totalsDiv);
  worksheetEl.appendChild(summary);

  // Calculate and display initial totals
  updateWorksheetTotals();
}

/**
 * Update all worksheet totals (category subtotals, section totals, and summary)
 * Called whenever a worksheet field value changes
 */
function updateWorksheetTotals(){
  // Array to store totals for each section: [income, essential, discretionary, other]
  const totals = [0,0,0,0];
  
  WORKSHEET.forEach((section, si)=>{
    let secSum = 0;
    
    // Sum up simple items (no categories)
    if(section.items){
      section.items.forEach((item, ii)=>{
        const key = `${si}-0-${ii}`;
        const val = wsData[key] || 0;
        secSum += val;
      });
    }
    
    // Sum up categorized items
    if(section.categories){
      section.categories.forEach((cat, ci)=>{
        let catSum = 0;
        // Calculate category subtotal
        cat.items.forEach((item, ii)=>{
          const key = `${si}-${ci}-${ii}`;
          const val = wsData[key] || 0;
          catSum += val;
        });
        // Update category subtotal display
        document.getElementById(`cat-${si}-${ci}-total`).textContent = 'Subtotal: ' + fmt(catSum);
        secSum += catSum;
      });
    }
    
    // Update section total display
    document.getElementById(`sec-${si}-total`).textContent = 'Section Total: ' + fmt(secSum);
    totals[si] = secSum;
  });
  
  // Update summary totals
  const [inc, ess, dis, other] = totals;
  document.getElementById('ws-income-total').textContent = fmt(inc);
  document.getElementById('ws-essential-total').textContent = fmt(ess);
  document.getElementById('ws-discretionary-total').textContent = fmt(dis);
  document.getElementById('ws-other-total').textContent = fmt(other);
  document.getElementById('ws-expenses-total').textContent = fmt(ess + dis + other);
}

/**
 * Format a number as currency string
 * @param {number} n - Number to format
 * @returns {string} Formatted currency string (e.g., "$123.45" or "-$67.89")
 */
function fmt(n){ return (n<0?'-':'') + '$' + Math.abs(n).toFixed(2); }

// ============================================================================
// TRANSACTION RENDERING
// ============================================================================
/**
 * Render the transaction list with filtering and search
 * Updates the transaction list display and summary totals
 */
function render(){
  const q = searchEl.value.toLowerCase().trim();
  const ft = filterTypeEl.value;
  let income = 0, expense = 0;

  listEl.innerHTML = '';
  
  // Filter, search, sort, and render transactions
  txns
    // Filter out invalid transactions (defense against localStorage manipulation)
    .filter(t => t && typeof t === 'object' && t.id && t.desc && typeof t.amount === 'number')
    // Filter by type (all, income, or expense)
    .filter(t => (ft==='all'||t.type===ft))
    // Filter by search query (description or category)
    .filter(t => !q || (t.desc.toLowerCase().includes(q) || (t.cat||'').toLowerCase().includes(q)))
    // Sort by date (newest first)
    .sort((a,b)=> new Date(b.date||0) - new Date(a.date||0))
    .forEach(t=>{
      const li = document.createElement('li');
      const left = document.createElement('div');
      const right = document.createElement('div');

      // Left side: description, category, and date (using safe DOM methods to prevent XSS)
      const descStrong = document.createElement('strong');
      descStrong.textContent = t.desc;
      const br1 = document.createElement('br');
      const small1 = document.createElement('small');
      small1.textContent = `${t.cat||'—'} • ${t.date||'—'}`;
      left.appendChild(descStrong);
      left.appendChild(br1);
      left.appendChild(small1);
      
      // Right side: amount (colored by type) and delete link
      const amountStrong = document.createElement('strong');
      amountStrong.className = t.type==='expense'?'neg':'pos';
      // Validate amount before displaying (defense in depth)
      const displayAmount = typeof t.amount === 'number' && isFinite(t.amount) ? t.amount : 0;
      amountStrong.textContent = fmt(t.type==='expense'?-displayAmount:displayAmount);
      const br2 = document.createElement('br');
      const small2 = document.createElement('small');
      const deleteLink = document.createElement('a');
      deleteLink.href = '#';
      deleteLink.dataset.id = t.id;
      deleteLink.textContent = 'Delete';
      small2.appendChild(deleteLink);
      right.appendChild(amountStrong);
      right.appendChild(br2);
      right.appendChild(small2);
      
      li.appendChild(left); li.appendChild(right);
      listEl.appendChild(li);

      // Accumulate totals (validate amount is a number to prevent manipulation)
      const amount = typeof t.amount === 'number' && isFinite(t.amount) ? t.amount : 0;
      if(t.type==='income') income += amount; else expense += amount;
    });

  // Update summary totals
  incomeTotalEl.textContent = fmt(income);
  expenseTotalEl.textContent = fmt(-expense);
  netTotalEl.textContent = fmt(income - expense);
}

// ============================================================================
// TRANSACTION MANAGEMENT
// ============================================================================
/**
 * Add a new transaction from the form
 * Validates input, creates transaction object, saves to storage, and re-renders
 */
function add(){
  // Get and validate description
  const desc = descEl.value.trim();
  if (!desc) {
    alert('Please enter a description');
    return;
  }
  if (desc.length > 200) {
    alert('Description is too long (max 200 characters)');
    return;
  }
  
  // Get and validate amount
  const amount = parseFloat(amtEl.value);
  if (isNaN(amount) || amount === 0) {
    alert('Please enter a valid amount');
    return;
  }
  if (Math.abs(amount) > 999999999.99) {
    alert('Amount is too large (max $999,999,999.99)');
    return;
  }
  
  // Get and validate category
  const cat = catEl.value.trim();
  if (cat.length > 100) {
    alert('Category is too long (max 100 characters)');
    return;
  }
  
  // Get and validate date
  let date = dateEl.value;
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
  } else {
    // Use strict date validation to prevent manipulation attacks
    const validated = validateDate(date);
    if (!validated) {
      alert('Invalid date. Please use YYYY-MM-DD format with a valid date.');
      return;
    }
    date = validated;
  }
  
  // Validate type
  const type = typeEl.value;
  if (type !== 'income' && type !== 'expense') {
    alert('Invalid transaction type');
    return;
  }
  
  // Create new transaction object
  const newTxn = {
    id: crypto.randomUUID(),
    desc: desc,
    amount: Math.abs(amount),
    type: type,
    cat: cat,
    date: date
  };
  txns.push(newTxn);
  
  // Save to storage and clear form
  save(txns);
  descEl.value=''; amtEl.value=''; catEl.value='';
  
  // Re-render to show new transaction
  render();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================
// Delete transaction handler (uses event delegation for dynamically created elements)
listEl.addEventListener('click', e=>{
  const id = e.target.dataset?.id;
  // Validate that id is a non-empty string to prevent manipulation
  if(id && typeof id === 'string' && id.length > 0){ 
    txns = txns.filter(t=>t && t.id && t.id !== id); 
    save(txns); 
    render(); 
  }
});

// Form submission
addBtn.addEventListener('click', add);

// Search and filter handlers
searchEl.addEventListener('input', render);
filterTypeEl.addEventListener('change', render);

// ============================================================================
// TAB SWITCHING
// ============================================================================
// Tab switching functionality for Transactions/Worksheet tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    console.log('[UI] Tab switched to:', targetTab);
    
    // Remove active class from all tabs and contents
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab and corresponding content
    tab.classList.add('active');
    document.getElementById(`${targetTab}Tab`).classList.add('active');
  });
});

// ============================================================================
// INITIALIZATION
// ============================================================================
// Check if running over HTTPS (defense-in-depth, GitHub Pages enforces HTTPS)
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  console.warn('[Security] Application should be served over HTTPS');
  // GitHub Pages enforces HTTPS, so this is just a warning
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => { 
  console.log('[App] Initializing application');
  render();           // Render transaction list
  renderWorksheet();   // Render budget worksheet
  renderMenu();       // Render side menu
  console.log('[App] Initialization complete');
});

// ============================================================================
// CSV EXPORT/IMPORT
// ============================================================================
/**
 * Export all transactions to CSV file
 * Creates a downloadable CSV file with transaction data
 */
exportBtn.addEventListener('click', ()=>{
  // Create CSV header row
  const rows = [['Date','Type','Description','Category','Amount']];
  
  // Add each transaction as a row
  txns.forEach(t=> rows.push([t.date, t.type, t.desc, t.cat, t.amount]));
  
  // Convert to CSV format with CSV injection protection
  // Prefix dangerous characters (=, +, -, @, \t) with a tab to prevent formula injection
  const sanitizeCsvField = (value) => {
    if (value === null || value === undefined) return '';
    const str = value.toString();
    // Check if field starts with dangerous characters
    if (/^[=+\-@\t]/.test(str)) {
      // Prefix with tab to prevent formula execution in Excel/Google Sheets
      return '\t' + str;
    }
    return str;
  };
  
  // Escape quotes and wrap fields in quotes, then sanitize
  const csv = rows.map(r=> 
    r.map(x=> {
      const sanitized = sanitizeCsvField(x);
      return `"${sanitized.replace(/"/g,'""')}"`;
    }).join(',')
  ).join('\n');
  
  // Create blob and download link
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quickbudget.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

/**
 * Parse CSV content into array of transaction objects
 * Handles quoted fields, escaped quotes, and removes leading tabs from sanitized fields
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of parsed transaction objects
 */
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const expectedHeaders = ['Date', 'Type', 'Description', 'Category', 'Amount'];
  
  // Validate header format
  if (headers.length !== expectedHeaders.length || 
      !headers.every((h, i) => h.trim().toLowerCase() === expectedHeaders[i].toLowerCase())) {
    throw new Error('Invalid CSV format. Expected headers: Date, Type, Description, Category, Amount');
  }
  
  // Parse data rows
  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== expectedHeaders.length) {
      console.warn(`Skipping row ${i + 1}: incorrect number of columns`);
      continue;
    }
    
    const [date, type, desc, cat, amount] = values;
    
    // Validate required fields
    if (!date || !type || !desc || !amount) {
      console.warn(`Skipping row ${i + 1}: missing required fields`);
      continue;
    }
    
    // Clean up values (remove leading tabs from sanitized fields, trim whitespace)
    const cleanDate = date.replace(/^\t/, '').trim();
    const cleanType = type.replace(/^\t/, '').trim().toLowerCase();
    const cleanDesc = desc.replace(/^\t/, '').trim();
    const cleanCat = cat ? cat.replace(/^\t/, '').trim() : '';
    const cleanAmount = amount.replace(/^\t/, '').trim();
    
    // Validate type
    if (cleanType !== 'income' && cleanType !== 'expense') {
      console.warn(`Skipping row ${i + 1}: invalid type "${cleanType}" (must be "income" or "expense")`);
      continue;
    }
    
    // Validate date format (YYYY-MM-DD)
    const validatedDate = validateDate(cleanDate);
    if (!validatedDate) {
      console.warn(`Skipping row ${i + 1}: invalid date format "${cleanDate}"`);
      continue;
    }
    
    // Validate amount (must be a valid number)
    const amountNum = parseFloat(cleanAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      console.warn(`Skipping row ${i + 1}: invalid amount "${cleanAmount}"`);
      continue;
    }
    
    transactions.push({
      date: validatedDate,
      type: cleanType,
      desc: cleanDesc,
      cat: cleanCat,
      amount: amountNum
    });
  }
  
  return transactions;
}

/**
 * Parse a single CSV line, handling quoted fields and escaped quotes
 * @param {string} line - CSV line to parse
 * @returns {Array} Array of field values
 */
function parseCSVLine(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Add last field
  fields.push(currentField);
  
  return fields;
}

/**
 * Import transactions from CSV file
 */
importBtn.addEventListener('click', () => {
  csvFileInput.click();
});

csvFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    console.log('[Import] No file selected');
    return;
  }
  
  console.log('[Import] CSV file selected:', file.name, 'size:', file.size, 'bytes');
  
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.csv')) {
    console.warn('[Import] Invalid file type:', file.name);
    alert('Please select a CSV file.');
    csvFileInput.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const csvText = event.target.result;
      const importedTxns = parseCSV(csvText);
      
      if (importedTxns.length === 0) {
        console.warn('[Import] No valid transactions found in CSV');
        alert('No valid transactions found in CSV file.');
        csvFileInput.value = '';
        return;
      }
      
      // Limit number of transactions that can be imported at once (prevent DoS)
      const MAX_IMPORT_LIMIT = 10000;
      if (importedTxns.length > MAX_IMPORT_LIMIT) {
        console.warn('[Import] Too many transactions:', importedTxns.length);
        alert(`Too many transactions in CSV file (${importedTxns.length}). Maximum allowed is ${MAX_IMPORT_LIMIT}. Please split your CSV file into smaller files.`);
        csvFileInput.value = '';
        return;
      }
      
      // Ask user if they want to replace or merge
      const action = confirm(
        `Found ${importedTxns.length} transaction(s) in CSV.\n\n` +
        `Click OK to ADD these transactions to your existing data.\n` +
        `Click Cancel to REPLACE all transactions with CSV data.`
      );
      
      if (action) {
        // Merge: Add imported transactions to existing ones
        txns = [...txns, ...importedTxns];
        save(txns);
        render();
        alert(`Successfully imported ${importedTxns.length} transaction(s).`);
      } else {
        // Replace: Use only imported transactions
        txns = importedTxns;
        save(txns);
        render();
        alert(`Successfully replaced all transactions with ${importedTxns.length} transaction(s) from CSV.`);
      }
      
      csvFileInput.value = '';
    } catch (error) {
      alert(`Error importing CSV: ${error.message}`);
      console.error('[Import] CSV import error:', error);
      csvFileInput.value = '';
    }
  };
  
  reader.onerror = () => {
    alert('Error reading CSV file.');
    csvFileInput.value = '';
  };
  
  reader.readAsText(file);
});

// Menu item for CSV import
menuCsvImport.addEventListener('click', () => {
  closeMenu();
  importBtn.click(); // Trigger file input
});

// ============================================================================
// MENU RENDERING
// ============================================================================
/**
 * Render the side menu with worksheet navigation
 * Creates expandable menu items for each worksheet section and category
 */
function renderMenu() {
  menuWorksheetSection.innerHTML = '';
  
  // Create menu items for each worksheet section
  WORKSHEET.forEach((section, si) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'menu-section';
    
    // Create section header (expandable)
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'menu-section-header';
    // Remove parenthetical text from menu display for cleaner UI
    sectionHeader.textContent = section.title.replace(/\s*\([^)]*\)\s*$/, '');
    sectionHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      sectionHeader.classList.toggle('expanded');
      const subsection = sectionDiv.querySelector('.menu-subsection');
      if (subsection) {
        subsection.classList.toggle('expanded');
      }
    });
    
    // Container for section items
    const subsection = document.createElement('div');
    subsection.className = 'menu-subsection';
    
    // Handle sections with simple items (no categories)
    if (section.items) {
      section.items.forEach((item, ii) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'menu-item-nested';
        itemDiv.textContent = item;
        itemDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          
          // Switch to worksheet tab
          tabs.forEach(t => t.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));
          document.querySelector('[data-tab="worksheet"]').classList.add('active');
          document.getElementById('worksheetTab').classList.add('active');
          
          // Switch to correct sub-tab
          document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.worksheet-section').forEach(s => s.classList.remove('active'));
          const subTab = document.querySelector(`[data-section="${si}"]`);
          const section = document.getElementById(`worksheet-section-${si}`);
          if (subTab && section) {
            subTab.classList.add('active');
            section.classList.add('active');
          }
          
          // Scroll to and focus the input field
          const input = document.getElementById(`ws-${si}-0-${ii}`);
          if (input) {
            setTimeout(() => {
              input.scrollIntoView({ behavior: 'smooth', block: 'center' });
              input.focus();
            }, 100);
          }
        });
        subsection.appendChild(itemDiv);
      });
    }
    
    // Handle sections with categories
    if (section.categories) {
      section.categories.forEach((cat, ci) => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'menu-category';
        
        // Category header (expandable)
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'menu-category-header';
        categoryHeader.textContent = cat.name;
        categoryHeader.addEventListener('click', (e) => {
          e.stopPropagation();
          categoryHeader.classList.toggle('expanded');
          const categorySubsection = categoryDiv.querySelector('.menu-subsection');
          if (categorySubsection) {
            categorySubsection.classList.toggle('expanded');
          }
        });
        
        // Container for category items
        const categorySubsection = document.createElement('div');
        categorySubsection.className = 'menu-subsection';
        
        // Create menu items for each category item
        cat.items.forEach((item, ii) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'menu-item-nested';
          itemDiv.textContent = item;
          itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            
            // Switch to worksheet tab
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            document.querySelector('[data-tab="worksheet"]').classList.add('active');
            document.getElementById('worksheetTab').classList.add('active');
            
            // Switch to correct sub-tab
            document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.worksheet-section').forEach(s => s.classList.remove('active'));
            const subTab = document.querySelector(`[data-section="${si}"]`);
            const section = document.getElementById(`worksheet-section-${si}`);
            if (subTab && section) {
              subTab.classList.add('active');
              section.classList.add('active');
            }
            
            // Scroll to and focus the input field
            const input = document.getElementById(`ws-${si}-${ci}-${ii}`);
            if (input) {
              setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                input.focus();
              }, 100);
            }
          });
          categorySubsection.appendChild(itemDiv);
        });
        
        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categorySubsection);
        subsection.appendChild(categoryDiv);
      });
    }
    
    sectionDiv.appendChild(sectionHeader);
    sectionDiv.appendChild(subsection);
    menuWorksheetSection.appendChild(sectionDiv);
  });
}

// ============================================================================
// MENU TOGGLE FUNCTIONALITY
// ============================================================================
/**
 * Open the side menu
 */
function openMenu() {
  console.log('[UI] Opening side menu');
  sideMenu.classList.add('open');
  menuOverlay.classList.add('open');
  menuToggle.classList.add('active');
  document.body.style.overflow = 'hidden'; // Prevent body scrolling
}

/**
 * Close the side menu
 */
function closeMenu() {
  console.log('[UI] Closing side menu');
  sideMenu.classList.remove('open');
  menuOverlay.classList.remove('open');
  menuToggle.classList.remove('active');
  document.body.style.overflow = '';
}

// Menu toggle event handlers
menuToggle.addEventListener('click', openMenu);
closeMenuBtn.addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu); // Close when clicking overlay

// Menu navigation handlers
menuTransactions.addEventListener('click', () => {
  closeMenu();
  // Switch to transactions tab
  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));
  document.querySelector('[data-tab="transactions"]').classList.add('active');
  document.getElementById('transactionsTab').classList.add('active');
  const tabsContainer = document.querySelector('.tabs-container');
  if (tabsContainer) {
    tabsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

menuPdfUpload.addEventListener('click', () => {
  closeMenu();
  const pdfCard = document.querySelector('.pdf-upload-card');
  if (pdfCard) {
    pdfCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

menuExport.addEventListener('click', () => {
  closeMenu();
  exportBtn.click(); // Trigger export
});

/**
 * Clear all data (transactions and worksheet)
 * Shows confirmation dialog before clearing
 */
menuClearData.addEventListener('click', () => {
  closeMenu();
  
  console.log('[Data] Clear data initiated');
  // Show confirmation dialog with warning
  const confirmed = confirm(
    '⚠️ WARNING: This will permanently delete ALL your data!\n\n' +
    'This includes:\n' +
    '• All transactions\n' +
    '• All budget worksheet data\n\n' +
    'This action cannot be undone.\n\n' +
    'Make sure you have exported your data to CSV if you want to keep a backup.\n\n' +
    'Are you absolutely sure you want to clear all data?'
  );
  
  if (!confirmed) {
    console.log('[Data] Clear data cancelled by user');
    return;
  }
  
  // Double confirmation for safety
  const doubleConfirmed = confirm(
    'Last chance! This will delete everything.\n\n' +
    'Click OK to permanently delete all data, or Cancel to keep it.'
  );
  
  if (!doubleConfirmed) {
    console.log('[Data] Clear data cancelled by user (second confirmation)');
    return;
  }
  
  try {
    // Clear transactions
    localStorage.removeItem(KEY);
    txns = [];
    
    // Clear worksheet data
    localStorage.removeItem(WS_KEY);
    wsData = {};
    console.log('[Data] localStorage cleared');
    
    // Reset form
    descEl.value = '';
    amtEl.value = '';
    typeEl.value = 'expense';
    catEl.value = '';
    dateEl.value = '';
    
    // Re-render everything
    render();
    renderWorksheet();
    
    console.log('[Data] All data cleared successfully');
    alert('All data has been cleared successfully.');
  } catch (e) {
    console.error('[Data] Error clearing data:', e);
    alert('Error clearing data. Please try again.');
  }
});

// ============================================================================
// PDF UPLOAD AND PARSING
// ============================================================================
// Helper function to check if a file is a PDF (by MIME type or extension)
function isPdfFile(file) {
  if (!file) return false;
  // Check MIME type first
  if (file.type === 'application/pdf') {
    return true;
  }
  // Fallback: check file extension (MIME type can be empty on some systems)
  if (file.name) {
    const fileName = file.name.toLowerCase();
    return fileName.endsWith('.pdf');
  }
  return false;
}

// Configure PDF.js worker with SRI verification
// Downloads worker, verifies SHA-512 hash, then creates blob URL for secure loading
// SRI hash for pdfjs-dist@3.11.174 worker: sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==
const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const EXPECTED_HASH = 'sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==';

// Function to calculate SHA-512 hash
async function calculateSHA512(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  return `sha512-${hashBase64}`;
}

// Wait for PDF.js library to load, then configure worker with SRI verification
function configurePdfJsWorker() {
  // Check if PDF.js is already loaded
  if (typeof pdfjsLib !== 'undefined') {
    initializeWorker();
    return;
  }
  
  // Wait for library to load (check every 100ms, max 10 seconds)
  let attempts = 0;
  const maxAttempts = 100;
  const checkInterval = setInterval(() => {
    attempts++;
    if (typeof pdfjsLib !== 'undefined') {
      clearInterval(checkInterval);
      initializeWorker();
    } else if (attempts >= maxAttempts) {
      clearInterval(checkInterval);
      console.error('PDF.js library failed to load after 10 seconds');
      console.error('This may be due to:');
      console.error('1. Network issues blocking CDN access');
      console.error('2. Content Security Policy restrictions');
      console.error('3. Ad blockers or browser extensions');
      console.error('4. The script tag in index.html not loading properly');
    }
  }, 100);
}

// Initialize worker with SRI verification
async function initializeWorker() {
  if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js library is not available when trying to initialize worker');
    return;
  }
  
  try {
    console.log('Fetching PDF.js worker from CDN...');
    const response = await fetch(WORKER_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch worker: ${response.status} ${response.statusText}`);
    }
    const workerCode = await response.text();
    
    if (!workerCode || workerCode.length === 0) {
      throw new Error('Worker file is empty');
    }
    
    console.log('Verifying worker integrity hash...');
    // Verify integrity hash
    const actualHash = await calculateSHA512(workerCode);
    if (actualHash !== EXPECTED_HASH) {
      console.error('PDF.js worker integrity check failed! Hash mismatch.');
      console.error(`Expected: ${EXPECTED_HASH}`);
      console.error(`Actual: ${actualHash}`);
      // Fail securely - do not load worker if integrity check fails
      console.error('Worker integrity verification failed. PDF processing will be unavailable.');
      if (pdfStatus) {
        pdfStatus.textContent = 'Security verification failed. Please refresh the page.';
        pdfStatus.style.color = '#b91c1c';
      }
      return;
    }
    
    // Create blob URL from verified worker code
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;
    
    console.log('✓ PDF.js worker loaded with SRI verification');
  } catch (error) {
    console.error('Error loading PDF.js worker with SRI:', error);
    console.error('Error details:', error.message);
    // Fail securely - do not load worker if verification fails
    console.error('Worker loading failed. PDF processing will be unavailable.');
    if (pdfStatus) {
      pdfStatus.textContent = 'Worker loading failed. Please refresh the page.';
      pdfStatus.style.color = '#b91c1c';
    }
  }
}

// Start configuration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Also wait for window load to ensure all scripts are loaded
    window.addEventListener('load', configurePdfJsWorker);
    // But also try immediately in case it's already loaded
    configurePdfJsWorker();
  });
} else {
  // DOM is already ready, but wait for all resources including scripts
  if (document.readyState === 'complete') {
    configurePdfJsWorker();
  } else {
    window.addEventListener('load', configurePdfJsWorker);
    // Also try immediately
    configurePdfJsWorker();
  }
}

// Diagnostic: Check if PDF.js script tag exists and monitor loading
(function checkPdfJsLoading() {
  const pdfJsScript = document.querySelector('script[src*="pdfjs-dist"]');
  if (!pdfJsScript) {
    console.warn('PDF.js script tag not found in DOM. Check index.html for the script tag.');
    return;
  }
  
  console.log('PDF.js script tag found:', pdfJsScript.src);
  
  // Check if script loaded successfully
  pdfJsScript.addEventListener('error', (e) => {
    console.error('PDF.js script failed to load from:', pdfJsScript.src);
    console.error('Error event:', e);
  });
  
  pdfJsScript.addEventListener('load', () => {
    console.log('PDF.js script tag loaded successfully');
    // Wait a bit for the library to initialize
    setTimeout(() => {
      console.log('Checking for pdfjsLib after script load...');
      console.log('typeof pdfjsLib:', typeof pdfjsLib);
      console.log('typeof pdfjs:', typeof pdfjs);
      console.log('window.pdfjsLib:', window.pdfjsLib);
      console.log('window.pdfjs:', window.pdfjs);
      
      // Check for alternative global names
      if (typeof pdfjsLib === 'undefined' && typeof pdfjs !== 'undefined') {
        console.warn('PDF.js loaded as "pdfjs" instead of "pdfjsLib"');
        window.pdfjsLib = pdfjs;
      }
      
      if (typeof pdfjsLib !== 'undefined') {
        console.log('✓ PDF.js library is available as pdfjsLib');
        // Try to configure worker if not already done
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          console.log('Configuring PDF.js worker...');
          configurePdfJsWorker();
        }
      } else {
        console.error('PDF.js library still not available after script load');
      }
    }, 100);
  });
  
  // Also check immediately if script already loaded
  if (pdfJsScript.complete || pdfJsScript.readyState === 'complete') {
    setTimeout(() => {
      if (typeof pdfjsLib !== 'undefined') {
        console.log('PDF.js already loaded');
      } else {
        console.warn('PDF.js script appears loaded but library not available');
      }
    }, 100);
  }
})();

// Drag and drop handlers for PDF upload (only if elements exist)
if (pdfUploadArea && pdfFileInput) {
  pdfUploadArea.addEventListener('click', () => pdfFileInput.click());
  pdfUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    pdfUploadArea.classList.add('dragover');
  });
  pdfUploadArea.addEventListener('dragleave', () => {
    pdfUploadArea.classList.remove('dragover');
  });

  pdfUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pdfUploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    console.log('File dropped:', files.length, 'file(s)');
    if (files.length > 0) {
      const file = files[0];
      console.log('Dropped file:', file.name, file.type, file.size);
      if (isPdfFile(file)) {
        console.log('Dropped file is a PDF, calling handlePdfFile');
        handlePdfFile(file);
      } else {
        console.warn('Dropped file is not a PDF:', file.name, file.type);
        if (pdfStatus) {
          pdfStatus.textContent = 'Please select a PDF file.';
          pdfStatus.style.color = '#b91c1c';
        }
      }
    }
  });
  
  pdfFileInput.addEventListener('change', (e) => {
    console.log('PDF file input changed', e.target.files);
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      console.log('Selected file:', file.name, file.type, file.size);
      if (isPdfFile(file)) {
        console.log('File is a PDF, calling handlePdfFile');
        handlePdfFile(file);
      } else {
        console.warn('File is not a PDF:', file.name, file.type);
        if (pdfStatus) {
          pdfStatus.textContent = 'Please select a PDF file.';
          pdfStatus.style.color = '#b91c1c';
        }
        pdfFileInput.value = ''; // Clear invalid selection
      }
    } else {
      console.warn('No files selected');
    }
  });
} else {
  console.error('PDF upload elements not found in DOM');
}

/**
 * Handle PDF file upload and extract transactions
 * @param {File} file - PDF file to process
 */
async function handlePdfFile(file) {
  console.log('handlePdfFile called with:', file ? file.name : 'null');
  
  if (!file) {
    console.error('No file provided to handlePdfFile');
    if (pdfStatus) {
      pdfStatus.textContent = 'No file selected.';
      pdfStatus.style.color = '#b91c1c';
    }
    return;
  }
  
  // Validate file is a PDF (defense in depth)
  if (!isPdfFile(file)) {
    console.warn('File validation failed - not a PDF:', file.name, file.type);
    if (pdfStatus) {
      pdfStatus.textContent = 'Invalid file type. Please select a PDF file.';
      pdfStatus.style.color = '#b91c1c';
    }
    return;
  }
  
  // Validate file size (max 10MB to prevent DoS)
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    console.warn('File too large:', file.size, 'bytes');
    if (pdfStatus) {
      pdfStatus.textContent = 'File too large. Maximum size is 10MB.';
      pdfStatus.style.color = '#b91c1c';
    }
    return;
  }
  
  // Check if PDF.js is available
  if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js library is not loaded');
    console.error('pdfjsLib type:', typeof pdfjsLib);
    console.error('Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
    if (pdfStatus) {
      pdfStatus.textContent = 'PDF.js library not loaded. Please refresh the page.';
      pdfStatus.style.color = '#b91c1c';
    }
    return;
  }
  
  console.log('PDF.js library is available, proceeding with PDF processing');
  
  if (pdfStatus) {
    pdfStatus.textContent = 'Processing PDF...';
    pdfStatus.style.color = '#64748b';
  }
  if (extractedTransactions) extractedTransactions.style.display = 'none';
  if (pdfActions) pdfActions.style.display = 'none';
  extractedTxns = [];

  try {
    // Set processing timeout (30 seconds) to prevent DoS
    const PROCESSING_TIMEOUT = 30000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('PDF processing timeout')), PROCESSING_TIMEOUT)
    );
    
    // Load PDF document with error handling
    console.log('Loading PDF document...');
    const arrayBuffer = await file.arrayBuffer();
    
    // Suppress font warnings (they're harmless and clutter the console)
    const originalConsoleWarn = console.warn;
    console.warn = function(...args) {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('fetchStandardFontData')) {
        // Suppress font warnings - they don't affect text extraction
        return;
      }
      originalConsoleWarn.apply(console, args);
    };
    
    const pdfPromise = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      // Suppress font loading errors
      standardFontDataUrl: undefined
    }).promise;
    
    const pdf = await Promise.race([pdfPromise, timeoutPromise]);
    
    // Restore console.warn
    console.warn = originalConsoleWarn;
    
    console.log(`PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    // Limit pages to process (prevent DoS from large PDFs)
    const MAX_PAGES = 100;
    const pagesToProcess = Math.min(pdf.numPages, MAX_PAGES);
    if (pdf.numPages > MAX_PAGES) {
      console.warn(`PDF has ${pdf.numPages} pages, processing first ${MAX_PAGES} pages only`);
      if (pdfStatus) {
        pdfStatus.textContent = `Processing first ${MAX_PAGES} of ${pdf.numPages} pages...`;
        pdfStatus.style.color = '#64748b';
      }
    }
    
    let fullText = '';

    // Extract text from pages, preserving line structure
    for (let i = 1; i <= pagesToProcess; i++) {
      console.log(`Extracting text from page ${i}/${pagesToProcess}...`);
      // Add timeout check for each page processing
      const pagePromise = pdf.getPage(i);
      const page = await Promise.race([pagePromise, timeoutPromise]);
      const textContent = await Promise.race([page.getTextContent(), timeoutPromise]);
      
      // Group text items by approximate Y position to preserve lines
      // This helps maintain the table structure of bank statements
      const itemsByLine = {};
      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5]); // Y coordinate
        if (!itemsByLine[y]) itemsByLine[y] = [];
        itemsByLine[y].push(item);
      });
      
      // Sort by Y position (top to bottom) and X position (left to right)
      const sortedLines = Object.keys(itemsByLine)
        .sort((a, b) => parseFloat(b) - parseFloat(a)) // Top to bottom
        .map(y => {
          return itemsByLine[y]
            .sort((a, b) => a.transform[4] - b.transform[4]) // Left to right
            .map(item => item.str)
            .join(' ')
            .trim();
        })
        .filter(line => line.length > 0);
      
      fullText += sortedLines.join('\n') + '\n';
    }

    console.log(`Extracted ${fullText.length} characters of text from PDF`);
    
    // Parse transactions from extracted text
    console.log('Parsing transactions from extracted text...');
    extractedTxns = parseTransactionsFromText(fullText);
    console.log(`Found ${extractedTxns.length} potential transaction(s)`);
    
    if (extractedTxns.length > 0) {
      displayExtractedTransactions();
      if (pdfStatus) {
        pdfStatus.textContent = `Found ${extractedTxns.length} potential transaction(s)`;
        pdfStatus.style.color = '#0369a1';
      }
    } else {
      console.warn('No transactions found in PDF. The PDF format might not be recognized.');
      if (pdfStatus) {
        pdfStatus.textContent = 'No transactions found. Try a different PDF format.';
        pdfStatus.style.color = '#b91c1c';
      }
    }
  } catch (error) {
    console.error('PDF parsing error:', error);
    if (error.message === 'PDF processing timeout') {
      console.error('PDF processing exceeded timeout limit');
      if (pdfStatus) {
        pdfStatus.textContent = 'PDF processing timeout. The PDF may be too large or complex.';
        pdfStatus.style.color = '#b91c1c';
      }
    } else {
      console.error('Error details:', error.message);
      if (pdfStatus) {
        pdfStatus.textContent = `Error processing PDF: ${error.message}. Please try again.`;
        pdfStatus.style.color = '#b91c1c';
      }
    }
  }
}

/**
 * Parse transactions from extracted PDF text
 * Attempts to identify transaction rows in bank statement format
 * @param {string} text - Full text extracted from PDF
 * @returns {Array} Array of transaction objects
 */
function parseTransactionsFromText(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Extract statement period dates (e.g., "October 17, 2025 through November 18, 2025")
  // This helps determine the year for MM/DD dates
  const periodMatch = text.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})\s+through\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/i);
  let statementYear = new Date().getFullYear();
  let statementStartMonth = 0, statementStartDay = 0;
  let statementEndMonth = 11, statementEndDay = 31;
  
  if (periodMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const startMonthName = periodMatch[1].toLowerCase();
    const startDay = parseInt(periodMatch[2]);
    const year = parseInt(periodMatch[3]);
    const endMonthName = periodMatch[4].toLowerCase();
    const endDay = parseInt(periodMatch[5]);
    
    statementYear = year;
    statementStartMonth = monthNames.indexOf(startMonthName);
    statementStartDay = startDay;
    statementEndMonth = monthNames.indexOf(endMonthName);
    statementEndDay = endDay;
  }

  /**
   * Convert MM/DD date format to full ISO date string
   * @param {string} monthDay - Date in MM/DD format
   * @returns {string|null} ISO date string (YYYY-MM-DD) or null if invalid
   */
  function parseStatementDate(monthDay) {
    if (!monthDay || typeof monthDay !== 'string') return null;
    
    const parts = monthDay.split('/');
    if (parts.length !== 2) return null;
    
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    
    // Validate month and day ranges before creating Date object
    if (!month || !day || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    
    // Determine which year based on statement period
    let year = statementYear;
    
    // Create date and verify it's valid (prevents dates like 02/30)
    try {
      const date = new Date(year, month - 1, day);
      // Verify the date components match (catches invalid dates like Feb 30)
      if (date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
      }
      return date.toISOString().slice(0, 10);
    } catch (e) {
      return null;
    }
  }

  // Regex patterns for identifying transaction rows
  const datePattern = /^(\d{1,2}\/\d{1,2})/; // MM/DD format at start of line
  const amountPattern = /\$?([\d,]+\.\d{2})\s*$/; // Amount at end of line
  
  // State tracking for parsing
  let currentSection = null; // 'income' or 'expense'
  let inTable = false;       // Whether we're in a transaction table
  let skipNext = false;       // Skip next line (usually header row)

  // Parse each line of the PDF text
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect section headers to determine transaction type
    if (line.match(/DEPOSITS\s+AND\s+ADDITIONS/i)) {
      currentSection = 'income';
      inTable = false;
      skipNext = true; // Skip header row
      continue;
    }
    if (line.match(/ATM\s*&\s*DEBIT\s+CARD\s*WITHDRAWALS/i) || 
        line.match(/ELECTRONIC\s+WITHDRAWALS/i)) {
      currentSection = 'expense';
      inTable = false;
      skipNext = true;
      continue;
    }
    if (line.match(/FEES/i)) {
      currentSection = 'expense';
      inTable = false;
      skipNext = true;
      continue;
    }

    // Skip table headers (DATE, DESCRIPTION, AMOUNT)
    if (line.match(/^\s*DATE\s*\|\s*DESCRIPTION/i) || 
        line.match(/^\s*DATE\s+DESCRIPTION/i) ||
        line.match(/^---/)) {
      inTable = true;
      skipNext = true;
      continue;
    }

    // Skip totals and balance lines
    if (line.match(/Total\s+/i) || 
        line.match(/^\s*Total\s+/i) ||
        line.match(/Beginning Balance/i) ||
        line.match(/Ending Balance/i)) {
      continue;
    }

    // Parse transaction rows (must be in a table, have a section, and not be a header)
    if (currentSection && inTable && !skipNext) {
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        const monthDay = dateMatch[1];
        const fullDate = parseStatementDate(monthDay);
        
        // Extract amount (usually at the end)
        const amountMatch = line.match(amountPattern);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          
          // Validate amount and date
          if (amount > 0 && amount < 1000000 && fullDate) {
            // Extract description (everything between date and amount)
            let desc = line
              .replace(datePattern, '')
              .replace(amountPattern, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            // Clean up description (remove table separators, normalize whitespace)
            desc = desc
              .replace(/^\|\s*/, '')
              .replace(/\s*\|\s*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            // If description is empty or too short, try next line
            // (sometimes descriptions span multiple lines)
            if (desc.length < 3 && i < lines.length - 1) {
              const nextLine = lines[i + 1].trim();
              if (!nextLine.match(datePattern) && !nextLine.match(amountPattern)) {
                desc = (desc + ' ' + nextLine).trim().substring(0, 100);
                i++; // Skip next line
              }
            }
            
            if (desc.length > 0) {
              // Infer category from description
              const category = inferCategory(desc);
              
              transactions.push({
                id: crypto.randomUUID(),
                desc: desc.substring(0, 100),
                amount: amount,
                type: currentSection,
                cat: category,
                date: fullDate,
                selected: true // Selected by default for user review
              });
            }
          }
        }
      }
    }
    
    skipNext = false;
  }

  // Fallback: if we didn't find many transactions, try a more lenient approach
  if (transactions.length < 5) {
    // Look for any line with MM/DD date and amount
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(/^(\d{1,2}\/\d{1,2})/);
      const amountMatch = line.match(/\$?([\d,]+\.\d{2})/);
      
      if (dateMatch && amountMatch) {
        const monthDay = dateMatch[1];
        const fullDate = parseStatementDate(monthDay);
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        
        if (fullDate && amount > 0 && amount < 1000000) {
          // Check if we already have this transaction
          const exists = transactions.some(t => 
            t.date === fullDate && 
            Math.abs(t.amount - amount) < 0.01
          );
          
          if (!exists) {
            let desc = line
              .replace(/^\d{1,2}\/\d{1,2}\s*/, '')
              .replace(/\$?[\d,]+\.\d{2}.*$/, '')
              .trim();
            
            // Try to get description from context
            if (desc.length < 5 && i < lines.length - 1) {
              const nextLine = lines[i + 1];
              if (!nextLine.match(/^\d{1,2}\/\d{1,2}/) && !nextLine.match(/\$?[\d,]+\.\d{2}/)) {
                desc = (desc + ' ' + nextLine).trim();
              }
            }
            
            if (desc.length > 0) {
              // Determine type based on context
              let type = 'expense';
              const lineLower = line.toLowerCase();
              if (lineLower.includes('deposit') || 
                  lineLower.includes('zelle payment from') ||
                  lineLower.includes('payroll') ||
                  lineLower.includes('transfer') && lineLower.includes('from')) {
                type = 'income';
              }
              
              const category = inferCategory(desc);
              
              transactions.push({
                id: crypto.randomUUID(),
                desc: desc.substring(0, 100),
                amount: amount,
                type: type,
                cat: category,
                date: fullDate,
                selected: true
              });
            }
          }
        }
      }
    }
  }

  // Remove duplicates
  const unique = [];
  const seen = new Set();
  transactions.forEach(t => {
    const key = `${t.date}-${t.amount}-${t.desc.substring(0, 30)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  });

  return unique;
}

function inferCategory(description) {
  const desc = description.toLowerCase();
  const categories = {
    'groceries': ['grocery', 'supermarket', 'walmart', 'target', 'kroger', 'safeway', 'wm supercenter'],
    'gas': ['gas', 'fuel', 'shell', 'chevron', 'bp', 'exxon', 'mobil'],
    'restaurant': ['restaurant', 'cafe', 'starbucks', 'mcdonald', 'subway', 'pizza', 'dining'],
    'utilities': ['electric', 'water', 'gas bill', 'utility', 'power', 'internet', 'phone', 'cell phone'],
    'rent': ['rent', 'housing', 'apartment', 'bilt', 'biltrent'],
    'shopping': ['amazon', 'store', 'shop', 'retail', 'purchase'],
    'entertainment': ['movie', 'netflix', 'spotify', 'entertainment', 'game'],
    'transportation': ['uber', 'lyft', 'taxi', 'bus', 'train', 'metro', 'atm withdrawal', 'atm'],
    'healthcare': ['pharmacy', 'medical', 'doctor', 'hospital', 'health', 'insurance', 'lemonade'],
    'income': ['salary', 'paycheck', 'deposit', 'payment received', 'payroll', 'zelle payment from', 'apple cash'],
    'transfers': ['transfer', 'schwab', 'goldman sachs', 'zelle payment to'],
    'credit cards': ['chase card', 'american express', 'applecard', 'payment to', 'ach pmt'],
    'debt': ['student loan', 'studntloan', 'advs ed serv', 'credit repayment', 'paypal'],
    'fees': ['fee', 'atm fee']
  };

  // Check in order of specificity
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => desc.includes(kw))) {
      return cat.charAt(0).toUpperCase() + cat.slice(1);
    }
  }
  return '';
}

function displayExtractedTransactions() {
  extractedTransactions.innerHTML = '';
  extractedTransactions.style.display = 'flex';
  pdfActions.style.display = 'block';

  extractedTxns.forEach((txn, idx) => {
    const div = document.createElement('div');
    div.className = 'extracted-transaction';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = txn.selected;
    checkbox.addEventListener('change', (e) => {
      txn.selected = e.target.checked;
    });

    const details = document.createElement('div');
    details.className = 'extracted-transaction-details';
    // Use safe DOM methods to prevent XSS
    const descDiv = document.createElement('div');
    const descStrong = document.createElement('strong');
    descStrong.textContent = txn.desc;
    descDiv.appendChild(descStrong);
    const metaDiv = document.createElement('div');
    metaDiv.style.fontSize = '11px';
    metaDiv.style.color = '#94a3b8';
    metaDiv.textContent = `${txn.cat || '—'} • ${txn.date} • ${txn.type}`;
    details.appendChild(descDiv);
    details.appendChild(metaDiv);

    const amount = document.createElement('div');
    amount.className = `extracted-transaction-amount ${txn.type === 'expense' ? 'neg' : 'pos'}`;
    amount.textContent = fmt(txn.type === 'expense' ? -txn.amount : txn.amount);

    const actions = document.createElement('div');
    actions.className = 'extracted-transaction-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      descEl.value = txn.desc;
      amtEl.value = txn.amount;
      typeEl.value = txn.type;
      catEl.value = txn.cat || '';
      dateEl.value = txn.date;
      closeMenu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => descEl.focus(), 300);
    });

    div.appendChild(checkbox);
    div.appendChild(details);
    div.appendChild(amount);
    actions.appendChild(editBtn);
    div.appendChild(actions);
    extractedTransactions.appendChild(div);
  });
}

addSelectedBtn.addEventListener('click', () => {
  const selected = extractedTxns.filter(t => t.selected);
  let addedCount = 0;
  let skippedCount = 0;
  
  selected.forEach(t => {
    // Validate extracted transaction data structure
    if (!t || typeof t !== 'object') {
      skippedCount++;
      return;
    }
    
    // Validate and sanitize description
    let desc = (t.desc || '').trim();
    if (!desc || desc.length === 0) {
      skippedCount++;
      return;
    }
    if (desc.length > 200) {
      desc = desc.substring(0, 200);
    }
    
    // Validate amount
    const amount = parseFloat(t.amount);
    if (isNaN(amount) || amount === 0 || Math.abs(amount) > 999999999.99) {
      skippedCount++;
      return;
    }
    
    // Validate type
    const type = t.type === 'income' || t.type === 'expense' ? t.type : 'expense';
    
    // Validate and sanitize category
    let cat = (t.cat || '').trim();
    if (cat.length > 100) {
      cat = cat.substring(0, 100);
    }
    
    // Validate date using strict validation
    let date = t.date || '';
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    } else {
      const validated = validateDate(date);
      if (!validated) {
        // If date is invalid, use current date instead of trying to "fix" it
        date = new Date().toISOString().slice(0, 10);
      } else {
        date = validated;
      }
    }
    
    // Add validated transaction
    delete t.selected;
    delete t.id; // Generate new ID
    txns.push({
      id: crypto.randomUUID(),
      desc: desc,
      amount: Math.abs(amount),
      type: type,
      cat: cat,
      date: date
    });
    addedCount++;
  });
  
  if (addedCount > 0) {
    save(txns);
    render();
  }
  extractedTransactions.style.display = 'none';
  pdfActions.style.display = 'none';
  
  if (skippedCount > 0) {
    pdfStatus.textContent = `Added ${addedCount} transaction(s), skipped ${skippedCount} invalid transaction(s)`;
    pdfStatus.style.color = '#f59e0b';
  } else {
    pdfStatus.textContent = `Added ${addedCount} transaction(s)`;
    pdfStatus.style.color = '#0369a1';
  }
  
  extractedTxns = [];
  pdfFileInput.value = '';
});

clearPdfBtn.addEventListener('click', () => {
  console.log('[PDF] Clearing extracted transactions');
  extractedTransactions.style.display = 'none';
  pdfActions.style.display = 'none';
  pdfStatus.textContent = '';
  extractedTxns = [];
  pdfFileInput.value = '';
});

// PWA: register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
      console.log('[PWA] Registering service worker');
      // Unregister any existing service workers first (to clear old cached versions)
      navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log('[PWA] Found', registrations.length, 'existing service worker registration(s)');
        registrations.forEach(registration => {
          registration.unregister().then(() => {
            console.log('[PWA] Old service worker unregistered');
          });
        });
        
        // Clear all caches to ensure fresh files
        caches.keys().then(cacheNames => {
          console.log('[PWA] Found', cacheNames.length, 'cache(s) to clear');
          return Promise.all(
            cacheNames.map(cacheName => {
              console.log('[PWA] Deleting cache:', cacheName);
              return caches.delete(cacheName);
            })
          );
        }).then(() => {
          console.log('[PWA] All caches cleared');
          
          // Wait a moment, then register new service worker
          setTimeout(() => {
            navigator.serviceWorker.register('./service-worker.js')
              .then(registration => {
                console.log('[PWA] Service Worker registered successfully, scope:', registration.scope);
                
                // Force immediate activation
                if (registration.waiting) {
                  console.log('[PWA] Service worker waiting, sending skip waiting message');
                  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                
                // Check for updates periodically
                registration.addEventListener('updatefound', () => {
                  console.log('[PWA] Service Worker update found');
                  const newWorker = registration.installing;
                  if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                      console.log('[PWA] Service worker state changed:', newWorker.state);
                      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available, reload to activate
                        console.log('[PWA] New service worker installed, reloading page...');
                        window.location.reload();
                      }
                    });
                  }
                });
              })
              .catch(error => {
                console.error('[PWA] Service Worker registration failed:', error);
                // Don't show error to user as app works without service worker
              });
          }, 100);
        });
      });
  });
}

