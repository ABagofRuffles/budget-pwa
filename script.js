import {
  CATEGORIES,
  CATEGORY_NAMES,
  compareMonths,
  compareRecentWeeks,
  currentMonth,
  escapeCSV,
  formatMoney,
  fromCents,
  inferCategory,
  localISODate,
  monthLabel,
  normalizeImportedDate,
  normalizeTransaction,
  parseCSV,
  parseOFX,
  shiftMonth,
  summarizeMonth,
  toCents,
  transactionFingerprint
} from './core.js';

const DB_NAME = 'quickbudget';
const DB_VERSION = 1;
const STORE_NAME = 'app-state';
const STATE_KEY = 'primary';
const LEGACY_TRANSACTION_KEY = 'qb_txns_v1';
const LEGACY_WORKSHEET_KEY = 'qb_ws_v1';

const emptyState = () => ({
  version: 2,
  transactions: [],
  budgets: {},
  settings: { currency: 'USD' },
  legacyWorksheet: null,
  migratedAt: null
});

let state = emptyState();
let selectedMonth = currentMonth();
let importCandidates = [];
let lastDeleted = null;
let toastTimer = null;
let saveTimer = null;
let storageMode = 'indexeddb';

const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map(element => [element.id, element])
);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredState() {
  if (storageMode === 'local') return JSON.parse(localStorage.getItem('qb_state_v2') || 'null');
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeStoredState() {
  if (storageMode === 'local') {
    localStorage.setItem('qb_state_v2', JSON.stringify(state));
    return;
  }
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    writeStoredState().catch(error => {
      console.error('[Storage] Could not save data', error);
      showToast('Your latest change could not be saved.');
    });
  }, 120);
}

function legacyBudgetFromWorksheet(worksheet) {
  const sum = prefix => Object.entries(worksheet || {})
    .filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, value]) => total + (toCents(value) || 0), 0);
  return {
    incomeTargetCents: sum('0-'),
    categories: {
      Housing: sum('1-0-'), Utilities: sum('1-1-'), Groceries: sum('1-2-'),
      Transportation: sum('1-3-'), Debt: sum('1-4-'), Healthcare: sum('1-5-'),
      Personal: sum('2-0-') + sum('2-1-') + sum('2-2-') + sum('2-3-'),
      Gifts: sum('2-4-'), Travel: sum('2-5-'), Entertainment: sum('2-6-'), Other: sum('3-')
    }
  };
}

function migrateLegacyData() {
  let legacyTransactions = [];
  let legacyWorksheet = null;
  try { legacyTransactions = JSON.parse(localStorage.getItem(LEGACY_TRANSACTION_KEY) || '[]'); } catch { legacyTransactions = []; }
  try { legacyWorksheet = JSON.parse(localStorage.getItem(LEGACY_WORKSHEET_KEY) || 'null'); } catch { legacyWorksheet = null; }
  const migrated = emptyState();
  migrated.transactions = legacyTransactions.map(transaction => normalizeTransaction(transaction)).filter(Boolean);
  if (legacyWorksheet && typeof legacyWorksheet === 'object') {
    migrated.budgets[currentMonth()] = legacyBudgetFromWorksheet(legacyWorksheet);
    migrated.legacyWorksheet = legacyWorksheet;
  }
  if (migrated.transactions.length || migrated.legacyWorksheet) migrated.migratedAt = new Date().toISOString();
  return migrated;
}

function validateState(candidate) {
  const validated = emptyState();
  if (!candidate || typeof candidate !== 'object') return validated;
  validated.transactions = Array.isArray(candidate.transactions)
    ? candidate.transactions.map(transaction => normalizeTransaction(transaction)).filter(Boolean)
    : [];
  if (candidate.budgets && typeof candidate.budgets === 'object') {
    Object.entries(candidate.budgets).forEach(([month, budget]) => {
      if (!/^\d{4}-\d{2}$/.test(month) || !budget || typeof budget !== 'object') return;
      validated.budgets[month] = {
        incomeTargetCents: Math.max(0, Number(budget.incomeTargetCents) || 0),
        categories: Object.fromEntries(CATEGORY_NAMES.map(name => [name, Math.max(0, Number(budget.categories?.[name]) || 0)]))
      };
    });
  }
  validated.legacyWorksheet = candidate.legacyWorksheet || null;
  validated.migratedAt = candidate.migratedAt || null;
  return validated;
}

async function loadState() {
  try {
    const stored = await readStoredState();
    state = stored ? validateState(stored) : migrateLegacyData();
    if (!stored) await writeStoredState();
  } catch (error) {
    console.warn('[Storage] IndexedDB unavailable, using localStorage', error);
    storageMode = 'local';
    try {
      const fallbackState = await readStoredState();
      state = fallbackState ? validateState(fallbackState) : migrateLegacyData();
      await writeStoredState();
    } catch (fallbackError) {
      console.error('[Storage] Browser storage unavailable', fallbackError);
      state = migrateLegacyData();
      showToast('Private storage is unavailable. Export a backup before leaving.');
    }
  }
}

function monthBudget() {
  if (!state.budgets[selectedMonth]) {
    state.budgets[selectedMonth] = {
      incomeTargetCents: 0,
      categories: Object.fromEntries(CATEGORY_NAMES.map(name => [name, 0]))
    };
  }
  return state.budgets[selectedMonth];
}

function setText(id, value) {
  if (elements[id]) elements[id].textContent = value;
}

function showView(name, updateHash = true) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `${name}View`));
  document.querySelectorAll('.nav-item[data-view]').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (updateHash) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function makeEmpty(message) {
  const fragment = elements.emptyStateTemplate.content.cloneNode(true);
  fragment.querySelector('span').textContent = message;
  return fragment;
}

function renderTransactionRow(transaction, actions = true, selectable = false) {
  const row = document.createElement('div');
  row.className = 'transaction-row';
  row.dataset.id = transaction.id;

  if (selectable) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'import-check';
    checkbox.checked = transaction.selected;
    checkbox.ariaLabel = `Import ${transaction.description}`;
    checkbox.addEventListener('change', () => { transaction.selected = checkbox.checked; });
    row.appendChild(checkbox);
  } else {
    const icon = document.createElement('span');
    icon.className = 'transaction-icon';
    icon.textContent = transaction.type === 'income' ? 'IN' : transaction.type === 'transfer' ? '↔' : transaction.category.slice(0, 2).toUpperCase();
    row.appendChild(icon);
  }

  const description = document.createElement('div');
  description.className = 'transaction-description';
  const descriptionStrong = document.createElement('strong');
  descriptionStrong.textContent = transaction.description;
  const note = document.createElement('small');
  note.textContent = transaction.note || transaction.category;
  description.append(descriptionStrong, note);

  const category = document.createElement('span');
  category.className = 'transaction-category';
  category.textContent = transaction.category;

  const date = document.createElement('time');
  date.className = 'transaction-date';
  date.dateTime = transaction.date;
  date.textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date(`${transaction.date}T12:00:00`));

  const amount = document.createElement('strong');
  amount.className = `transaction-amount ${transaction.type}`;
  const signedCents = transaction.type === 'income' ? transaction.amountCents : transaction.type === 'expense' ? -transaction.amountCents : 0;
  amount.textContent = transaction.type === 'transfer' ? formatMoney(transaction.amountCents) : formatMoney(signedCents, { signed: true });

  row.append(description, category, date, amount);

  if (actions) {
    const actionBox = document.createElement('div');
    actionBox.className = 'transaction-actions';
    const edit = document.createElement('button');
    edit.className = 'row-action';
    edit.type = 'button';
    edit.ariaLabel = `Edit ${transaction.description}`;
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openTransactionDialog(transaction));
    const remove = document.createElement('button');
    remove.className = 'row-action delete';
    remove.type = 'button';
    remove.ariaLabel = `Delete ${transaction.description}`;
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteTransaction(transaction.id));
    actionBox.append(edit, remove);
    row.appendChild(actionBox);
  }
  return row;
}

function renderOverview() {
  const budget = monthBudget();
  const summary = summarizeMonth(state.transactions, state.budgets, selectedMonth);
  const comparison = compareMonths(state.transactions, selectedMonth);
  const weekComparison = compareRecentWeeks(state.transactions, selectedMonth);
  setText('availableTotal', formatMoney(summary.netCents));
  setText('incomeTotal', formatMoney(summary.incomeCents));
  setText('spentTotal', formatMoney(summary.spentCents));
  setText('plannedTotal', formatMoney(summary.plannedCents));
  setText('budgetLeftTotal', formatMoney(summary.remainingBudgetCents));
  elements.availableTotal.classList.toggle('negative-value', summary.netCents < 0);
  elements.budgetLeftTotal.classList.toggle('negative-value', summary.remainingBudgetCents < 0);

  if (comparison.percent === null) {
    setText('monthComparison', comparison.current ? 'No previous-month spending to compare yet.' : 'Add transactions to start seeing month-over-month changes.');
  } else {
    const direction = comparison.difference > 0 ? 'more' : comparison.difference < 0 ? 'less' : 'the same as';
    setText('monthComparison', comparison.difference === 0
      ? `Spending is the same as ${monthLabel(shiftMonth(selectedMonth, -1), true)}.`
      : `You spent ${formatMoney(Math.abs(comparison.difference))} ${direction} than ${monthLabel(shiftMonth(selectedMonth, -1), true)}.`);
  }

  const ranked = CATEGORIES.map(category => ({
    ...category,
    spent: summary.categorySpending[category.name] || 0,
    planned: budget.categories[category.name] || 0
  })).filter(category => category.spent || category.planned)
    .sort((a, b) => b.spent - a.spent || b.planned - a.planned)
    .slice(0, 6);
  elements.categoryOverview.replaceChildren();
  if (!ranked.length) {
    elements.categoryOverview.appendChild(makeEmpty('Set a monthly plan or add an expense to see your categories.'));
  } else {
    ranked.forEach(category => {
      const row = document.createElement('div');
      row.className = 'category-row';
      const name = document.createElement('div');
      name.className = 'category-name';
      name.textContent = category.name;
      const group = document.createElement('small');
      group.textContent = category.group;
      name.appendChild(group);
      const track = document.createElement('progress');
      const categoryClass = category.name.toLowerCase().replace(/[^a-z]+/g, '-');
      track.className = `progress-track category-${categoryClass} ${category.planned && category.spent > category.planned ? 'over' : ''}`;
      track.max = Math.max(category.planned, category.spent, 1);
      track.value = category.spent;
      track.ariaLabel = `${category.name}: ${formatMoney(category.spent)} spent of ${formatMoney(category.planned)} planned`;
      const amount = document.createElement('div');
      amount.className = 'category-amount';
      const spent = document.createElement('strong');
      spent.textContent = formatMoney(category.spent);
      const planned = document.createElement('small');
      planned.textContent = category.planned ? `of ${formatMoney(category.planned)}` : 'not planned';
      amount.append(spent, planned);
      row.append(name, track, amount);
      elements.categoryOverview.appendChild(row);
    });
  }

  renderAttention(summary, budget, comparison, weekComparison);
  const recent = [...summary.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  elements.recentTransactions.replaceChildren();
  if (!recent.length) elements.recentTransactions.appendChild(makeEmpty('No transactions in this month.'));
  else recent.forEach(transaction => elements.recentTransactions.appendChild(renderTransactionRow(transaction, false)));
}

function renderAttention(summary, budget, comparison, weekComparison) {
  const signals = [];
  CATEGORIES.forEach(category => {
    const planned = budget.categories[category.name] || 0;
    const spent = summary.categorySpending[category.name] || 0;
    if (planned && spent > planned) signals.push({ danger: true, title: `${category.name} is over plan`, detail: `${formatMoney(spent - planned)} beyond the amount you set.` });
    else if (!planned && spent > 0) signals.push({ title: `${category.name} was unplanned`, detail: `${formatMoney(spent)} spent without a target.` });
  });
  const subscriptions = summary.categorySpending.Subscriptions || 0;
  if (subscriptions) signals.push({ title: `${formatMoney(subscriptions)} in subscriptions`, detail: 'Review recurring charges before next month.' });
  if (comparison.percent !== null && comparison.percent >= 15) signals.push({ danger: true, title: `Spending is up ${comparison.percent}%`, detail: 'Compared with the previous month.' });
  if (weekComparison.percent !== null && Math.abs(weekComparison.percent) >= 15) {
    signals.push({
      danger: weekComparison.percent > 0,
      title: `Recent spending is ${weekComparison.percent > 0 ? 'up' : 'down'} ${Math.abs(weekComparison.percent)}%`,
      detail: `The latest seven days total ${formatMoney(weekComparison.current)}, compared with ${formatMoney(weekComparison.previous)} before that.`
    });
  }
  if (!signals.length && summary.spentCents) signals.push({ title: 'Everything is tracking normally', detail: 'No categories are currently over plan.' });

  elements.attentionList.replaceChildren();
  if (!signals.length) elements.attentionList.appendChild(makeEmpty('Signals appear after you add activity and a plan.'));
  else signals.slice(0, 5).forEach(signal => {
    const item = document.createElement('div');
    item.className = `signal-item ${signal.danger ? 'danger' : ''}`;
    const title = document.createElement('strong');
    title.textContent = signal.title;
    const detail = document.createElement('span');
    detail.textContent = signal.detail;
    item.append(title, detail);
    elements.attentionList.appendChild(item);
  });
}

function renderTransactions() {
  const query = elements.transactionSearch.value.trim().toLowerCase();
  const type = elements.transactionTypeFilter.value;
  const category = elements.transactionCategoryFilter.value;
  const transactions = state.transactions
    .filter(transaction => transaction.date.startsWith(selectedMonth))
    .filter(transaction => type === 'all' || transaction.type === type)
    .filter(transaction => category === 'all' || transaction.category === category)
    .filter(transaction => !query || `${transaction.description} ${transaction.category} ${transaction.note}`.toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  setText('transactionCount', `${transactions.length} transaction${transactions.length === 1 ? '' : 's'} in ${monthLabel(selectedMonth)}`);
  elements.allTransactions.replaceChildren();
  if (!transactions.length) elements.allTransactions.appendChild(makeEmpty(query || type !== 'all' || category !== 'all' ? 'No transactions match these filters.' : 'Add or import your first transaction for this month.'));
  else transactions.forEach(transaction => elements.allTransactions.appendChild(renderTransactionRow(transaction)));
}

function renderPlan() {
  const budget = monthBudget();
  const summary = summarizeMonth(state.transactions, state.budgets, selectedMonth);
  elements.incomeTarget.value = fromCents(budget.incomeTargetCents).toFixed(2);
  setText('planExpenseTotal', formatMoney(summary.plannedCents));
  setText('unassignedTotal', formatMoney(budget.incomeTargetCents - summary.plannedCents));
  elements.unassignedTotal.classList.toggle('negative-value', budget.incomeTargetCents - summary.plannedCents < 0);
  elements.budgetGroups.replaceChildren();
  ['Essential', 'Flexible', 'Financial'].forEach(groupName => {
    const categories = CATEGORIES.filter(category => category.group === groupName);
    const group = document.createElement('section');
    group.className = 'budget-group';
    const heading = document.createElement('div');
    heading.className = 'budget-group-heading';
    const title = document.createElement('h2');
    title.textContent = groupName;
    const total = document.createElement('strong');
    total.textContent = formatMoney(categories.reduce((sum, category) => sum + (budget.categories[category.name] || 0), 0));
    heading.append(title, total);
    group.appendChild(heading);
    categories.forEach(category => {
      const line = document.createElement('div');
      line.className = 'budget-line';
      const label = document.createElement('label');
      label.htmlFor = `budget-${category.name}`;
      label.textContent = category.name;
      const spent = document.createElement('small');
      spent.textContent = `${formatMoney(summary.categorySpending[category.name] || 0)} spent`;
      label.appendChild(spent);
      const input = document.createElement('input');
      input.id = `budget-${category.name}`;
      input.className = 'budget-input';
      input.inputMode = 'decimal';
      input.value = fromCents(budget.categories[category.name] || 0).toFixed(2);
      input.dataset.category = category.name;
      input.addEventListener('change', () => {
        budget.categories[category.name] = Math.max(0, toCents(input.value) || 0);
        queueSave();
        renderAll();
      });
      line.append(label, input);
      group.appendChild(line);
    });
    elements.budgetGroups.appendChild(group);
  });
}

function renderAll() {
  setText('monthLabel', monthLabel(selectedMonth));
  elements.monthPicker.value = selectedMonth;
  renderOverview();
  renderTransactions();
  renderPlan();
}

function openTransactionDialog(transaction = null) {
  elements.transactionForm.reset();
  elements.transactionId.value = transaction?.id || '';
  setText('transactionDialogEyebrow', transaction ? 'UPDATE ENTRY' : 'NEW ENTRY');
  setText('transactionDialogTitle', transaction ? 'Edit transaction' : 'Add transaction');
  elements.transactionDescription.value = transaction?.description || '';
  elements.transactionAmount.value = transaction ? fromCents(transaction.amountCents).toFixed(2) : '';
  elements.transactionType.value = transaction?.type || 'expense';
  elements.transactionCategory.value = transaction?.category || 'Other';
  elements.transactionDate.value = transaction?.date || (selectedMonth === currentMonth() ? localISODate() : `${selectedMonth}-01`);
  elements.transactionNote.value = transaction?.note || '';
  elements.transactionDialog.showModal();
  window.setTimeout(() => elements.transactionDescription.focus(), 30);
}

function saveTransaction(event) {
  event.preventDefault();
  const id = elements.transactionId.value;
  const type = elements.transactionType.value;
  const transaction = normalizeTransaction({
    id: id || crypto.randomUUID(),
    description: elements.transactionDescription.value,
    amount: elements.transactionAmount.value,
    type,
    category: type === 'income' ? 'Other' : type === 'transfer' ? 'Transfers' : elements.transactionCategory.value,
    date: elements.transactionDate.value,
    note: elements.transactionNote.value,
    createdAt: id ? state.transactions.find(item => item.id === id)?.createdAt : new Date().toISOString()
  });
  if (!transaction) {
    showToast('Enter a description and an amount greater than zero.');
    return;
  }
  const existingIndex = state.transactions.findIndex(item => item.id === id);
  if (existingIndex >= 0) state.transactions[existingIndex] = transaction;
  else state.transactions.push(transaction);
  selectedMonth = transaction.date.slice(0, 7);
  queueSave();
  elements.transactionDialog.close();
  renderAll();
  showToast(existingIndex >= 0 ? 'Transaction updated.' : 'Transaction added.');
}

function deleteTransaction(id) {
  const index = state.transactions.findIndex(transaction => transaction.id === id);
  if (index < 0) return;
  lastDeleted = { transaction: state.transactions[index], index };
  state.transactions.splice(index, 1);
  queueSave();
  renderAll();
  showToast('Transaction deleted.', 'Undo', () => {
    if (!lastDeleted) return;
    state.transactions.splice(lastDeleted.index, 0, lastDeleted.transaction);
    lastDeleted = null;
    queueSave();
    renderAll();
    showToast('Transaction restored.');
  });
}

function showToast(message, actionLabel = '', action = null) {
  window.clearTimeout(toastTimer);
  setText('toastMessage', message);
  elements.toastAction.classList.toggle('hidden', !actionLabel);
  elements.toastAction.textContent = actionLabel;
  elements.toastAction.onclick = action || null;
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), actionLabel ? 7000 : 3500);
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  const backup = { application: 'QuickBudget', exportedAt: new Date().toISOString(), schemaVersion: 2, data: state };
  download(JSON.stringify(backup, null, 2), `quickbudget-backup-${localISODate()}.json`, 'application/json');
  showToast('Complete backup downloaded.');
}

function exportTransactionsCSV() {
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Note']];
  state.transactions.forEach(transaction => rows.push([
    transaction.date, transaction.type, transaction.description, transaction.category,
    fromCents(transaction.amountCents).toFixed(2), transaction.note
  ]));
  download(rows.map(row => row.map(escapeCSV).join(',')).join('\n'), `quickbudget-transactions-${localISODate()}.csv`, 'text/csv;charset=utf-8');
  showToast('Transaction CSV downloaded.');
}

async function parsePDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF tools are unavailable. Check your connection and try again.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const documentData = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const transactions = [];
  for (let pageNumber = 1; pageNumber <= Math.min(documentData.numPages, 100); pageNumber += 1) {
    const page = await documentData.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map();
    content.items.forEach(item => {
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push(item);
    });
    [...lines.keys()].sort((a, b) => b - a).forEach(y => {
      const line = lines.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(' ').trim();
      const match = line.match(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})?$/);
      if (!match) return;
      const numeric = Number.parseFloat(match[3].replace(/[$,]/g, ''));
      const date = match[1].split(/[/-]/).length === 2
        ? normalizeImportedDate(`${match[1]}/${selectedMonth.slice(0, 4)}`)
        : normalizeImportedDate(match[1]);
      const type = numeric > 0 && /deposit|payroll|payment from|interest/i.test(match[2]) ? 'income' : 'expense';
      const transaction = normalizeTransaction({ description: match[2], amount: Math.abs(numeric), type, date });
      if (transaction) transactions.push(transaction);
    });
  }
  return transactions;
}

async function handleImportFile(file) {
  if (!file) return;
  const extension = file.name.split('.').pop().toLowerCase();
  if (file.size > 12 * 1024 * 1024) {
    setImportStatus('File is too large. The limit is 12 MB.', true);
    return;
  }
  setImportStatus(`Reading ${file.name}…`);
  try {
    if (extension === 'json') {
      const backup = JSON.parse(await file.text());
      const candidate = backup.application === 'QuickBudget' ? backup.data : backup;
      if (!candidate || !Array.isArray(candidate.transactions)) throw new Error('This is not a valid QuickBudget backup.');
      if (!window.confirm('Restore this backup? Your current QuickBudget data will be replaced.')) return;
      state = validateState(candidate);
      await writeStoredState();
      renderAll();
      setImportStatus(`Restored ${state.transactions.length} transactions and ${Object.keys(state.budgets).length} monthly plans.`);
      return;
    }
    let parsed = [];
    if (extension === 'csv') parsed = parseCSV(await file.text());
    else if (extension === 'qfx' || extension === 'ofx') parsed = parseOFX(await file.text());
    else if (extension === 'pdf') parsed = await parsePDF(file);
    else throw new Error('Choose a CSV, QFX, OFX, PDF, or QuickBudget JSON file.');
    prepareImportPreview(parsed);
  } catch (error) {
    console.error('[Import] Could not process file', error);
    setImportStatus(error.message || 'This file could not be processed.', true);
  } finally {
    elements.importFile.value = '';
  }
}

function prepareImportPreview(parsed) {
  const existing = new Set(state.transactions.map(transactionFingerprint));
  const batch = new Set();
  let duplicateCount = 0;
  importCandidates = [];
  parsed.forEach(transaction => {
    const fingerprint = transactionFingerprint(transaction);
    const duplicate = existing.has(fingerprint) || batch.has(fingerprint);
    if (duplicate) duplicateCount += 1;
    else {
      batch.add(fingerprint);
      importCandidates.push({ ...transaction, selected: true });
    }
  });
  elements.importPreview.replaceChildren();
  if (!importCandidates.length) {
    elements.importPreviewPanel.classList.add('hidden');
    setImportStatus(parsed.length ? 'Every transaction in this file is already in QuickBudget.' : 'No recognizable transactions were found.', Boolean(!parsed.length));
    return;
  }
  importCandidates.slice(0, 200).forEach(transaction => elements.importPreview.appendChild(renderTransactionRow(transaction, false, true)));
  setText('duplicateSummary', `${importCandidates.length} new transaction${importCandidates.length === 1 ? '' : 's'} found${duplicateCount ? `; ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped` : ''}.`);
  elements.importPreviewPanel.classList.remove('hidden');
  setImportStatus('Review the transactions below before adding them.');
  elements.importPreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confirmImport() {
  const selected = importCandidates.filter(transaction => transaction.selected).map(({ selected: ignored, ...transaction }) => transaction);
  state.transactions.push(...selected);
  queueSave();
  importCandidates = [];
  elements.importPreviewPanel.classList.add('hidden');
  renderAll();
  setImportStatus(`Added ${selected.length} transaction${selected.length === 1 ? '' : 's'}.`);
  showToast('Import complete.');
}

function setImportStatus(message, error = false) {
  elements.importStatus.textContent = message;
  elements.importStatus.classList.toggle('error', error);
}

function bindEvents() {
  document.querySelectorAll('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('[data-go-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.goView)));
  elements.previousMonth.addEventListener('click', () => { selectedMonth = shiftMonth(selectedMonth, -1); renderAll(); });
  elements.nextMonth.addEventListener('click', () => { selectedMonth = shiftMonth(selectedMonth, 1); renderAll(); });
  elements.monthLabel.addEventListener('click', () => {
    if (typeof elements.monthPicker.showPicker === 'function') elements.monthPicker.showPicker();
    else elements.monthPicker.click();
  });
  elements.monthPicker.addEventListener('change', () => { if (elements.monthPicker.value) { selectedMonth = elements.monthPicker.value; renderAll(); } });
  elements.openAddTransaction.addEventListener('click', () => openTransactionDialog());
  elements.transactionForm.addEventListener('submit', saveTransaction);
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => elements.transactionDialog.close()));
  elements.transactionDialog.addEventListener('click', event => { if (event.target === elements.transactionDialog) elements.transactionDialog.close(); });
  elements.transactionSearch.addEventListener('input', renderTransactions);
  elements.transactionTypeFilter.addEventListener('change', renderTransactions);
  elements.transactionCategoryFilter.addEventListener('change', renderTransactions);
  elements.transactionType.addEventListener('change', () => {
    if (elements.transactionType.value === 'income') elements.transactionCategory.value = 'Other';
    if (elements.transactionType.value === 'transfer') elements.transactionCategory.value = 'Transfers';
    if (elements.transactionType.value === 'expense' && ['Other', 'Transfers'].includes(elements.transactionCategory.value)) {
      elements.transactionCategory.value = inferCategory(elements.transactionDescription.value);
    }
  });
  elements.transactionDescription.addEventListener('blur', () => {
    if (!elements.transactionId.value && elements.transactionType.value === 'expense') elements.transactionCategory.value = inferCategory(elements.transactionDescription.value);
  });
  elements.incomeTarget.addEventListener('change', () => {
    monthBudget().incomeTargetCents = Math.max(0, toCents(elements.incomeTarget.value) || 0);
    queueSave();
    renderAll();
  });
  elements.copyPreviousPlan.addEventListener('click', () => {
    const previous = state.budgets[shiftMonth(selectedMonth, -1)];
    if (!previous) { showToast('The previous month does not have a plan yet.'); return; }
    state.budgets[selectedMonth] = structuredClone(previous);
    queueSave();
    renderAll();
    showToast('Previous month’s plan copied.');
  });
  elements.exportBackup.addEventListener('click', exportBackup);
  elements.exportCSV.addEventListener('click', exportTransactionsCSV);
  elements.importFile.addEventListener('change', () => handleImportFile(elements.importFile.files[0]));
  ['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragging'); }));
  elements.dropZone.addEventListener('drop', event => handleImportFile(event.dataTransfer.files[0]));
  elements.cancelImport.addEventListener('click', () => { importCandidates = []; elements.importPreviewPanel.classList.add('hidden'); setImportStatus(''); });
  elements.confirmImport.addEventListener('click', confirmImport);
  window.addEventListener('hashchange', () => {
    const target = location.hash.slice(1);
    if (['overview', 'transactions', 'plan', 'import'].includes(target)) showView(target, false);
  });
}

function populateCategoryOptions() {
  [elements.transactionCategory, elements.transactionCategoryFilter].forEach(select => {
    CATEGORIES.forEach(category => {
      const option = document.createElement('option');
      option.value = category.name;
      option.textContent = category.name;
      select.appendChild(option);
    });
  });
}

async function initialize() {
  populateCategoryOptions();
  bindEvents();
  await loadState();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  renderAll();
  const target = location.hash.slice(1);
  showView(['overview', 'transactions', 'plan', 'import'].includes(target) ? target : 'overview', false);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('[PWA] Service worker unavailable', error)));
  }
}

initialize();
