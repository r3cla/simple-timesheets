# Timesheet Maker

A simple static web app for creating timesheets and downloading them as PDFs. It runs entirely in the browser, so no server or database is needed and it can be hosted free on GitHub Pages.

## Features

- Details: your name or business, client, period start and end, optional reference
- Entries: date, job title, task description, hours, rate type (hourly or half-hourly) and rate
- Live amount per entry plus total hours, subtotal and total
- Optional GST (15%)
- Optional notes
- A4 PDF download with a totals block, signature lines and page numbers
- Draft is saved automatically in the browser (localStorage)
- Works on mobile and supports dark mode

Half-hourly rates are charged per 30 minutes, so 1.5 hours at $35 per half hour is 3 × $35 = $105.

## Project structure

```
index.html      Page markup
styles.css      Styles
app.js          App logic and PDF generation
lib/            jsPDF 4.2.1 and jsPDF-AutoTable 5.0.8 (MIT licensed, bundled so no CDN is needed)
.nojekyll       Tells GitHub Pages to serve files as they are
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then go to http://localhost:8000.

## Deploy to GitHub Pages

This repo is [github.com/r3cla/simple-timesheets](https://github.com/r3cla/simple-timesheets).

1. Push the `main` branch (already set up as the `origin` remote):

   ```bash
   git push -u origin main
   ```

2. In the repository go to **Settings > Pages**.
3. Under **Build and deployment** set **Source** to **Deploy from a branch**, then choose `main` and `/ (root)` and select **Save**.
4. After a minute or so the site will be live at `https://r3cla.github.io/simple-timesheets/`.

## Changing defaults

- GST rate: `GST_RATE` near the top of `app.js`
- Currency: the `Intl.NumberFormat` call near the top of `app.js` (currently NZD)
- PDF colours and layout: the `buildPdf` function in `app.js`
