import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMonths, compareRecentWeeks, localISODate, normalizeImportedDate, normalizeTransaction, parseCSV, parseOFX, resolveStatementDate, selectNewestState, summarizeMonth, toCents } from '../core.js';

test('money is stored in integer cents', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
});

test('localISODate uses local calendar components', () => {
  assert.equal(localISODate(new Date(2026, 8, 9, 23, 30)), '2026-09-09');
});

test('monthly summary excludes transfers from income and spending', () => {
  const transactions = [
    normalizeTransaction({ id: '1', description: 'Paycheck', amount: 5000, type: 'income', date: '2026-09-01' }),
    normalizeTransaction({ id: '2', description: 'Rent', amount: 2000, type: 'expense', category: 'Housing', date: '2026-09-02' }),
    normalizeTransaction({ id: '3', description: 'Move money', amount: 500, type: 'transfer', date: '2026-09-03' })
  ];
  const result = summarizeMonth(transactions, { '2026-09': { categories: { Housing: 210000 } } }, '2026-09');
  assert.equal(result.incomeCents, 500000);
  assert.equal(result.spentCents, 200000);
  assert.equal(result.categorySpending.Housing, 200000);
});

test('CSV import supports quoted commas', () => {
  const result = parseCSV('Date,Type,Description,Category,Amount\n2026-09-01,expense,"Market, Inc",Groceries,42.15');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Market, Inc');
  assert.equal(result[0].amountCents, 4215);
});

test('CSV import rejects impossible and missing dates', () => {
  const result = parseCSV('Date,Type,Description,Category,Amount\n02/30/2026,expense,Impossible,Other,42.15\n,expense,Missing,Other,10.00');
  assert.equal(result.length, 0);
  assert.equal(normalizeImportedDate('02/30/2026'), null);
});

test('OFX import reads posted transactions', () => {
  const result = parseOFX('<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000<TRNAMT>-19.95<FITID>abc<NAME>CAFE</STMTTRN>');
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-09-05');
  assert.equal(result[0].amountCents, 1995);
});

test('OFX import classifies XFER records as transfers', () => {
  const result = parseOFX('<STMTTRN><TRNTYPE>XFER<DTPOSTED>20260905120000<TRNAMT>-500.00<FITID>xfer-1<NAME>MOVE TO SAVINGS</STMTTRN>');
  assert.equal(result[0].type, 'transfer');
});

test('statement dates use the statement period, including across New Year', () => {
  const period = 'Statement period: December 15, 2025 through January 14, 2026';
  assert.equal(resolveStatementDate('12/20', period), '2025-12-20');
  assert.equal(resolveStatementDate('01/04', period), '2026-01-04');
  assert.equal(resolveStatementDate('02/01', period), null);
  assert.equal(resolveStatementDate('12/20', 'No dated period'), null);
});

test('fallback state is recovered when IndexedDB is empty or older', () => {
  const fallback = { updatedAt: '2026-09-09T01:00:00Z', transactions: [{ id: 'fallback' }] };
  const staleIndexed = { updatedAt: '2026-09-08T01:00:00Z', transactions: [{ id: 'indexed' }] };
  assert.equal(selectNewestState(null, fallback), fallback);
  assert.equal(selectNewestState(staleIndexed, fallback), fallback);
  assert.equal(selectNewestState({ ...staleIndexed, updatedAt: '2026-09-10T01:00:00Z' }, fallback).transactions[0].id, 'indexed');
});

test('month comparisons use only the selected and preceding month', () => {
  const transactions = [
    normalizeTransaction({ id: '1', description: 'August', amount: 100, type: 'expense', date: '2026-08-02' }),
    normalizeTransaction({ id: '2', description: 'September', amount: 125, type: 'expense', date: '2026-09-02' })
  ];
  assert.deepEqual(compareMonths(transactions, '2026-09'), { current: 12500, previous: 10000, difference: 2500, percent: 25 });
});

test('week comparison measures the latest seven days against the seven before them', () => {
  const transactions = [
    normalizeTransaction({ id: '1', description: 'Earlier week', amount: 100, type: 'expense', date: '2026-09-01' }),
    normalizeTransaction({ id: '2', description: 'Latest week', amount: 150, type: 'expense', date: '2026-09-09' })
  ];
  assert.deepEqual(compareRecentWeeks(transactions, '2026-09', '2026-09-09'), { current: 15000, previous: 10000, difference: 5000, percent: 50 });
});
