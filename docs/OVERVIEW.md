# GAS Hôpitaux — Overview Guide

*A plain-language companion to the technical documentation, for readers who don't need the code-level details: program managers, hospital pharmacy staff, trainers, and anyone evaluating or supporting the application.*

---

## 1. What is GAS Hôpitaux?

**GAS Hôpitaux** is a computer program installed directly on a computer at a hospital pharmacy. Each month, the pharmacy staff use it to record how much of each medical product they had, received, gave out, lost, and have left — and the program automatically works out whether stock is running low, is normal, or is overstocked, for every product they manage.

It was built jointly by Madagascar's **Ministère de la Santé Publique** (through the **Direction de la Pharmacie, des Laboratoires et de la Médecine Traditionnelle**, DPLMT) and the U.S. Government's **Data.Fi** project.

**The most important thing to know about it: it works completely offline.** The computer it's installed on does not need an internet connection to be used, day to day. All the data typed in stays on that computer. Only when a monthly report is finished does someone need to get a file out of the computer (onto a USB key or over whatever network is available, at their convenience) and hand it over to be brought into the central system used at the national or regional level.

---

## 2. Who uses it, and for what

The intended user is hospital pharmacy staff responsible for the monthly stock report. The one-time setup (done once per computer, when the app is first installed) also touches whoever manages that hospital's configuration — which region and district it belongs to, and which health programmes/products it needs to track.

---

## 3. Getting started — the one-time setup

The first time the app is opened on a computer, it walks through five short steps before it lets anyone create a report:

1. **User profile** — name, function/role, and phone number of the person using this computer.
2. **Configuration** — importing a file (`utgl_config.json`) that the central level provides, which tells the app which health programmes and products exist and how they're organized.
3. **Organisation unit** — picking, from drop-down lists, the region (DRSP), then the district (SDSP), then the specific hospital this installation is for.
4. **Products** — a read-only summary confirming which products, grouped by programme, this hospital is now set up to report on (this appears automatically once steps 2 and 3 are done).
5. **Backup** — where to make and restore full backups of the app's data (see §7).

Once all of this is done, the app remembers it — nobody needs to repeat this setup unless the computer's data is wiped or restored from a backup.

---

## 4. The monthly report, step by step

### 4.1 Starting a new report

From the **Rapports** (Reports) screen, clicking **"+ Nouveau rapport"** opens a small form: pick the month, and the app fills in the hospital automatically (it already knows which hospital this computer belongs to, from setup). A month that already has a report can't be picked again, and future months are blocked too.

### 4.2 Filling it in

The report is organized as one tab per health programme. Each tab lists every product the hospital is expected to report on that month. Clicking a product opens an entry form with a small number of fields to actually fill in:

- Quantity available at the start of the month
- Quantity received during the month
- Quantity given to patients
- Quantity expired or damaged
- Quantity redeployed (sent elsewhere)
- Number of days the product was out of stock
- The month's average monthly consumption (CMM) — the app fills this in by itself once there are four months of history for that product, but it can also be entered by hand
- **Détails SDU** — the actual physical count of stock still on hand at the end of the month, entered as one or more batches (quantity + expiry month), the same way a pharmacist counts stock on the shelf by expiry batch
- A free-text observation, if needed

Everything else — theoretical stock, the gap ("écart") between the theoretical and the counted stock, the closing usable stock (SDU), the adjusted average consumption (CMMA), and the number of months of stock on hand (MSD) — is **calculated automatically** by the app the moment the numbers above are entered. Nothing needs to be computed by hand or on a calculator, and the figures update live as the form is filled in.

**A helpful shortcut:** the opening stock for a new month is pre-filled from last month's closing count, so staff don't have to look it up and retype it. And if a closing count entered for an earlier month is later corrected, the app automatically carries that correction forward into every later month that already used the old figure.

### 4.3 Understanding the stock status colors

Every product line shows a colored status label, worked out automatically from the "months of stock on hand" (MSD) figure:

| Status | Meaning | When it shows |
|---|---|---|
| 🔴 **RUPTURE** | Stock-out | No usable stock left |
| 🟡 **SOUS STOCK** | Low stock | Less than 2 months of stock left |
| 🟢 **NORMAL** | Normal | Between 2 and 4 months of stock |
| 🔵 **SURSTOCK** | Overstock | More than 4 months of stock |

A separate "Complet / Incomplet" badge shows whether all the required fields for a product have been filled in yet — a report only counts as finished once every product it should cover is "Complet".

### 4.4 A product that's no longer tracked

If the central level withdraws a product from the list a hospital reports on, the app doesn't erase anything already recorded for it in past reports — it keeps showing exactly what was entered, with a small **"Retiré"** (withdrawn) tag, so old reports still read correctly. It simply stops offering that product for new entries going forward.

---

## 5. Stock alerts

The **Alertes** screen is a quick, read-only summary — no data entry here — built automatically from the hospital's *most recently entered* report. It's organized the same way as the report itself (one tab per programme), showing at a glance which products are currently in stock-out (RUPTURE) or running low (SOUS STOCK), and how many products that is out of the total tracked for that programme. It's meant as the first thing to check: "what needs attention right now?"

---

## 6. Sending a report onward

Once a report shows **"Complet"** on the Rapports list, the **"Exporter"** button becomes available (it stays disabled until then). Exporting:

1. Opens a save dialog so the user picks where to save the file (a suggested name is proposed automatically: "Rapport - month-year - district - hospital").
2. Produces a single file, with the extension **`.utglhp`**, that contains everything about that report.
3. Records the date it was exported, visible afterward in the reports list.

That file is then transferred — by USB key, shared folder, or whatever means is convenient and available — to wherever it needs to reach the central UTGL platform for import. GAS Hôpitaux itself never needs a network connection to produce this file.

---

## 7. Protecting the data: backup and restore

Because everything lives on one computer, the **Paramètres → Sauvegarde** screen provides a safety net:

- **Sauvegarder** (Backup) saves the entire contents of the app — every report, the configuration, the hospital's setup — into a single `.rfsbak` file, which can be copied somewhere safe (another drive, a USB key).
- **Restaurer** (Restore) does the reverse: it replaces everything currently in the app with the contents of a chosen `.rfsbak` file. This is a strong action — it wipes out whatever was there before — so the app asks for confirmation, warns that it cannot be undone, and asks for the app to be restarted afterward to make sure the restored data is loaded cleanly.

It is worth making a backup regularly, and always right before doing anything risky (like restoring an older backup, or handing the computer over for maintenance).

---

## 8. Other things worth knowing

- **Works entirely in French.** All screens, labels, and messages are in French, matching how the paper/central reporting process already works.
- **Appearance can be tweaked.** A small palette icon lets a user change the app's accent colors for the current session — this is a display preference only, not saved data, and resets the next time the app is opened.
- **The "À propos" page** (accessible from the top menu) shows what the application does, who built it, and which exact version is installed — useful when reporting an issue or confirming everyone's running the same version.
- **Nothing here requires the internet**, except the one-off, occasional act of receiving a new configuration file from the central level, or handing an export file onward. Day-to-day data entry, calculation, and review all happen locally on the computer.

---

## 9. Where to go for more detail

This guide intentionally leaves out how the software is built. For architecture, database structure, the exact calculation formulas, and instructions for building an installable release, see [`TECHNICAL_DOCUMENTATION.md`](./TECHNICAL_DOCUMENTATION.md) in this same folder.
