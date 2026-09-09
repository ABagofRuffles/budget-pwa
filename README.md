# QuickBudget

QuickBudget is a private, offline-capable monthly budgeting PWA. It connects a monthly spending plan to actual transactions so the overview can show what was planned, what was spent, and what remains.

## Highlights

- Monthly overview with income, spending, net position, and remaining budget
- Planned-versus-actual category tracking
- Month-over-month and recent seven-day spending signals
- Transaction add, edit, delete, undo, search, and filtering
- Transfer handling that avoids counting moved money as spending
- CSV, QFX/OFX, and PDF statement import with review and duplicate detection
- Complete JSON backup and restore, including every monthly plan
- IndexedDB storage with a localStorage fallback and legacy-data migration
- Responsive installed-app experience with maskable icons and offline app shell

Financial data stays in the browser. There is no account, server, analytics, or cloud sync.

## Run locally

Serve the repository over HTTP because service workers and JavaScript modules do not run correctly from a `file://` URL.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Data and migration

The current schema is stored in IndexedDB under the `quickbudget` database. If IndexedDB is unavailable, the app falls back to the `qb_state_v2` localStorage key.

On first launch, the app safely reads the earlier `qb_txns_v1` and `qb_ws_v1` keys. Existing transactions are converted to integer cents. The old worksheet is retained in complete backups and its section totals become the initial plan for the current month.

Use **Import & backup → Download complete backup** before clearing browser data or moving to another device.

## Import guidance

CSV and QFX/OFX files are the most reliable import formats. PDF parsing is heuristic because statement layouts differ by bank. PDF import requires the PDF.js CDN, verifies the worker against its pinned SHA-512 hash before execution, and skips rows whose year cannot be derived safely from the statement period. Every supported transaction import is reviewed before saving and exact duplicates are skipped.

## Development

The app uses browser-native HTML, CSS, JavaScript modules, IndexedDB, and service workers. There is no build step.

```bash
npm test
npm run check
```

The Node test suite covers money precision, local dates, monthly calculations, week/month comparisons, and CSV/QFX parsing.

## Files

- `index.html`: semantic application shell
- `styles.css`: responsive ledger-inspired visual system
- `core.js`: pure calculations, validation, and import parsers
- `script.js`: storage and interface behavior
- `service-worker.js`: offline app shell and cache refresh
- `manifest.json`: install metadata and icons
- `test/core.test.js`: core behavior tests
