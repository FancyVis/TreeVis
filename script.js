// --- Global state ---
const state = {
  pyodideReadyPromise: null,
  translations: {},
  currentLang: "en",
  currentCsvLoaded: false,
  currentChartDataUrl: null,
};

const dom = {};

function cacheDom() {
  dom.status = document.getElementById("status");
  dom.fileInput = document.getElementById("file-input");
  dom.generateChart = document.getElementById("generate-chart");
  dom.downloadChart = document.getElementById("download-chart");
  dom.langToggle = document.getElementById("lang-toggle");
  dom.labelColumn = document.getElementById("label-column");
  dom.valueColumn = document.getElementById("value-column");
  dom.colorColumn = document.getElementById("color-column");
  dom.chartType = document.getElementById("chart-type");
  dom.colorMode = document.getElementById("color-mode");
  dom.baseColor = document.getElementById("base-color");
  dom.chartImage = document.getElementById("chart-image");
  dom.preview = document.getElementById("preview");
}

function setStatus(messageKey, fallback) {
  if (dom.status) {
    dom.status.textContent = getI18n(messageKey, fallback);
  }
}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  if (dom.status) {
    dom.status.textContent = "Loading Python environment...";
  }

  state.pyodideReadyPromise = initPyodideAndPython();
  loadTranslations();

  // Attach listeners
  if (dom.fileInput) {
    dom.fileInput.addEventListener("change", handleFileChange);
  }
  if (dom.generateChart) {
    dom.generateChart.addEventListener("click", handleGenerateChart);
  }
  if (dom.downloadChart) {
    dom.downloadChart.addEventListener("click", handleDownloadChart);
  }
  if (dom.langToggle) {
    dom.langToggle.addEventListener("click", toggleLanguage);
  }
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

// NEW: load Chinese font into Pyodide FS with logging
  try {
    const fontResp = await fetch("fonts/NotoSansSC-Regular.otf");
    if (!fontResp.ok) {
      console.warn("Font fetch failed with status", fontResp.status);
    } else {
      const fontBuffer = await fontResp.arrayBuffer();
      const fontBytes = new Uint8Array(fontBuffer);
      pyodide.FS.writeFile("NotoSansSC-Regular.otf", fontBytes);
      console.log(
        "Chinese font written into Pyodide FS, bytes:",
        fontBytes.length
      );
    }
  } catch (e) {
    console.warn("Failed to load Chinese font:", e);
  }

  // Now load your Python code
  const resp = await fetch("python/main.py");
  const code = await resp.text();
  await pyodide.runPythonAsync(code);

  if (dom.status) {
    dom.status.textContent = "Python ready.";
  }

  return pyodide;
}


// --- File upload & preview ---
async function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  setStatus("status_loading_file", "Loading file...");

  const text = await file.text();
  const pyodide = await state.pyodideReadyPromise;

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

    state.currentCsvLoaded = true;
    if (dom.generateChart) {
      dom.generateChart.disabled = false;
    }

    setStatus("status_ready", "Ready.");
  } catch (err) {
    console.error(err);
    if (dom.status) {
      dom.status.textContent =
        getI18n("status_error", "Error") + ": " + (err.message || err);
    }
  }
}

function populatePreviewTable(rows, previewIsFull = false, totalRows = null) {
  const container = dom.preview;
  if (!container) return;
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
  const labelSelect = dom.labelColumn;
  const valueSelect = dom.valueColumn;
  const colorSelect = dom.colorColumn;
  if (!labelSelect || !valueSelect || !colorSelect) return;

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
  if (!state.currentCsvLoaded) return;

  const labelSel = dom.labelColumn;
  const valueSel = dom.valueColumn;
  const chartTypeSel = dom.chartType;
  const colorSel = dom.colorColumn;

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
  const colorModeEl = dom.colorMode;
  const baseColorEl = dom.baseColor;

  const colorMode = colorModeEl ? colorModeEl.value || "direct" : "direct";
  const baseColor = baseColorEl ? baseColorEl.value || "#ffd700" : "#ffd700";

  setStatus("status_generating_chart", "Generating chart...");

  const pyodide = await state.pyodideReadyPromise;
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
    state.currentChartDataUrl = dataUrl;

    if (dom.chartImage) {
      dom.chartImage.src = dataUrl;
    }

    if (dom.downloadChart) {
      dom.downloadChart.disabled = false;
    }

    setStatus("status_ready", "Ready.");
  } catch (err) {
    console.error(err);
    if (dom.status) {
      dom.status.textContent =
        getI18n("status_error", "Error") + ": " + (err.message || err);
    }
  }
}


function handleDownloadChart() {
  if (!state.currentChartDataUrl) return;

  const link = document.createElement("a");
  link.href = state.currentChartDataUrl;
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
    state.translations = parseTranslationsCsv(text);
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
  if (dom.status && !dom.status.textContent) {
    dom.status.textContent = getI18n("status_ready", "Ready.");
  }
}

function getI18n(key, fallback = "") {
  if (
    state.translations &&
    state.translations[key] &&
    state.translations[key][state.currentLang] &&
    state.translations[key][state.currentLang].length > 0
  ) {
    return state.translations[key][state.currentLang];
  }
  return fallback;
}

function toggleLanguage() {
  state.currentLang = state.currentLang === "en" ? "zh" : "en";
  applyTranslations();
}

// --- end of script.js ---
