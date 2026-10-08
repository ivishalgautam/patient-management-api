# Practice features: accounts, chairs, patient messages, inventory, lab

Five practice-management modules, modelled on the feature list at
dentee.com. All of them are scoped by practice, and every route is listed in
`tenant-map.js` and `permission-map.js`. In the dashboard they follow the
clinic picked in the header.

## Accounts & cash — `/v1/accounts`

- **Expenses.** Categories come with defaults (Dental materials, Lab charges,
  Salaries, Rent…). A category in use is archived, never deleted. Expenses are
  recorded per clinic with date, payment method, vendor and bill number.
- **Cash book.** One per clinic: opening balance, cash in, cash out and bank
  deposits.
  - Cash paid by patients and expenses paid in cash appear automatically.
  - The book starts at the clinic's **latest opening balance**. Older
    movements (cash banked long ago) don't count.
- **Invoices.**
  - Numbered per practice (`INV-YYYY-0001`), with line items, discount and GST.
  - Linking a treatment fills the line from its plan cost. "Paid" is then
    taken from that treatment's payments (cash plus advance used).
  - A treatment can have only one issued invoice; cancel it (with a reason)
    to issue another.
  - Printing outputs only the invoice sheet, on A4.
- **Income & expenditure.**
  - Income is the money received on treatment payments (`amount_paid`).
  - The report breaks income down by payment method and by service, and
    expenses by category, month by month.
- **Permissions.** `accounts.view` / `accounts.manage` (doctor by default).
  Invoices use `billing.*`; the summary uses `reports.view`.

## Chair board — `/v1/schedule`

- **Chairs.** Defined per clinic. Archived chairs keep their history.
- **Day board.** The day's appointments, each with its stage: booked, waiting,
  in chair, done or cancelled.
  - Check-in is allowed only on the appointment's day.
  - A chair holds one patient at a time. A walk-in seated directly counts as
    checked in at that moment.
  - "Undo" reverts the last step.
  - Completing the appointment (which opens a treatment) is still the existing
    `PUT /bookings/status/:id`. The board's "Start treatment" button calls it.
- **Waiting report.** Wait time runs from check-in to being seated; chair time
  from seated to finished. The report covers no-shows and breaks waits down by
  day, doctor and arrival hour.
- **Permissions.** `appointments.*` for the board, `clinics.manage` for chairs
  and `reports.view` for the report.

## Patient messages — `/v1/patient-messages`

Messages go by WhatsApp and email. There is no SMS yet.

- **WhatsApp** uses the practice's Cloud API number and an **approved
  template** (see `docs/whatsapp-cloud.md`). Template variables are filled with
  the patient's first name or fixed text. Sent messages show in the WhatsApp
  inbox.
- **Email** is sent over SMTP: set `SMTP_SERVER`, `SMTP_PORT`, `SMTP_EMAIL`
  and `SMTP_PASSWORD`. These fill-ins are available: `{{first_name}}`,
  `{{name}}`, `{{clinic}}`, and `{{months}}` (recall only).
- **Recall.** Goes to patients whose last visit (a completed appointment or a
  treatment) was N months ago and who have nothing booked. A window of 7 days
  catches up after a missed run.
- **Birthday.** Goes to patients whose date of birth is today; a 29 Feb
  birthday is sent on 28 Feb in other years. Dates of birth less than a year
  ago are ignored (registration dates typed as DOB).
- **Bulk messages.** The audience is the patients of a clinic (registered,
  booked or treated there) and/or those whose last visit falls in a date
  window. Each is saved as a draft, then sent.
- **Delivery.** `patient_messages` is both the queue and the log. A dedupe key
  means nobody gets the same automatic message twice.
  - Delivery runs on `patient-messages.deliver`, paced by
    `PATIENT_MESSAGE_SEND_INTERVAL_MS`, and resumes after a restart.
  - The daily run is `PATIENT_MESSAGES_CRON` (default 10:00, clinic time zone).
  - "Send today's now" triggers the same run by hand.
- **Permission.** `patient_messages.manage` (doctor).

## Inventory — `/v1/inventory`

- **Items.** Stock items per clinic: category, unit, SKU, reorder level, unit
  cost and supplier.
- **Movements.** `purchase` (with expiry and supplier), `used`, `wasted`, and
  `adjustment` (a reason is required).
  - `current_stock` always equals the sum of the item's movements.
  - Stock can't go below zero; this is re-checked under a row lock.
- **Purchases as expenses.** A purchase can be added to expenses (Dental
  materials) by anyone with `accounts.manage`. The expense is removed if the
  stock update fails.
- **Report.** Stock value, low stock, items expiring within 60 days, and usage,
  wastage and purchases per item for a period.
- **Permissions.** `inventory.view` / `inventory.manage` (doctor and staff).

## Lab work — `/v1/lab`

- **Orders.** Labs and lab orders, numbered `LAB-0001`. Each order records the
  work type, teeth, shade, material, instructions, due date and lab charge.
- **Status flow.** draft → sent → received → fitted, plus *remake* (a reason
  is required; sent again with a new due date) and cancel. The relevant date
  is stamped at each step, and every change goes into the order's history.
- **Counts.** Open, overdue, due today, ready to fit, and unpaid lab bills.
- **Lab bills.** Paying the bill can record a "Lab charges" expense.
- **Permissions.** `lab.view` / `lab.manage` (doctor and staff).

## Migrations

| Migration | Adds |
| --- | --- |
| `20261011000100-accounts.js` | Expense categories, expenses, cash entries, invoices and the invoice counter |
| `20261012000100-chairs.js` | Chairs; `bookings` gains `chair_id`, `checked_in_at`, `seated_at`, `finished_at` |
| `20261013000100-patient-messages.js` | Rules, broadcasts, and messages (the queue and the log) |
| `20261014000100-inventory-lab.js` | Suppliers, items, stock movements, labs, lab orders and their events |

Each migration seeds the new permissions into the system roles.
