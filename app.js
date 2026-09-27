/* Timesheet Maker
 * Builds simple timesheets in the browser and exports them to PDF with jsPDF + AutoTable.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "timesheet-maker:draft:v1";
  const GST_RATE = 0.15;
  const RATE_TYPES = {
    hourly: { label: "Hourly", unitsPerHour: 1, unitLabel: "per hour" },
    "half-hourly": { label: "Half-hourly", unitsPerHour: 2, unitLabel: "per half hour" }
  };

  const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
  const hoursFmt = new Intl.NumberFormat("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Element references ----------
  const $ = (id) => document.getElementById(id);
  const form = $("timesheet-form");
  const entriesEl = $("entries");
  const template = $("entry-template");
  const messageEl = $("message");

  const detailFields = {
    worker: $("worker"),
    client: $("client"),
    periodStart: $("period-start"),
    periodEnd: $("period-end"),
    reference: $("reference"),
    defaultRateType: $("default-rate-type"),
    notes: $("notes")
  };
  const includeGst = $("include-gst");

  // ---------- Helpers ----------
  function toNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /** Amount in cents, to avoid floating point drift when summing. */
  function amountCents(entry) {
    const type = RATE_TYPES[entry.rateType] || RATE_TYPES.hourly;
    const units = toNumber(entry.hours) * type.unitsPerHour;
    return Math.round(units * toNumber(entry.rate) * 100);
  }

  function formatCents(cents) {
    return money.format(cents / 100);
  }

  /** yyyy-mm-dd -> dd/mm/yyyy (NZ format). */
  function formatDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return y && m && d ? `${d}/${m}/${y}` : iso;
  }

  function todayIso() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now - offset).toISOString().slice(0, 10);
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = "message" + (type ? " " + type : "");
  }

  // ---------- Entries ----------
  function readEntry(row) {
    const get = (name) => row.querySelector(`[data-field="${name}"]`);
    return {
      date: get("date").value,
      jobTitle: get("jobTitle").value.trim(),
      task: get("task").value.trim(),
      hours: get("hours").value,
      rateType: get("rateType").value,
      rate: get("rate").value
    };
  }

  function getEntries() {
    return Array.from(entriesEl.querySelectorAll(".entry")).map(readEntry);
  }

  function isBlank(entry) {
    return !entry.jobTitle && !entry.task && !toNumber(entry.hours) && !toNumber(entry.rate);
  }

  function addEntry(data, focus) {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".entry");
    const set = (name, value) => {
      if (value !== undefined && value !== null) row.querySelector(`[data-field="${name}"]`).value = value;
    };

    // New rows inherit the previous row's job title, rate type and rate to save typing.
    const previous = entriesEl.querySelector(".entry:last-of-type");
    const prevData = previous ? readEntry(previous) : null;

    const entry = Object.assign(
      {
        date: todayIso(),
        jobTitle: prevData ? prevData.jobTitle : "",
        task: "",
        hours: "",
        rateType: prevData ? prevData.rateType : detailFields.defaultRateType.value,
        rate: prevData ? prevData.rate : ""
      },
      data || {}
    );

    set("date", entry.date);
    set("jobTitle", entry.jobTitle);
    set("task", entry.task);
    set("hours", entry.hours);
    set("rateType", RATE_TYPES[entry.rateType] ? entry.rateType : "hourly");
    set("rate", entry.rate);

    entriesEl.appendChild(row);
    updateEmptyState();
    recalculate();

    if (focus) {
      const target = row.querySelector(entry.jobTitle ? '[data-field="task"]' : '[data-field="jobTitle"]');
      target.focus();
    }
  }

  function updateEmptyState() {
    const hasRows = entriesEl.querySelector(".entry");
    let empty = entriesEl.querySelector(".empty");
    if (!hasRows && !empty) {
      empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No entries yet. Select “Add entry” to get started.";
      entriesEl.appendChild(empty);
    } else if (hasRows && empty) {
      empty.remove();
    }
  }

  // ---------- Totals ----------
  function calculateTotals(entries) {
    let hours = 0;
    let subtotal = 0;
    entries.forEach((e) => {
      hours += toNumber(e.hours);
      subtotal += amountCents(e);
    });
    const gst = includeGst.checked ? Math.round(subtotal * GST_RATE) : 0;
    return { hours, subtotal, gst, total: subtotal + gst };
  }

  function recalculate() {
    const rows = entriesEl.querySelectorAll(".entry");
    rows.forEach((row) => {
      row.querySelector('[data-field="amount"]').textContent = formatCents(amountCents(readEntry(row)));
    });

    const totals = calculateTotals(getEntries());
    $("total-hours").textContent = hoursFmt.format(totals.hours);
    $("subtotal").textContent = formatCents(totals.subtotal);
    $("gst").textContent = formatCents(totals.gst);
    $("total").textContent = formatCents(totals.total);
    $("gst-row").hidden = !includeGst.checked;
  }

  // ---------- Saving and loading ----------
  function collectState() {
    const details = {};
    Object.keys(detailFields).forEach((key) => {
      details[key] = detailFields[key].value;
    });
    return { details, includeGst: includeGst.checked, entries: getEntries() };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
    } catch (err) {
      // Storage may be unavailable (private mode, blocked). The app still works without it.
    }
  }

  function load() {
    let state = null;
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (err) {
      state = null;
    }

    if (state && state.details) {
      Object.keys(detailFields).forEach((key) => {
        if (typeof state.details[key] === "string") detailFields[key].value = state.details[key];
      });
      includeGst.checked = Boolean(state.includeGst);
    }

    if (state && Array.isArray(state.entries) && state.entries.length) {
      state.entries.forEach((entry) => addEntry(entry, false));
    } else {
      addEntry(null, false);
    }
    recalculate();
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  // ---------- Validation ----------
  function clearInvalid() {
    form.querySelectorAll(".invalid").forEach((el) => {
      el.classList.remove("invalid");
      el.removeAttribute("aria-invalid");
    });
  }

  function validate() {
    clearInvalid();
    const problems = [];
    const rows = Array.from(entriesEl.querySelectorAll(".entry"));
    const filled = rows.filter((row) => !isBlank(readEntry(row)));

    if (!filled.length) {
      problems.push("Add at least one entry with hours and a rate.");
    }

    filled.forEach((row) => {
      const e = readEntry(row);
      const mark = (name) => {
        const field = row.querySelector(`[data-field="${name}"]`);
        field.classList.add("invalid");
        field.setAttribute("aria-invalid", "true");
      };
      if (!e.jobTitle && !e.task) {
        mark("jobTitle");
        mark("task");
      }
      if (!(toNumber(e.hours) > 0)) mark("hours");
      if (e.rate === "" || toNumber(e.rate) < 0 || !Number.isFinite(parseFloat(e.rate))) mark("rate");
    });

    if (entriesEl.querySelector(".invalid")) {
      problems.push("Check the highlighted fields. Each entry needs a job title or task, hours above zero and a rate.");
    }

    const start = detailFields.periodStart.value;
    const end = detailFields.periodEnd.value;
    if (start && end && start > end) {
      detailFields.periodStart.classList.add("invalid");
      detailFields.periodStart.setAttribute("aria-invalid", "true");
      detailFields.periodEnd.classList.add("invalid");
      detailFields.periodEnd.setAttribute("aria-invalid", "true");
      problems.push("The period start date is after the end date.");
    }

    return { ok: problems.length === 0, problems, rows: filled };
  }

  // ---------- PDF ----------
  function buildPdf(entries) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const accent = [37, 99, 235];
    const muted = [91, 100, 117];
    const d = detailFields;

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(26, 34, 51);
    doc.text("Timesheet", margin, 22);

    if (d.reference.value.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...muted);
      doc.text(d.reference.value.trim(), pageWidth - margin, 22, { align: "right" });
    }

    doc.setDrawColor(...accent);
    doc.setLineWidth(0.8);
    doc.line(margin, 26, pageWidth - margin, 26);

    // Details block (two columns)
    let period = "";
    if (d.periodStart.value && d.periodEnd.value) {
      period = `${formatDate(d.periodStart.value)} to ${formatDate(d.periodEnd.value)}`;
    } else if (d.periodStart.value || d.periodEnd.value) {
      period = formatDate(d.periodStart.value || d.periodEnd.value);
    }

    const leftDetails = [
      ["Name", d.worker.value.trim()],
      ["Client", d.client.value.trim()]
    ].filter((pair) => pair[1]);
    const rightDetails = [
      ["Period", period],
      ["Date issued", formatDate(todayIso())]
    ].filter((pair) => pair[1]);

    let y = 35;
    const drawDetails = (pairs, x, maxWidth) => {
      let rowY = y;
      pairs.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(label.toUpperCase(), x, rowY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(26, 34, 51);
        const lines = doc.splitTextToSize(value, maxWidth);
        doc.text(lines, x, rowY + 5);
        rowY += 5 + lines.length * 5 + 3;
      });
      return rowY;
    };
    const colWidth = (pageWidth - margin * 2) / 2 - 5;
    const leftEnd = drawDetails(leftDetails, margin, colWidth);
    const rightEnd = drawDetails(rightDetails, pageWidth / 2 + 5, colWidth);
    y = Math.max(leftEnd, rightEnd) + 2;

    // Entries table
    const body = entries.map((e) => {
      const type = RATE_TYPES[e.rateType] || RATE_TYPES.hourly;
      return [
        formatDate(e.date),
        e.jobTitle,
        e.task,
        hoursFmt.format(toNumber(e.hours)),
        `${money.format(toNumber(e.rate))}\n${type.unitLabel}`,
        formatCents(amountCents(e))
      ];
    });

    window.autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 20 },
      head: [["Date", "Job title", "Task description", "Hours", "Rate", "Amount"]],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        cellPadding: 2.5,
        textColor: [26, 34, 51],
        lineColor: [217, 222, 231],
        lineWidth: 0.2,
        valign: "top",
        overflow: "linebreak"
      },
      headStyles: { fillColor: accent, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 34 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 16, halign: "right" },
        4: { cellWidth: 27, halign: "right" },
        5: { cellWidth: 25, halign: "right" }
      },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index >= 3) data.cell.styles.halign = "right";
      }
    });

    // Totals
    const totals = calculateTotals(entries);
    const totalRows = [
      ["Total hours", hoursFmt.format(totals.hours)],
      ["Subtotal", formatCents(totals.subtotal)]
    ];
    if (includeGst.checked) totalRows.push(["GST (15%)", formatCents(totals.gst)]);
    totalRows.push([includeGst.checked ? "Total (incl. GST)" : "Total", formatCents(totals.total)]);

    window.autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      margin: { left: pageWidth - margin - 80, right: margin, bottom: 20 },
      tableWidth: 80,
      body: totalRows,
      theme: "plain",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 2, textColor: [26, 34, 51] },
      columnStyles: { 0: { textColor: muted }, 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (data.row.index === totalRows.length - 1) {
          data.cell.styles.fillColor = [232, 239, 255];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 11;
          data.cell.styles.textColor = [26, 34, 51];
        }
      }
    });

    y = doc.lastAutoTable.finalY + 10;
    const pageHeight = doc.internal.pageSize.getHeight();

    // Notes
    const notes = d.notes.value.trim();
    if (notes) {
      const lines = doc.splitTextToSize(notes, pageWidth - margin * 2);
      if (y + 8 + lines.length * 5 > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.text("NOTES", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(26, 34, 51);
      doc.text(lines, margin, y + 5);
      y += 5 + lines.length * 5 + 6;
    }

    // Signature lines
    if (y + 22 > pageHeight - 20) {
      doc.addPage();
      y = 25;
    }
    y += 12;
    doc.setDrawColor(...muted);
    doc.setLineWidth(0.3);
    const sigWidth = (pageWidth - margin * 2) / 2 - 10;
    doc.line(margin, y, margin + sigWidth, y);
    doc.line(pageWidth / 2 + 10, y, pageWidth / 2 + 10 + sigWidth, y);
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("Signed", margin, y + 5);
    doc.text("Approved by", pageWidth / 2 + 10, y + 5);

    // Page numbers
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    }

    return doc;
  }

  function fileName() {
    const parts = ["timesheet"];
    const client = slugify(detailFields.client.value);
    if (client) parts.push(client);
    parts.push(detailFields.periodEnd.value || detailFields.periodStart.value || todayIso());
    return parts.join("-") + ".pdf";
  }

  // ---------- Events ----------
  $("add-entry").addEventListener("click", () => {
    addEntry(null, true);
    scheduleSave();
  });

  entriesEl.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;
    button.closest(".entry").remove();
    updateEmptyState();
    recalculate();
    scheduleSave();
  });

  form.addEventListener("input", (event) => {
    if (event.target.classList.contains("invalid")) {
      event.target.classList.remove("invalid");
      event.target.removeAttribute("aria-invalid");
    }
    if (messageEl.classList.contains("success") || !form.querySelector(".invalid")) showMessage("");
    recalculate();
    scheduleSave();
  });

  form.addEventListener("change", () => {
    recalculate();
    scheduleSave();
  });

  $("clear-all").addEventListener("click", () => {
    if (!window.confirm("Clear all details and entries? This can't be undone.")) return;
    form.reset();
    entriesEl.innerHTML = "";
    clearInvalid();
    showMessage("");
    addEntry(null, false);
    recalculate();
    save();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(saveTimer);
    save();

    if (!window.jspdf || !window.autoTable) {
      showMessage("The PDF library didn't load. Check the lib folder is uploaded and refresh the page.", "error");
      return;
    }

    const result = validate();
    if (!result.ok) {
      showMessage(result.problems.join(" "), "error");
      const firstInvalid = form.querySelector(".invalid");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    try {
      const entries = result.rows.map(readEntry);
      const doc = buildPdf(entries);
      doc.save(fileName());
      showMessage("PDF downloaded.", "success");
    } catch (err) {
      console.error(err);
      showMessage("Something went wrong creating the PDF. Please try again.", "error");
    }
  });

  // Flush any pending save when the page is hidden or closed.
  window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    save();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(saveTimer);
      save();
    }
  });

  // ---------- Start ----------
  load();
})();
