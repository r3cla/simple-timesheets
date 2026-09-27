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

## Changing defaults

- GST rate: `GST_RATE` near the top of `app.js`
- Currency: the `Intl.NumberFormat` call near the top of `app.js` (currently NZD)
- PDF colours and layout: the `buildPdf` function in `app.js`
