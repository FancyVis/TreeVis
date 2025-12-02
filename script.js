// --- Global state ---
let pyodideReadyPromise = null;
let translations = {};
let currentLang = "en";
let currentCsvLoaded = false;
let currentChartDataUrl = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "Loading Python environment...";
  }

  pyodideReadyPromise = initPyodideAndPython();
  loadTranslations();

  // Attach listeners
  document
    .getElementById("file-input")
    .addEventListener("change", handleFileChange);

  document
    .getElementById("generate-chart")
    .addEventListener("click", handleGenerateChart);

  document
    .getElementById("download-chart")
    .addEventListener("click", handleDownloadChart);

  document
    .getElementById("lang-toggle")
    .addEventListener("click", toggleLanguage);
});

// --- Pyodide setup ---
async function initPyodideAndPython() {
  const pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });

  await pyodide.loadPackage(["micropip", "pandas", "matplotlib"]);

  await pyodide.runPythonAsync(`
import micropip
await micropip.install("squarify")
`);

  // --- NEW: load Chinese font into Pyodide FS ---
  try {
    const fontResp = await fetch("fonts/NotoSansSC-Regular.otf");
    const fontBuffer = await fontResp.arrayBuffer();
    const fontBytes = new Uint8Array(fontBuffer);
    // write into virtual filesystem
    pyodide.FS.writeFile("NotoSansSC-Regular.otf", fontBytes);
  } catch (e) {
    console.warn("Failed to load Chinese font:", e);
  }

  // Now load your Python code
  const resp = await fetch("python/main.py");
  const code = await resp.text();
  await pyodide.runPythonAsync(code);

  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "Python ready.";
  }

  return pyodide;
}


// --- File upload & preview ---
async function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = getI18n("status_loading_file", "Loading file...");
  }

  const text = await file.text();
  const pyodide = await pyodideReadyPromise;

  const loadCsvFunc = pyodide.globals.get("load_csv_from_text");

    try {
        const resultProxy = loadCsvFunc(text);
        const result = resultProxy.toJs({ create_proxies: false });
        resultProxy.destroy();

        const columns = result.columns || [];
        const previewRows = result.preview || [];
        const totalRows =
            typeof result.total_rows === "number"
            ? result.total_rows
            : previewRows.length;
        const previewIsFull = !!result.preview_is_full;

        populatePreviewTable(previewRows, previewIsFull, totalRows);
        populateColumnSelectors(columns);

        currentCsvLoaded = true;
        document.getElementById("generate-chart").disabled = false;

        if (statusEl) {
            statusEl.textContent = getI18n("status_ready", "Ready.");
        }
    } catch (err) {
        console.error(err);
        if (statusEl) {
        statusEl.textContent =
            getI18n("status_error", "Error") + ": " + (err.message || err);
        }
    }
}

function populatePreviewTable(rows, previewIsFull = false, totalRows = null) {
  const container = document.getElementById("preview");
  container.innerHTML = "";

  if (!rows || rows.length === 0) {
    container.textContent = getI18n("no_preview_data", "No data to preview.");
    return;
  }

  // Meta line: how many rows shown
  const meta = document.createElement("div");
  meta.className = "preview-meta";

  if (previewIsFull) {
    const n = rows.length;
    meta.textContent =
      n === 1
        ? getI18n("preview_meta_all_one", "Showing all 1 row")
        : getI18n("preview_meta_all", "Showing all {n} rows").replace("{n}", n);
  } else {
    const shown = rows.length;
    const total = totalRows ?? shown;
    meta.textContent = getI18n(
      "preview_meta_partial",
      "Showing first {shown} of {total} rows"
    )
      .replace("{shown}", shown)
      .replace("{total}", total);
  }

  container.appendChild(meta);

  // Build table
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const columns = Object.keys(rows[0]);

  const headerRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);

  // Add scroll hint only if horizontal scroll is actually needed
  // Use requestAnimationFrame to ensure layout is up to date
  requestAnimationFrame(() => {
    if (table.scrollWidth > container.clientWidth) {
      const hint = document.createElement("div");
      hint.className = "preview-hint";
      hint.textContent = getI18n(
        "scroll_hint",
        "Scroll to view all columns"
      );
      container.appendChild(hint);
    }
  });
}



function populateColumnSelectors(columns) {
  const labelSelect = document.getElementById("label-column");
  const valueSelect = document.getElementById("value-column");
  const colorSelect = document.getElementById("color-column");

  labelSelect.innerHTML = "";
  valueSelect.innerHTML = "";

  // Keep a default "none" option for color column
  const defaultColorOption = document.createElement("option");
  defaultColorOption.value = "";
  defaultColorOption.textContent = getI18n(
    "color_none_option",
    "Default colors"
  );
  colorSelect.innerHTML = "";
  colorSelect.appendChild(defaultColorOption);

  columns.forEach((col) => {
    const opt1 = document.createElement("option");
    opt1.value = col;
    opt1.textContent = col;
    labelSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = col;
    opt2.textContent = col;
    valueSelect.appendChild(opt2);

    const opt3 = document.createElement("option");
    opt3.value = col;
    opt3.textContent = col;
    colorSelect.appendChild(opt3);
  });

  if (columns.length > 0) {
    labelSelect.value = columns[0];
  }
  if (columns.length > 1) {
    valueSelect.value = columns[1];
  }
  // default: no color column (use default matplotlib colors)
  colorSelect.value = "";
}



// --- Chart generation ---
async function handleGenerateChart() {
  if (!currentCsvLoaded) return;

  const labelSel = document.getElementById("label-column");
  const valueSel = document.getElementById("value-column");
  const chartTypeSel = document.getElementById("chart-type");
  const colorSel = document.getElementById("color-column");

  if (!labelSel || !valueSel || !chartTypeSel) {
    console.error("Required selectors are missing from the page.");
    return;
  }

  const labelCol = labelSel.value;
  const valueCol = valueSel.value;
  const chartType = chartTypeSel.value;

  // color column is optional
  const colorCol = colorSel && colorSel.value ? colorSel.value : null;

  // NEW: make color-mode and base-color safe even if HTML is not updated
  const colorModeEl = document.getElementById("color-mode");
  const baseColorEl = document.getElementById("base-color");

  const colorMode = colorModeEl ? (colorModeEl.value || "direct") : "direct";
  const baseColor = baseColorEl ? (baseColorEl.value || "#ffd700") : "#ffd700";

  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = getI18n(
      "status_generating_chart",
      "Generating chart..."
    );
  }

  const pyodide = await pyodideReadyPromise;
  const generateChartFunc = pyodide.globals.get("generate_chart");

  try {
    // Python returns a plain string (base64)
    const base64Str = generateChartFunc(
      labelCol,
      valueCol,
      chartType,
      colorCol,
      colorMode,
      baseColor
    );

    const dataUrl = "data:image/png;base64," + base64Str;
    currentChartDataUrl = dataUrl;

    const img = document.getElementById("chart-image");
    img.src = dataUrl;

    const dlBtn = document.getElementById("download-chart");
    dlBtn.disabled = false;

    if (statusEl) {
      statusEl.textContent = getI18n("status_ready", "Ready.");
    }
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent =
        getI18n("status_error", "Error") + ": " + (err.message || err);
    }
  }
}


function handleDownloadChart() {
  if (!currentChartDataUrl) return;

  const link = document.createElement("a");
  link.href = currentChartDataUrl;
  link.download = "chart.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- i18n: load translations.csv and apply ---
async function loadTranslations() {
  try {
    const resp = await fetch("data/translations.csv");
    const text = await resp.text();
    translations = parseTranslationsCsv(text);
    applyTranslations();
  } catch (err) {
    console.warn("Could not load translations.csv:", err);
  }
}

function parseTranslationsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return {};

  const header = lines[0].split(",");
  const langCols = header.slice(1); // e.g., ["en", "zh"]

  const dict = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    const key = parts[0];
    dict[key] = {};
    langCols.forEach((lang, idx) => {
      dict[key][lang] = parts[idx + 1] || "";
    });
  }
  return dict;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.getAttribute("data-i18n-key");
    const text = getI18n(key, el.textContent);
    if (text != null) {
      el.textContent = text;
    }
  });

  // Update status, if we have translations
  const statusEl = document.getElementById("status");
  if (statusEl && !statusEl.textContent) {
    statusEl.textContent = getI18n("status_ready", "Ready.");
  }
}

function getI18n(key, fallback = "") {
  if (
    translations &&
    translations[key] &&
    translations[key][currentLang] &&
    translations[key][currentLang].length > 0
  ) {
    return translations[key][currentLang];
  }
  return fallback;
}

function toggleLanguage() {
  currentLang = currentLang === "en" ? "zh" : "en";
  applyTranslations();
}

// --- end of script.js ---
