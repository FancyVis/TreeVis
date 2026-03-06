const dom = {};
const state = { pyodidePromise: null, lastPngUrl: null, lastSvgUrl: null };

function $(id){ return document.getElementById(id); }

function cacheDom(){
  dom.fileInput = $("file-input");
  dom.status = $("status");
  dom.preview = $("preview");

  dom.idCol = $("id-col");
  dom.pidCol = $("pid-col");
  dom.depthCol = $("depth-col");
  dom.labelCol = $("label-col");

  dom.edgeRoute = $("edge-route");
  dom.orthMode = $("orth-mode");
  dom.arcRadMode = $("arc-rad-mode");
  dom.arcRad = $("arc-rad");
  dom.orthRow = $("orth-row");
  dom.arcRow = $("arc-row");

  dom.edgeColor = $("edge-color");
  dom.edgeLS = $("edge-linestyle");
  dom.edgeLW = $("edge-linewidth");
  dom.edgeAlpha = $("edge-alpha");

  dom.nodeSize = $("node-size");
  dom.nodeMarker = $("node-marker");
  dom.nodeFace = $("node-facecolor");
  dom.nodeEdge = $("node-edgecolor");
  dom.nodeLW = $("node-linewidth");
  dom.nodeAlpha = $("node-alpha");

  dom.nodeColorCol = $("node-color-col");
  dom.nodeMarkerCol = $("node-marker-col");
  dom.cmap = $("cmap");
  dom.showLegend = $("show-legend");
  dom.colorMapJson = $("color-map-json");
  dom.markerMapJson = $("marker-map-json");

  dom.title = $("title");
  dom.figW = $("fig-w");
  dom.figH = $("fig-h");
  dom.figDpi = $("fig-dpi");
  dom.invertY = $("invert-y");
  dom.annotate = $("annotate");
  dom.annotSize = $("annot-size");
  dom.outFormat = $("out-format");

  dom.generate = $("generate");
  dom.download = $("download");
  dom.downloadSvg = $("download-svg");
  dom.chart = $("chart");
}

function setStatus(msg){ dom.status.textContent = msg; }

function fillSelect(sel, cols, includeNone=false){
  sel.innerHTML = "";
  if(includeNone){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(none)";
    sel.appendChild(o);
  }
  cols.forEach(c => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });
}

function renderPreview(rows){
  dom.preview.innerHTML = "";
  if(!rows || rows.length === 0) return;

  const cols = Object.keys(rows[0]);
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  cols.forEach(c => { const th=document.createElement("th"); th.textContent=c; trh.appendChild(th); });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    cols.forEach(c => { const td=document.createElement("td"); 
      const v = (r && typeof r.get === "function") ? r.get(c) : r[c]; 
      td.textContent = (v === undefined || v === null) ? "" : String(v); 
      tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  dom.preview.appendChild(table);
}

function syncRouteUI(){
  const route = dom.edgeRoute.value;
  dom.orthRow.style.display = (route === "orthogonal") ? "" : "none";
  dom.arcRow.style.display = (route === "arc") ? "" : "none";
  dom.arcRad.style.display = (route === "arc" && dom.arcRadMode.value === "manual") ? "" : "none";
}

async function initPyodide(){
  setStatus("Loading Python runtime...");
  const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
  await pyodide.loadPackage(["pandas", "matplotlib"]);
  const code = await (await fetch(`python/main.py?v=${Date.now()}`)).text();
  await pyodide.runPythonAsync(code);
  setStatus("Python ready.");
  return pyodide;
}

async function onFileChange(e){
  const file = e.target.files[0];
  if(!file) return;

  try{
    setStatus("Reading CSV...");
    const text = await file.text();

    const pyodide = await state.pyodidePromise;
    const loadFn = pyodide.globals.get("load_csv_from_text");

    const proxy = loadFn(text);
    const result = proxy.toJs({ create_proxies: false });
    proxy.destroy();

    const cols = result.columns || [];
    renderPreview(result.preview || []);


    // helper: choose a default column by common names
    function pickCol(cols, candidates){
      const lower = cols.map(c => String(c).toLowerCase());
      for (const cand of candidates){
        const i = lower.indexOf(cand);
        if (i >= 0) return cols[i];
      }
      return "";
    }

    fillSelect(dom.idCol, cols);
    fillSelect(dom.pidCol, cols);
    fillSelect(dom.depthCol, cols, true);
    fillSelect(dom.labelCol, cols, true);

    // defaults
    dom.idCol.value = pickCol(cols, ["id","node_id","nid"]);
    dom.pidCol.value = pickCol(cols, ["pid","parent","parent_id","parentid"]);
    dom.depthCol.value = pickCol(cols, ["depth","level","y"]) || "";   // optional
    dom.labelCol.value = pickCol(cols, ["label","name","title"]) || ""; // optional

    fillSelect(dom.nodeColorCol, cols, true);
    fillSelect(dom.nodeMarkerCol, cols, true);

    dom.generate.disabled = false;
    dom.download.disabled = true;
    dom.downloadSvg.disabled = true;
    dom.chart.removeAttribute("src");
    state.last = null;

    setStatus(`Loaded ${result.total_rows} rows.`);

    state.lastPng = null;
    state.lastSvg = null;
    dom.download.disabled = true;
    dom.downloadSvg.disabled = true;
  } catch(err){
    console.error(err);
    setStatus("ERROR loading CSV: " + (err?.message || err));
  }
}

async function onGenerate(){
  try{
    const pyodide = await state.pyodidePromise;
    const renderFn = pyodide.globals.get("render_tree_plot");

    const route = dom.edgeRoute.value;
    const arcRad = (route === "arc" && dom.arcRadMode.value === "auto")
      ? "auto"
      : parseFloat(dom.arcRad.value);

    const params = {
      id_col: dom.idCol.value,
      parent_col: dom.pidCol.value,
      depth_col: dom.depthCol.value,
      label_col: dom.labelCol.value,

      edge_route: route,
      orth_mode: dom.orthMode.value,
      arc_rad: arcRad,

      edge_color: dom.edgeColor.value,
      edge_linestyle: dom.edgeLS.value,
      edge_linewidth: parseFloat(dom.edgeLW.value),
      edge_alpha: parseFloat(dom.edgeAlpha.value),

      node_size: parseFloat(dom.nodeSize.value),
      node_marker: dom.nodeMarker.value,
      node_facecolor: dom.nodeFace.value,
      node_edgecolor: dom.nodeEdge.value,
      node_linewidth: parseFloat(dom.nodeLW.value),
      node_alpha: parseFloat(dom.nodeAlpha.value),

      node_color_col: dom.nodeColorCol.value,
      node_marker_col: dom.nodeMarkerCol.value,
      cmap: dom.cmap.value,
      show_legend: dom.showLegend.checked,
      color_map_json: dom.colorMapJson.value,
      marker_map_json: dom.markerMapJson.value,

      title: dom.title.value,
      fig_w: parseFloat(dom.figW.value),
      fig_h: parseFloat(dom.figH.value),
      fig_dpi: parseInt(dom.figDpi.value),
      invert_y: dom.invertY.checked,
      annotate: dom.annotate.checked,
      annot_size: parseFloat(dom.annotSize.value),

      out_format: dom.outFormat.value
    };

    setStatus("Rendering...");
    const outProxy = renderFn(JSON.stringify(params));
    const out = outProxy.toJs({ create_proxies: false });
    outProxy.destroy();

    const dataUrl = `data:${out.mime};base64,${out.base64}`;
    state.lastPngUrl = dataUrl;          // because onGenerate uses out_format png
    dom.chart.src = dataUrl;

    // dom.download.disabled = false;
    // $("download-svg").disabled = false;

    // SVG can't go into <img> reliably via data URL in all browsers; PNG is safe.
    // We'll still allow SVG download; preview will be blank for SVG on some browsers.
    // dom.chart.src = dataUrl;

    // dom.download.disabled = false;
    state.lastPng = out;
    dom.chart.src = `data:${out.mime};base64,${out.base64}`;

    dom.download.disabled = false;
    dom.downloadSvg.disabled = false;
    setStatus("Done.");

  } catch(err){
    console.error(err);
    setStatus("ERROR rendering: " + (err?.message || err));
  }
}

// function onDownload(){
//   if(!state.last) return;
//   const a = document.createElement("a");
//   a.href = state.last.dataUrl;
//   a.download = `treevis.${state.last.ext}`;
//   document.body.appendChild(a);
//   a.click();
//   a.remove();
// }
function onDownload(){
  if(!state.lastPng) return;
  downloadOut(state.lastPng, "treevis.png");
}

async function onDownloadSvg(){
  try{
    const pyodide = await state.pyodidePromise;
    const renderFn = pyodide.globals.get("render_tree_plot");

    // build the SAME params as onGenerate, but out_format="svg"
    const route = dom.edgeRoute.value;
    const arcRad = (route === "arc" && dom.arcRadMode.value === "auto")
      ? "auto"
      : parseFloat(dom.arcRad.value);

    const params = {
      id_col: dom.idCol.value,
      parent_col: dom.pidCol.value,
      depth_col: dom.depthCol.value,
      label_col: dom.labelCol.value,

      edge_route: route,
      orth_mode: dom.orthMode.value,
      arc_rad: arcRad,

      edge_color: dom.edgeColor.value,
      edge_linestyle: dom.edgeLS.value,
      edge_linewidth: parseFloat(dom.edgeLW.value),
      edge_alpha: parseFloat(dom.edgeAlpha.value),

      node_size: parseFloat(dom.nodeSize.value),
      node_marker: dom.nodeMarker.value,
      node_facecolor: dom.nodeFace.value,
      node_edgecolor: dom.nodeEdge.value,
      node_linewidth: parseFloat(dom.nodeLW.value),
      node_alpha: parseFloat(dom.nodeAlpha.value),

      node_color_col: dom.nodeColorCol.value,
      node_marker_col: dom.nodeMarkerCol.value,
      cmap: dom.cmap.value,
      show_legend: dom.showLegend.checked,
      color_map_json: dom.colorMapJson.value,
      marker_map_json: dom.markerMapJson.value,

      title: dom.title.value,
      fig_w: parseFloat(dom.figW.value),
      fig_h: parseFloat(dom.figH.value),
      fig_dpi: parseInt(dom.figDpi.value),
      invert_y: dom.invertY.checked,
      annotate: dom.annotate.checked,
      annot_size: parseFloat(dom.annotSize.value),

      out_format: "svg"
    };

    setStatus("Rendering SVG...");
    const outProxy = renderFn(JSON.stringify(params));
    const out = outProxy.toJs({ create_proxies: false });
    outProxy.destroy();

    state.lastSvg = out;
    downloadOut(out, "treevis.svg");
    setStatus("SVG downloaded.");
  } catch(err){
    console.error(err);
    setStatus("ERROR SVG: " + (err?.message || err));
  }
}

function downloadOut(out, filename){
  if(!out) return;

  const bytes = atob(out.base64);
  const arr = new Uint8Array(bytes.length);
  for(let i=0; i<bytes.length; i++) arr[i] = bytes.charCodeAt(i);

  const blob = new Blob([arr], { type: out.mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  dom.generate.disabled = true;
  syncRouteUI();

  state.pyodidePromise = initPyodide();

  dom.fileInput.addEventListener("change", onFileChange);
  dom.generate.addEventListener("click", onGenerate);
  dom.download.addEventListener("click", onDownload);
  dom.downloadSvg.addEventListener("click", onDownloadSvg);

  dom.edgeRoute.addEventListener("change", syncRouteUI);
  dom.arcRadMode.addEventListener("change", syncRouteUI);
});