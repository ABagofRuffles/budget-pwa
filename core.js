export const CATEGORIES = [
  { name: 'Housing', group: 'Essential', color: '#496B63' },
  { name: 'Utilities', group: 'Essential', color: '#617E9C' },
  { name: 'Groceries', group: 'Essential', color: '#C87D4E' },
  { name: 'Dining', group: 'Flexible', color: '#D79C3F' },
  { name: 'Transportation', group: 'Essential', color: '#7A6A9D' },
  { name: 'Healthcare', group: 'Essential', color: '#B85C62' },
  { name: 'Debt', group: 'Financial', color: '#586271' },
  { name: 'Shopping', group: 'Flexible', color: '#A86F83' },
  { name: 'Entertainment', group: 'Flexible', color: '#6A78B8' },
  { name: 'Subscriptions', group: 'Flexible', color: '#3E8C8C' },
  { name: 'Travel', group: 'Flexible', color: '#3983A7' },
  { name: 'Personal', group: 'Flexible', color: '#9B7653' },
  { name: 'Gifts', group: 'Flexible', color: '#A46767' },
  { name: 'Transfers', group: 'Financial', color: '#7B8794' },
  { name: 'Other', group: 'Flexible', color: '#899079' }
];

export const CATEGORY_NAMES = CATEGORIES.map(category => category.name);

export function toCents(value) {
  const number = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

export function formatMoney(cents, options = {}) {
  const { signed = false, compact = false } = options;
  const value = fromCents(cents);
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact && Math.abs(value) >= 1000 ? 0 : 2
  });
  if (!signed || value === 0) return formatter.format(value);
  return `${value > 0 ? '+' : '-'}${formatter.format(Math.abs(value))}`;
}

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentMonth(date = new Date()) {
  return localISODate(date).slice(0, 7);
}

export function selectNewestState(indexedState, fallbackState) {
  if (!indexedState) return fallbackState || null;
  if (!fallbackState) return indexedState;
  const indexedTime = Date.parse(indexedState.updatedAt || '') || 0;
  const fallbackTime = Date.parse(fallbackState.updatedAt || '') || 0;
  return fallbackTime > indexedTime ? fallbackState : indexedState;
}

export function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month, short = false) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: short ? 'short' : 'long',
    year: 'numeric'
  }).format(new Date(year, monthNumber - 1, 1));
}

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function normalizeTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') return null;
  const description = String(transaction.description ?? transaction.desc ?? '').trim().slice(0, 160);
  const type = transaction.type === 'income' ? 'income' : transaction.type === 'transfer' ? 'transfer' : 'expense';
  const cents = Number.isInteger(transaction.amountCents)
    ? Math.abs(transaction.amountCents)
    : Math.abs(toCents(transaction.amount) ?? 0);
  const date = isValidDate(transaction.date) ? transaction.date : localISODate();
  if (!description || !cents || cents > 99999999999) return null;
  return {
    id: String(transaction.id || crypto.randomUUID()),
    description,
    amountCents: cents,
    type,
    category: CATEGORY_NAMES.includes(transaction.category || transaction.cat)
      ? (transaction.category || transaction.cat)
      : inferCategory(description, type),
    date,
    note: String(transaction.note || '').trim().slice(0, 300),
    createdAt: transaction.createdAt || new Date().toISOString()
  };
}

export function inferCategory(description, type = 'expense') {
  if (type === 'income') return 'Other';
  if (type === 'transfer') return 'Transfers';
  const text = String(description).toLowerCase();
  const rules = [
    ['Housing', ['rent', 'mortgage', 'apartment', 'bilt']],
    ['Subscriptions', ['netflix', 'hulu', 'disney+', 'spotify', 'apple.com/bill', 'youtube premium', 'membership']],
    ['Groceries', ['safeway', 'kroger', 'trader joe', 'whole foods', 'costco', 'grocery', 'market']],
    ['Dining', ['restaurant', 'cafe', 'coffee', 'starbucks', 'doordash', 'ubereats', 'grubhub', 'pizza']],
    ['Transportation', ['shell', 'chevron', 'exxon', 'fuel', 'parking', 'toll', 'uber trip', 'lyft']],
    ['Utilities', ['electric', 'water bill', 'internet', 'comcast', 'xfinity', 'google fi', 'mint mobile']],
    ['Healthcare', ['pharmacy', 'medical', 'dental', 'doctor', 'hospital', 'health']],
    ['Debt', ['student loan', 'loan payment', 'credit card payment']],
    ['Entertainment', ['cinema', 'movie', 'steam games', 'playstation', 'xbox', 'nintendo']],
    ['Travel', ['airlines', 'airbnb', 'hotel', 'booking.com']],
    ['Shopping', ['amazon', 'target', 'walmart', 'best buy']],
    ['Transfers', ['transfer', 'zelle', 'venmo', 'cash app']]
  ];
  return rules.find(([, keywords]) => keywords.some(keyword => text.includes(keyword)))?.[0] || 'Other';
}

export function transactionFingerprint(transaction) {
  return [
    transaction.date,
    transaction.type,
    transaction.amountCents,
    transaction.description.toLowerCase().replace(/\s+/g, ' ').trim()
  ].join('|');
}

export function summarizeMonth(transactions, budgets, month) {
  const monthly = transactions.filter(transaction => transaction.date.startsWith(month));
  const incomeCents = monthly
    .filter(transaction => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const expenseTransactions = monthly.filter(transaction => transaction.type === 'expense');
  const spentCents = expenseTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const categorySpending = Object.fromEntries(CATEGORY_NAMES.map(name => [name, 0]));
  expenseTransactions.forEach(transaction => {
    categorySpending[transaction.category] = (categorySpending[transaction.category] || 0) + transaction.amountCents;
  });
  const monthBudget = budgets[month] || { incomeTargetCents: 0, categories: {} };
  const plannedCents = Object.values(monthBudget.categories || {}).reduce((sum, cents) => sum + (Number(cents) || 0), 0);
  return {
    transactions: monthly,
    incomeCents,
    spentCents,
    netCents: incomeCents - spentCents,
    plannedCents,
    remainingBudgetCents: plannedCents - spentCents,
    categorySpending
  };
}

export function compareMonths(transactions, month) {
  const current = summarizeMonth(transactions, {}, month);
  const previous = summarizeMonth(transactions, {}, shiftMonth(month, -1));
  return {
    current: current.spentCents,
    previous: previous.spentCents,
    difference: current.spentCents - previous.spentCents,
    percent: previous.spentCents ? Math.round(((current.spentCents - previous.spentCents) / previous.spentCents) * 100) : null
  };
}

export function compareRecentWeeks(transactions, month, today = localISODate()) {
  const [year, monthNumber] = month.split('-').map(Number);
  const todayMonth = today.slice(0, 7);
  const anchor = todayMonth === month
    ? new Date(`${today}T12:00:00`)
    : new Date(year, monthNumber, 0, 12);
  const startCurrent = new Date(anchor);
  startCurrent.setDate(anchor.getDate() - 6);
  const endPrevious = new Date(startCurrent);
  endPrevious.setDate(startCurrent.getDate() - 1);
  const startPrevious = new Date(endPrevious);
  startPrevious.setDate(endPrevious.getDate() - 6);
  const expenseTotal = (start, end) => transactions
    .filter(transaction => transaction.type === 'expense')
    .filter(transaction => {
      const date = new Date(`${transaction.date}T12:00:00`);
      return date >= start && date <= end;
    })
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const current = expenseTotal(startCurrent, anchor);
  const previous = expenseTotal(startPrevious, endPrevious);
  return {
    current,
    previous,
    difference: current - previous,
    percent: previous ? Math.round(((current - previous) / previous) * 100) : null
  };
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(header => header.toLowerCase().replace(/[^a-z]/g, ''));
  return rows.map(values => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    const rawAmount = record.amount || record.debit || record.credit;
    const amount = Number.parseFloat(String(rawAmount).replace(/[$,()]/g, '').replace(/^\s*-/, '-'));
    const inferredType = record.type?.toLowerCase() || (record.credit ? 'income' : amount < 0 ? 'expense' : 'expense');
    const date = normalizeImportedDate(record.date);
    if (!date) return null;
    return normalizeTransaction({
      description: record.description || record.memo || record.name || record.merchant,
      amount: Math.abs(amount),
      type: inferredType.includes('income') || inferredType.includes('credit') ? 'income' : inferredType.includes('transfer') ? 'transfer' : 'expense',
      category: record.category,
      date
    });
  }).filter(Boolean);
}

export function normalizeImportedDate(value) {
  const clean = String(value || '').trim();
  if (isValidDate(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  const normalized = `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return isValidDate(normalized) ? normalized : null;
}

function extractStatementPeriod(text) {
  const numeric = String(text).match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:through|to|[-–—])\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  if (numeric) {
    const start = normalizeImportedDate(numeric[1]);
    const end = normalizeImportedDate(numeric[2]);
    if (start && end) return { start, end };
  }

  const monthNames = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  const written = String(text).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s*(?:through|to|[-–—])\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!written) return null;
  const start = `${written[3]}-${String(monthNames[written[1].toLowerCase()]).padStart(2, '0')}-${written[2].padStart(2, '0')}`;
  const end = `${written[6]}-${String(monthNames[written[4].toLowerCase()]).padStart(2, '0')}-${written[5].padStart(2, '0')}`;
  return isValidDate(start) && isValidDate(end) ? { start, end } : null;
}

export function resolveStatementDate(value, statementText) {
  const clean = String(value || '').trim();
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(clean)) return normalizeImportedDate(clean);
  const match = clean.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const period = extractStatementPeriod(statementText);
  if (!period) return null;
  const years = [...new Set([period.start.slice(0, 4), period.end.slice(0, 4)])];
  const candidates = years
    .map(year => `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`)
    .filter(isValidDate)
    .filter(date => date >= period.start && date <= period.end);
  return candidates.length === 1 ? candidates[0] : null;
}

export function parseOFX(text) {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  return blocks.map(block => {
    const get = tag => block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))?.[1]?.trim() || '';
    const amount = Number.parseFloat(get('TRNAMT'));
    const transactionType = get('TRNTYPE').toUpperCase();
    const dateRaw = get('DTPOSTED');
    const date = /^\d{8}/.test(dateRaw)
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : null;
    if (!isValidDate(date)) return null;
    return normalizeTransaction({
      id: get('FITID') || crypto.randomUUID(),
      description: get('NAME') || get('MEMO'),
      amount: Math.abs(amount),
      type: transactionType === 'XFER' ? 'transfer' : amount >= 0 ? 'income' : 'expense',
      date
    });
  }).filter(Boolean);
}

export function escapeCSV(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t]/.test(text)) text = `\t${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
