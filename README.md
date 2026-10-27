# Supelike Shop Manager v2

Android-ready shop management app based on the supplied screenshots.

## New in this version
- Sales overview with today's totals and profit
- Monthly overview with sales, net profit after expenses, average per active day, transaction count and stock totals
- Best-selling product ranked by revenue, including units sold and estimated profit
- Transaction history with Today / 7 days / This month / All time filters
- Search sales by product, customer or payment method
- Expense history
- Export sales history to CSV and all local data to JSON
- Add, edit and delete products, product images, low-stock levels, sizes and tax percentage
- Sales record customer, payment method, date and cost-at-sale snapshot; stock deducts automatically
- Low-stock and out-of-stock filters

## Build APK without Android Studio
1. Download and extract this ZIP.
2. Upload the extracted files and folders to a GitHub repository (including `.github/workflows/build-apk.yml`).
3. In the repository, open Actions and enable workflows if prompted.
4. Select **Build Android APK** and click **Run workflow**, or push to `main`.
5. When successful, open the workflow run, download the `Supelike-Shop-Manager-APK` artifact, extract it, then install `app-debug.apk`.

## Important
- This is an Android-ready web app project; the APK is not precompiled in this ZIP.
- Data is saved locally on the device/browser. Export backups regularly; uninstalling or clearing app data can remove records.
- No cloud synchronization or login is included.
- Tax percentage is stored but tax is not automatically calculated or added to totals.
- Profit estimates use cost captured when the sale is recorded, less recorded expenses in the report. Verify all accounting/GST figures.
