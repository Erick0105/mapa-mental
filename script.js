"use strict";
const SVGNS = "http://www.w3.org/2000/svg";
const stage = document.getElementById("stage");
const wrap = document.getElementById("wrap");
const marqueeEl = document.getElementById("marquee");

/* ---------------- categories: icon is decided by category ---------------- */
const CATS = {
  cluster: {
    label: "Cluster",
    desc: "Agrupador do tema",
    stroke: "#64748b",
    fill: "#f1f5f9",
    cssVar: "cluster",
  },
  money: {
    label: "Money Page",
    desc: "Página de conversão",
    stroke: "#b45309",
    fill: "#fff7ea",
    cssVar: "money",
  },
  pilar: {
    label: "Página Pilar",
    desc: "Conteúdo principal",
    stroke: "#2447d6",
    fill: "#edf0ff",
    cssVar: "pilar",
  },
  categoria: {
    label: "Página Categoria",
    desc: "Agrupa subtemas",
    stroke: "#0d9488",
    fill: "#effcfa",
    cssVar: "cat",
  },
  satelite: {
    label: "Página Satélite",
    desc: "Apoio / long-tail",
    stroke: "#7c3aed",
    fill: "#f6f2ff",
    cssVar: "sat",
  },
};

/* draw the shape for a category, centered on (0,0); returns array of SVG els.
   By default uses the theme-aware CSS variables (good contrast in dark mode);
   pass opts.resolved=true to bake in the fixed light-mode hex colors instead
   (used for PNG/PDF export, which always renders on a white background and is
   detached from the page's stylesheet, so var() wouldn't resolve there). */
function buildGlyph(cat, opts = {}) {
  const c = CATS[cat];
  const sw = opts.sw || 2.4;
  const fill = opts.resolved ? c.fill : `var(--c-${c.cssVar}-f)`;
  const stroke = opts.resolved ? c.stroke : `var(--c-${c.cssVar}-s)`;
  const els = [];
  const set = (el) => {
    el.setAttribute("fill", fill);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", sw);
    el.setAttribute("stroke-linejoin", "round");
    return el;
  };
  if (cat === "cluster") {
    els.push(set(mk("ellipse", { cx: 0, cy: 0, rx: 42, ry: 27 })));
  } else if (cat === "money") {
    els.push(
      set(mk("rect", { x: -44, y: -26, width: 88, height: 52, rx: 12 })),
    );
  } else if (cat === "pilar") {
    els.push(set(mk("path", { d: "M0,-34 L40,0 L0,34 L-40,0 Z" })));
  } else if (cat === "categoria") {
    // database cylinder
    const w = 68,
      h = 54,
      rx = 34,
      ry = 11;
    els.push(
      set(
        mk("path", {
          d: `M${-rx},${-h / 2 + ry} V${h / 2 - ry} a${rx},${ry} 0 0 0 ${2 * rx},0 V${-h / 2 + ry}`,
        }),
      ),
    );
    els.push(
      set(mk("ellipse", { cx: 0, cy: -h / 2 + ry, rx: rx, ry: ry })),
    );
  } else if (cat === "satelite") {
    // rounded-top tag with a notch (matches the legend's satellite glyph)
    els.push(
      set(
        mk("path", {
          d: "M-34,-30 a10,10 0 0 1 10,-10 H24 a10,10 0 0 1 10,10 V32 L0,16 L-34,32 Z",
        }),
      ),
    );
  }
  return els;
}
function mk(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* ---------------- state ---------------- */
const DEFAULT_DESC = {};
for (const k in CATS) DEFAULT_DESC[k] = CATS[k].desc;
DEFAULT_DESC.nucleo = "Núcleo temático (categoria + satélites)";
const NUC_COLORS = [
  "#4f46e5",
  "#0d9488",
  "#e11d48",
  "#b45309",
  "#7c3aed",
  "#0369a1",
  "#15803d",
];
let state = {
  nodes: [],
  edges: [],
  frames: [],
  catDesc: { ...DEFAULT_DESC },
  legendPos: { show: true, x: null, y: null },
};
/* aceita o formato antigo (string: "below"/"above"/"right"/"left"/"none")
   e o novo (objeto {show,x,y}, com x/y = null para posição automática) */
function normalizeLegendPos(v) {
  if (v && typeof v === "object")
    return {
      show: v.show !== false,
      x: typeof v.x === "number" ? v.x : null,
      y: typeof v.y === "number" ? v.y : null,
    };
  return { show: v !== "none", x: null, y: null };
}
const MAX_HISTORY = 50;
let history = [],
  historyIdx = -1,
  clipboard = null;
const getDesc = (k) =>
  state.catDesc && state.catDesc[k] != null
    ? state.catDesc[k]
    : DEFAULT_DESC[k];
let view = { x: 0, y: 0, k: 1 };
let sel = { type: null, id: null };
let multiSel = new Set();
let highlightCat = null;
let searchQuery = "";
let uid = 1;
const newId = () => "n" + uid++;
const byFrame = (id) => state.frames.find((f) => f.id === id);
function nodesInFrame(f) {
  return state.nodes.filter(
    (n) =>
      n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h,
  );
}
function framesInFrame(f) {
  return state.frames.filter(
    (inner) =>
      inner.id !== f.id &&
      inner.x >= f.x &&
      inner.x + inner.w <= f.x + f.w &&
      inner.y >= f.y &&
      inner.y + inner.h <= f.y + f.h,
  );
}

/* viewport group + defs */
const defs = mk("defs", {});
stage.appendChild(defs);
function arrowMarker(id) {
  const m = mk("marker", {
    id: id,
    viewBox: "0 0 10 10",
    refX: 8.5,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: "auto-start-reverse",
  });
  m.appendChild(mk("path", { d: "M0,0 L10,5 L0,10 Z", fill: "var(--muted)" }));
  defs.appendChild(m);
}
arrowMarker("arrow");
const vp = mk("g", { id: "vp" });
stage.appendChild(vp);
const frameLayer = mk("g", {});
const edgeLayer = mk("g", {});
const nodeLayer = mk("g", {});
const cursorLayer = mk("g", { id: "cursors" });
vp.appendChild(frameLayer);
vp.appendChild(edgeLayer);
vp.appendChild(nodeLayer);
vp.appendChild(cursorLayer);

/* ---------------- text wrapping (canvas measured) ---------------- */
const mctx = document.createElement("canvas").getContext("2d");
function wrapLabel(text, maxW, font) {
  mctx.font = font;
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (mctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}
const LBL_FONT =
  '600 12.5px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const LBL_MAXW = 158,
  LINE_H = 15.5;

/* node footprint helper used for layout + bounds */
function nodeBox(n) {
  const lines = wrapLabel(n.name, LBL_MAXW, LBL_FONT);
  let lw = 0;
  mctx.font = LBL_FONT;
  for (const l of lines) lw = Math.max(lw, mctx.measureText(l).width);
  const halfW = Math.max(48, lw / 2 + 6);
  const top = -40; // top of glyph
  const labelTop = 44; // first baseline
  const bottom = labelTop + lines.length * LINE_H - 2;
  return { lines, halfW, top, bottom, labelTop };
}

/* ---------------- rendering ---------------- */
const FRAME_FONT =
  '700 13px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
function renderFrames() {
  frameLayer.textContent = "";
  for (const f of state.frames) {
    const sel_ = sel.type === "frame" && sel.id === f.id;
    const g = mk("g", { class: "frame-grp" });
    g.dataset.frame = f.id;
    // body
    const body = mk("rect", {
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      rx: 18,
      fill: f.color,
      "fill-opacity": "0.05",
      stroke: f.color,
      "stroke-opacity": sel_ ? "1" : "0.55",
      "stroke-width": sel_ ? 2.6 : 2,
      "stroke-dasharray": "7 6",
    });
    body.style.pointerEvents = "none";
    g.appendChild(body);
    // title tab
    mctx.font = FRAME_FONT;
    const tw = mctx.measureText(f.name).width;
    const tabW = Math.min(f.w - 16, tw + 28),
      tabH = 27;
    const tab = mk("rect", {
      x: f.x + 12,
      y: f.y - tabH / 2,
      width: tabW,
      height: tabH,
      rx: 9,
      fill: f.color,
    });
    tab.dataset.ftitle = f.id;
    tab.style.cursor = "move";
    g.appendChild(tab);
    const tt = mk("text", {
      x: f.x + 12 + 14,
      y: f.y + 5,
      "font-family":
        'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      "font-size": "13",
      "font-weight": "700",
      fill: "#ffffff",
    });
    tt.textContent = f.name;
    tt.dataset.ftitle = f.id;
    tt.style.cursor = "move";
    tt.style.userSelect = "none";
    g.appendChild(tt);
    if (f.note) {
      const noteDot = mk("circle", {
        cx: f.x + 12 + tabW - 10,
        cy: f.y,
        r: 4,
        fill: "#ffffff",
        "fill-opacity": "0.9",
      });
      noteDot.style.pointerEvents = "none";
      const noteTitle = document.createElementNS(SVGNS, "title");
      noteTitle.textContent = f.note;
      noteDot.appendChild(noteTitle);
      g.appendChild(noteDot);
    }
    // resize handles — 8 directions when selected, corner indicator otherwise
    if (sel_) {
      [
        { dir: "nw", cx: f.x, cy: f.y, cur: "nwse-resize" },
        { dir: "n", cx: f.x + f.w / 2, cy: f.y, cur: "ns-resize" },
        { dir: "ne", cx: f.x + f.w, cy: f.y, cur: "nesw-resize" },
        { dir: "e", cx: f.x + f.w, cy: f.y + f.h / 2, cur: "ew-resize" },
        { dir: "se", cx: f.x + f.w, cy: f.y + f.h, cur: "nwse-resize" },
        { dir: "s", cx: f.x + f.w / 2, cy: f.y + f.h, cur: "ns-resize" },
        { dir: "sw", cx: f.x, cy: f.y + f.h, cur: "nesw-resize" },
        { dir: "w", cx: f.x, cy: f.y + f.h / 2, cur: "ew-resize" },
      ].forEach((h) => {
        const hEl = mk("rect", {
          x: h.cx - 5,
          y: h.cy - 5,
          width: 10,
          height: 10,
          rx: 2,
          fill: "#fff",
          stroke: f.color,
          "stroke-width": 1.8,
        });
        hEl.dataset.fhandle = f.id + ":" + h.dir;
        hEl.style.cursor = h.cur;
        g.appendChild(hEl);
      });
    } else {
      const hs = mk("path", {
        d: `M${f.x + f.w - 4},${f.y + f.h - 18} L${f.x + f.w - 4},${f.y + f.h - 4} L${f.x + f.w - 18},${f.y + f.h - 4}`,
        fill: "none",
        stroke: f.color,
        "stroke-opacity": "0.8",
        "stroke-width": 3,
        "stroke-linecap": "round",
      });
      const hHit = mk("rect", {
        x: f.x + f.w - 22,
        y: f.y + f.h - 22,
        width: 24,
        height: 24,
        fill: "transparent",
      });
      hHit.dataset.fhandle = f.id + ":se";
      hHit.style.cursor = "nwse-resize";
      g.appendChild(hs);
      g.appendChild(hHit);
    }
    // connect handle — link this núcleo to another node or núcleo
    const conn = mk("circle", {
      class: "handle",
      cx: f.x + f.w + 4,
      cy: f.y - 4,
      r: 6,
    });
    conn.dataset.fconnect = f.id;
    g.appendChild(conn);
    frameLayer.appendChild(g);
  }
}
function render() {
  vp.setAttribute(
    "transform",
    `translate(${view.x} ${view.y}) scale(${view.k})`,
  );
  renderFrames();
  // edges
  edgeLayer.textContent = "";
  for (const e of state.edges) {
    const ep = edgeEndpoints(e);
    if (!ep) continue;
    const { a, b } = ep;
    const line = mk("line", {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      stroke: "var(--muted)",
      "stroke-width": 1.8,
    });
    line.setAttribute("marker-end", "url(#arrow)");
    if (e.both) line.setAttribute("marker-start", "url(#arrow)");
    edgeLayer.appendChild(line);
    const hit = mk("path", {
      class: "edge-hit",
      d: `M${a.x},${a.y} L${b.x},${b.y}`,
    });
    hit.dataset.edge = e.id;
    edgeLayer.appendChild(hit);
    if (sel.type === "edge" && sel.id === e.id) {
      line.setAttribute("stroke", "var(--accent)");
      line.setAttribute("stroke-width", "2.6");
    }
  }
  // nodes
  nodeLayer.textContent = "";
  for (const n of state.nodes) {
    const box = nodeBox(n);
    const matchesSearch =
      !searchQuery || n.name.toLowerCase().includes(searchQuery);
    let scale = 1;
    if (n.category === highlightCat) scale = Math.max(scale, 1.18);
    if (searchQuery && matchesSearch) scale = Math.max(scale, 1.12);
    const g = mk("g", {
      class: "node-grp",
      transform: `translate(${n.x} ${n.y})`,
      opacity: searchQuery && !matchesSearch ? "0.25" : "1",
    });
    g.dataset.node = n.id;
    g.dataset.cat = n.category;
    const inner = mk("g", {
      class: "node-scale",
      transform: `scale(${scale})`,
    });
    g.appendChild(inner);
    if ((sel.type === "node" && sel.id === n.id) || multiSel.has(n.id)) {
      inner.appendChild(
        mk("rect", {
          class: "sel-ring",
          x: -box.halfW - 8,
          y: box.top - 8,
          width: (box.halfW + 8) * 2,
          height: box.bottom - box.top + 16,
          rx: 14,
        }),
      );
    }
    buildGlyph(n.category).forEach((el) => inner.appendChild(el));
    box.lines.forEach((ln, i) => {
      const t = mk("text", {
        class: "nlabel",
        x: 0,
        y: box.labelTop + i * LINE_H,
        "text-anchor": "middle",
        "font-family":
          'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
        "font-size": "12.5",
        "font-weight": "600",
        fill: "var(--ink)",
      });
      t.textContent = ln;
      inner.appendChild(t);
    });
    if (n.status) {
      const sd = STATUS_DEFS.find((s) => s.key === n.status);
      if (sd) {
        const statusDot = mk("circle", {
          cx: -box.halfW + 3,
          cy: box.top + 3,
          r: 5,
          fill: sd.color,
          stroke: "var(--panel)",
          "stroke-width": 1.5,
        });
        const statusTitle = document.createElementNS(SVGNS, "title");
        statusTitle.textContent = sd.label;
        statusDot.appendChild(statusTitle);
        inner.appendChild(statusDot);
      }
    }
    if (n.note) {
      const noteDot = mk("circle", {
        cx: box.halfW - 3,
        cy: box.top + 3,
        r: 5,
        fill: "var(--accent)",
        stroke: "var(--panel)",
        "stroke-width": 1.5,
      });
      const noteTitle = document.createElementNS(SVGNS, "title");
      noteTitle.textContent = n.note;
      noteDot.appendChild(noteTitle);
      inner.appendChild(noteDot);
    }
    // transparent hit area
    inner.appendChild(
      mk("rect", {
        class: "node-hit",
        x: -box.halfW - 6,
        y: box.top - 6,
        width: (box.halfW + 6) * 2,
        height: box.bottom - box.top + 12,
        rx: 12,
        fill: "transparent",
      }),
    );
    // connect handle
    inner.appendChild(
      mk("circle", { class: "handle", cx: 0, cy: box.top - 6, r: 6 }),
    );
    nodeLayer.appendChild(g);
  }
  renderMinimap();
}
const byId = (id) => state.nodes.find((n) => n.id === id);
function endpointPos(id) {
  const n = byId(id);
  if (n) return { x: n.x, y: n.y };
  const f = byFrame(id);
  if (f) return { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  return null;
}
/* point where the segment from a frame's center toward (tx,ty) crosses its border */
function frameBorderPoint(f, tx, ty) {
  const cx = f.x + f.w / 2,
    cy = f.y + f.h / 2,
    dx = tx - cx,
    dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = f.w / 2,
    hh = f.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
/* resolves both ends of an edge, clipping frame endpoints to their border */
function edgeEndpoints(e) {
  const a0 = endpointPos(e.from),
    b0 = endpointPos(e.to);
  if (!a0 || !b0) return null;
  const af = byFrame(e.from),
    bf = byFrame(e.to);
  return {
    a: af ? frameBorderPoint(af, b0.x, b0.y) : a0,
    b: bf ? frameBorderPoint(bf, a0.x, a0.y) : b0,
  };
}

/* ---------------- coordinate transforms ---------------- */
function toWorld(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return {
    x: (clientX - r.left - view.x) / view.k,
    y: (clientY - r.top - view.y) / view.k,
  };
}

/* ---------------- pointer interaction ---------------- */
let drag = null; // {mode,...}
let tempLine = null;
let lastTap = { key: null, t: 0 }; // manual double-click (DOM is rebuilt each render)
const DBL = 380;

stage.addEventListener("contextmenu", (ev) => ev.preventDefault());
stage.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2 || ev.button === 1) {
    // botão direito ou clique do scroll sempre move o quadro, não importa o que está sob o cursor
    lastTap = { key: null, t: 0 };
    drag = {
      mode: "pan",
      sx: ev.clientX,
      sy: ev.clientY,
      vx: view.x,
      vy: view.y,
    };
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (ev.button !== 0) return;
  const handle = ev.target.closest(".handle");
  const nodeEl = ev.target.closest("[data-node]");
  const edgeEl = ev.target.closest(".edge-hit");
  const fHandle = ev.target.closest("[data-fhandle]");
  const fConnect = ev.target.closest("[data-fconnect]");
  const fTitle = ev.target.closest("[data-ftitle]");
  const fBorder = ev.target.closest("[data-fborder]");

  if (fConnect) {
    // start linking from a núcleo
    const from = fConnect.dataset.fconnect;
    const p = endpointPos(from);
    drag = { mode: "link", from };
    tempLine = mk("line", {
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      stroke: "var(--accent)",
      "stroke-width": 2,
      "stroke-dasharray": "5 4",
    });
    edgeLayer.appendChild(tempLine);
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (fHandle) {
    // resize frame
    const [fid, dir] = fHandle.dataset.fhandle.split(":");
    const f = byFrame(fid);
    multiSel.clear();
    select("frame", f.id);
    const w = toWorld(ev.clientX, ev.clientY);
    drag = {
      mode: "fresize",
      id: f.id,
      dir: dir || "se",
      sx: w.x,
      sy: w.y,
      x0: f.x,
      y0: f.y,
      w0: f.w,
      h0: f.h,
    };
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (fTitle) {
    // move frame (or rename on double-tap)
    const id = fTitle.dataset.ftitle;
    const f = byFrame(id);
    const now = Date.now();
    if (lastTap.key === "frame:" + id && now - lastTap.t < DBL) {
      lastTap = { key: null, t: 0 };
      select("frame", id);
      ev.preventDefault();
      openRename("frame", id);
      return;
    }
    lastTap = { key: "frame:" + id, t: now };
    multiSel.clear();
    select("frame", id);
    const w = toWorld(ev.clientX, ev.clientY);
    const members = nodesInFrame(f).map((n) => ({ n, ox: n.x, oy: n.y }));
    const innerFrames = framesInFrame(f).map((fr) => ({
      fr,
      ox: fr.x,
      oy: fr.y,
    }));
    drag = {
      mode: "fmove",
      id,
      sx: w.x,
      sy: w.y,
      fx0: f.x,
      fy0: f.y,
      members,
      innerFrames,
    };
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }

  if (handle && nodeEl) {
    // start linking
    multiSel.clear();
    const from = nodeEl.dataset.node;
    const n = byId(from);
    drag = { mode: "link", from };
    tempLine = mk("line", {
      x1: n.x,
      y1: n.y,
      x2: n.x,
      y2: n.y,
      stroke: "var(--accent)",
      "stroke-width": 2,
      "stroke-dasharray": "5 4",
    });
    edgeLayer.appendChild(tempLine);
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (nodeEl) {
    const id = nodeEl.dataset.node;
    const n = byId(id);
    if (ev.ctrlKey || ev.metaKey) {
      // toggle multi-selection membership
      lastTap = { key: null, t: 0 };
      if (multiSel.has(id)) multiSel.delete(id);
      else multiSel.add(id);
      select(null);
      ev.preventDefault();
      return;
    }
    // move node (or rename on double-tap)
    const now = Date.now();
    if (lastTap.key === "node:" + id && now - lastTap.t < DBL) {
      // double-click → rename
      lastTap = { key: null, t: 0 };
      multiSel.clear();
      select("node", id);
      ev.preventDefault();
      openRename("node", id);
      return;
    }
    lastTap = { key: "node:" + id, t: now };
    const w = toWorld(ev.clientX, ev.clientY);
    if (multiSel.size > 1 && multiSel.has(id)) {
      // drag the whole multi-selection together
      const members = [...multiSel].map((mid) => {
        const mn = byId(mid);
        return { n: mn, ox: mn.x, oy: mn.y };
      });
      drag = { mode: "multi", sx: w.x, sy: w.y, members };
    } else {
      multiSel.clear();
      select("node", id);
      drag = {
        mode: "node",
        id,
        dx: w.x - n.x,
        dy: w.y - n.y,
        moved: false,
      };
    }
    stage.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (edgeEl) {
    // select edge (or toggle direction on double-tap)
    const id = edgeEl.dataset.edge;
    const now = Date.now();
    if (lastTap.key === "edge:" + id && now - lastTap.t < DBL) {
      lastTap = { key: null, t: 0 };
      const e = state.edges.find((x) => x.id === id);
      if (e) {
        e.both = !e.both;
        render();
        autosave();
      }
      return;
    }
    lastTap = { key: "edge:" + id, t: now };
    multiSel.clear();
    select("edge", id);
    return;
  }
  if (fBorder) {
    multiSel.clear();
    select("frame", fBorder.dataset.fborder);
    return;
  }
  lastTap = { key: null, t: 0 };
  // seleção por caixa (arrastar com o botão esquerdo no vazio do quadro).
  // sem Ctrl, substitui a seleção atual; com Ctrl, soma à seleção atual.
  if (!(ev.ctrlKey || ev.metaKey)) {
    multiSel.clear();
    select(null);
  }
  const rw = wrap.getBoundingClientRect();
  const w0 = toWorld(ev.clientX, ev.clientY);
  drag = {
    mode: "marquee",
    sxScreen: ev.clientX - rw.left,
    syScreen: ev.clientY - rw.top,
    sxWorld: w0.x,
    syWorld: w0.y,
  };
  marqueeEl.style.left = drag.sxScreen + "px";
  marqueeEl.style.top = drag.syScreen + "px";
  marqueeEl.style.width = "0px";
  marqueeEl.style.height = "0px";
  marqueeEl.style.display = "block";
  stage.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});

stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  if (drag.mode === "pan") {
    view.x = drag.vx + (ev.clientX - drag.sx);
    view.y = drag.vy + (ev.clientY - drag.sy);
    render();
  } else if (drag.mode === "node") {
    const w = toWorld(ev.clientX, ev.clientY);
    const n = byId(drag.id);
    n.x = Math.round(w.x - drag.dx);
    n.y = Math.round(w.y - drag.dy);
    drag.moved = true;
    render();
  } else if (drag.mode === "link") {
    const w = toWorld(ev.clientX, ev.clientY);
    tempLine.setAttribute("x2", w.x);
    tempLine.setAttribute("y2", w.y);
  } else if (drag.mode === "fmove") {
    const w = toWorld(ev.clientX, ev.clientY);
    const f = byFrame(drag.id);
    const dx = Math.round(w.x - drag.sx),
      dy = Math.round(w.y - drag.sy);
    f.x = drag.fx0 + dx;
    f.y = drag.fy0 + dy;
    drag.members.forEach((m) => {
      m.n.x = m.ox + dx;
      m.n.y = m.oy + dy;
    });
    drag.innerFrames.forEach((m) => {
      m.fr.x = m.ox + dx;
      m.fr.y = m.oy + dy;
    });
    render();
  } else if (drag.mode === "fresize") {
    const w = toWorld(ev.clientX, ev.clientY);
    const f = byFrame(drag.id);
    const dx = w.x - drag.sx,
      dy = w.y - drag.sy,
      dir = drag.dir;
    if (dir.includes("e")) f.w = Math.max(180, Math.round(drag.w0 + dx));
    if (dir.includes("s")) f.h = Math.max(120, Math.round(drag.h0 + dy));
    if (dir.includes("w")) {
      const nw = Math.max(180, Math.round(drag.w0 - dx));
      f.x = drag.x0 + drag.w0 - nw;
      f.w = nw;
    }
    if (dir.includes("n")) {
      const nh = Math.max(120, Math.round(drag.h0 - dy));
      f.y = drag.y0 + drag.h0 - nh;
      f.h = nh;
    }
    render();
  } else if (drag.mode === "multi") {
    const w = toWorld(ev.clientX, ev.clientY);
    const dx = Math.round(w.x - drag.sx),
      dy = Math.round(w.y - drag.sy);
    drag.members.forEach((m) => {
      m.n.x = m.ox + dx;
      m.n.y = m.oy + dy;
    });
    render();
  } else if (drag.mode === "marquee") {
    const rw = wrap.getBoundingClientRect();
    const cxScreen = ev.clientX - rw.left,
      cyScreen = ev.clientY - rw.top;
    const x = Math.min(drag.sxScreen, cxScreen),
      y = Math.min(drag.syScreen, cyScreen);
    const w = Math.abs(cxScreen - drag.sxScreen),
      h = Math.abs(cyScreen - drag.syScreen);
    marqueeEl.style.left = x + "px";
    marqueeEl.style.top = y + "px";
    marqueeEl.style.width = w + "px";
    marqueeEl.style.height = h + "px";
  }
});

stage.addEventListener("pointerup", (ev) => {
  if (drag && drag.mode === "link") {
    if (tempLine) {
      tempLine.remove();
      tempLine = null;
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nodeTarget = el && el.closest("[data-node]");
    const frameTarget = el && el.closest("[data-frame]");
    let to = null;
    if (nodeTarget) to = nodeTarget.dataset.node;
    else if (frameTarget) to = frameTarget.dataset.frame;
    else {
      // dropped over empty space inside a núcleo's body
      const w = toWorld(ev.clientX, ev.clientY);
      const hit = [...state.frames]
        .reverse()
        .find(
          (f) =>
            w.x >= f.x &&
            w.x <= f.x + f.w &&
            w.y >= f.y &&
            w.y <= f.y + f.h,
        );
      if (hit) to = hit.id;
    }
    if (
      to &&
      to !== drag.from &&
      !state.edges.some(
        (e) =>
          (e.from === drag.from && e.to === to) ||
          (e.from === to && e.to === drag.from),
      )
    ) {
      state.edges.push({ id: newId(), from: drag.from, to, both: false });
      render();
      toast("Conexão criada");
    }
  } else if (drag && drag.mode === "marquee") {
    const wEnd = toWorld(ev.clientX, ev.clientY);
    const minX = Math.min(drag.sxWorld, wEnd.x),
      maxX = Math.max(drag.sxWorld, wEnd.x);
    const minY = Math.min(drag.syWorld, wEnd.y),
      maxY = Math.max(drag.syWorld, wEnd.y);
    let added = 0;
    state.nodes.forEach((n) => {
      if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
        if (!multiSel.has(n.id)) added++;
        multiSel.add(n.id);
      }
    });
    marqueeEl.style.display = "none";
    if (added) toast(added + " página(s) adicionada(s) à seleção");
    render();
  }
  drag = null;
  autosave();
});

/* double-click is handled manually inside pointerdown (DOM is rebuilt on every render) */

/* scroll sempre dá zoom em direção ao cursor (no quadro e no minimapa);
   mover o quadro é feito arrastando com o botão direito ou o do meio */
function zoomAtScreenPoint(mx, my, deltaY) {
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  const nk = Math.min(2.5, Math.max(0.25, view.k * factor));
  view.x = mx - (mx - view.x) * (nk / view.k);
  view.y = my - (my - view.y) * (nk / view.k);
  view.k = nk;
  updateZoomLabel();
}
wrap.addEventListener(
  "wheel",
  (ev) => {
    // deixa o scroll nativo funcionar dentro de painéis flutuantes roláveis
    // (notas, etc.) em vez de mover o quadro por baixo deles
    if (ev.target.closest(".float-panel-body")) return;
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAtScreenPoint(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY);
    render();
  },
  { passive: false },
);

/* ---------------- selection / delete ---------------- */
function select(type, id) {
  sel = { type, id };
  if (type) closeSettings();
  render();
  updateInspector();
}
function pushHistory() {
  history = history.slice(0, historyIdx + 1);
  history.push(snapshot());
  if (history.length > MAX_HISTORY) history.shift();
  historyIdx = history.length - 1;
}
function applyHistoryAt(idx) {
  const data = JSON.parse(history[idx]);
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  state.frames = data.frames || [];
  state.catDesc = Object.assign({ ...DEFAULT_DESC }, data.catDesc || {});
  state.legendPos = normalizeLegendPos(data.legendPos);
  let max = 0;
  [...state.nodes, ...state.frames].forEach((o) => {
    const m = parseInt(String(o.id).replace(/\D/g, "")) || 0;
    if (m > max) max = m;
  });
  uid = max + 1;
  select(null);
  syncControls();
  render();
}
function undo() {
  if (historyIdx <= 0) {
    toast("Nada para desfazer");
    return;
  }
  historyIdx--;
  applyHistoryAt(historyIdx);
  toast("Desfeito");
  persist();
}
function redo() {
  if (historyIdx >= history.length - 1) {
    toast("Nada para refazer");
    return;
  }
  historyIdx++;
  applyHistoryAt(historyIdx);
  toast("Refeito");
  persist();
}
function copySelected() {
  if (!sel.type) return;
  if (sel.type === "node") {
    const n = byId(sel.id);
    if (n) {
      clipboard = { type: "node", data: { ...n } };
      toast("Copiado");
    }
  } else if (sel.type === "frame") {
    const f = byFrame(sel.id);
    if (!f) return;
    clipboard = {
      type: "frame",
      data: { ...f },
      nodes: nodesInFrame(f).map((n) => ({ ...n })),
      innerFrames: framesInFrame(f).map((fr) => ({ ...fr })),
    };
    toast("Núcleo copiado");
  }
}
function pasteClipboard() {
  if (!clipboard) return;
  const OFF = 30;
  if (clipboard.type === "node") {
    const n = {
      ...clipboard.data,
      id: newId(),
      x: clipboard.data.x + OFF,
      y: clipboard.data.y + OFF,
    };
    state.nodes.push(n);
    select("node", n.id);
    autosave();
    toast("Colado");
  } else if (clipboard.type === "frame") {
    const f = {
      ...clipboard.data,
      id: newId(),
      x: clipboard.data.x + OFF,
      y: clipboard.data.y + OFF,
    };
    state.frames.push(f);
    clipboard.nodes.forEach((n) => {
      state.nodes.push({ ...n, id: newId(), x: n.x + OFF, y: n.y + OFF });
    });
    clipboard.innerFrames.forEach((fr) => {
      state.frames.push({
        ...fr,
        id: newId(),
        x: fr.x + OFF,
        y: fr.y + OFF,
      });
    });
    select("frame", f.id);
    autosave();
    toast("Núcleo colado");
  }
}
window.addEventListener("keydown", (ev) => {
  const tag = (ev.target && ev.target.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
  if (document.getElementById("rename").style.display === "block") return;
  if (ev.ctrlKey || ev.metaKey) {
    if (ev.key === "z" || ev.key === "Z") {
      ev.preventDefault();
      if (ev.shiftKey) redo();
      else undo();
      return;
    }
    if (ev.key === "y" || ev.key === "Y") {
      ev.preventDefault();
      redo();
      return;
    }
    if (ev.key === "c") {
      ev.preventDefault();
      copySelected();
      return;
    }
    if (ev.key === "v") {
      ev.preventDefault();
      pasteClipboard();
      return;
    }
  }
  if (ev.key === "Escape" && multiSel.size) {
    multiSel.clear();
    render();
    return;
  }
  if ((ev.key === "Delete" || ev.key === "Backspace") && multiSel.size) {
    const ids = multiSel;
    state.nodes = state.nodes.filter((n) => !ids.has(n.id));
    state.edges = state.edges.filter(
      (e) => !ids.has(e.from) && !ids.has(e.to),
    );
    toast(ids.size + " página(s) apagada(s)");
    multiSel = new Set();
    select(null);
    autosave();
    return;
  }
  if ((ev.key === "Delete" || ev.key === "Backspace") && sel.type) {
    if (sel.type === "node") {
      state.nodes = state.nodes.filter((n) => n.id !== sel.id);
      state.edges = state.edges.filter(
        (e) => e.from !== sel.id && e.to !== sel.id,
      );
    } else if (sel.type === "edge") {
      state.edges = state.edges.filter((e) => e.id !== sel.id);
    } else if (sel.type === "frame") {
      state.frames = state.frames.filter((f) => f.id !== sel.id);
      state.edges = state.edges.filter(
        (e) => e.from !== sel.id && e.to !== sel.id,
      );
    }
    select(null);
    autosave();
  }
});

/* ---------------- rename ---------------- */
const renameEl = document.getElementById("rename");
let renameTarget = null; // {type:'node'|'frame', id}
function openRename(type, id) {
  renameTarget = { type, id };
  const r = stage.getBoundingClientRect();
  let wx, wy, cur;
  if (type === "frame") {
    const f = byFrame(id);
    wx = f.x + 12;
    wy = f.y;
    cur = f.name;
  } else {
    const n = byId(id);
    wx = n.x;
    wy = n.y + 30;
    cur = n.name;
  }
  const sx = r.left + view.x + wx * view.k,
    sy = r.top + view.y + wy * view.k;
  renameEl.value = cur;
  renameEl.style.display = "block";
  renameEl.style.left =
    sx -
    wrap.getBoundingClientRect().left -
    (type === "frame" ? 0 : 90) +
    "px";
  renameEl.style.top = sy - wrap.getBoundingClientRect().top + "px";
  renameEl.style.width = (type === "frame" ? 220 : 180) + "px";
  setTimeout(() => {
    renameEl.focus();
    renameEl.select();
  }, 0);
}
function commitRename() {
  if (renameTarget) {
    const t =
      renameTarget.type === "frame"
        ? byFrame(renameTarget.id)
        : byId(renameTarget.id);
    if (t) {
      t.name = renameEl.value.trim() || t.name;
    }
  }
  renameEl.style.display = "none";
  renameTarget = null;
  render();
  autosave();
}
renameEl.addEventListener("blur", commitRename);
renameEl.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    commitRename();
  }
  if (ev.key === "Escape") {
    renameTarget = null;
    renameEl.style.display = "none";
  }
});

/* ---------------- add node ---------------- */
function addNode(cat) {
  const r = stage.getBoundingClientRect();
  const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const n = {
    id: newId(),
    name: "Novo " + CATS[cat].label.toLowerCase(),
    category: cat,
    x: Math.round(c.x + (Math.random() * 60 - 30)),
    y: Math.round(c.y + (Math.random() * 60 - 30)),
  };
  state.nodes.push(n);
  select("node", n.id);
  autosave();
  openRename("node", n.id);
}
function addFrame() {
  const r = stage.getBoundingClientRect();
  const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const color = NUC_COLORS[state.frames.length % NUC_COLORS.length];
  const f = {
    id: newId(),
    name: "Novo núcleo",
    x: Math.round(c.x - 200),
    y: Math.round(c.y - 150),
    w: 400,
    h: 300,
    color,
  };
  state.frames.push(f);
  select("frame", f.id);
  autosave();
  openRename("frame", f.id);
  toast("Núcleo criado — arraste itens para dentro");
}

/* highlight every node of a category (hover over the palette on the left) */
function setCatHighlight(cat, on) {
  highlightCat = on ? cat : null;
  nodeLayer.querySelectorAll(".node-grp").forEach((g) => {
    const scaleEl = g.querySelector(".node-scale");
    if (!scaleEl) return;
    const active = on && g.dataset.cat === cat;
    scaleEl.setAttribute("transform", active ? "scale(1.18)" : "scale(1)");
  });
}

/* ---------------- buscar por nome (Ctrl+F, painel flutuante) ---------------- */
const searchPanel = document.getElementById("search-panel");
const searchInput = document.getElementById("search-input");
const searchClose = document.getElementById("search-close");
function openSearch() {
  searchPanel.hidden = false;
  searchInput.focus();
  searchInput.select();
}
function closeSearch() {
  searchPanel.hidden = true;
  searchInput.value = "";
  searchQuery = "";
  searchInput.blur();
  render();
}
window.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && (ev.key === "f" || ev.key === "F")) {
    ev.preventDefault();
    openSearch();
  }
});
searchClose.addEventListener("click", closeSearch);
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});
searchInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    if (!searchQuery) return;
    const matches = state.nodes.filter((n) =>
      n.name.toLowerCase().includes(searchQuery),
    );
    if (!matches.length) {
      toast("Nenhuma página encontrada");
      return;
    }
    fitToNodes(matches);
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    closeSearch();
  }
});

/* ---------------- Markdown simples para pré-visualização das notas ---------------- */
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function inlineMarkdown(s) {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return s;
}
function renderMarkdown(src) {
  if (!src || !src.trim())
    return '<span class="note-preview-empty">Sem anotações</span>';
  const lines = src.split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeBuf = [];
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (inCode) {
        html += "<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>";
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    const h = raw.match(/^(#{1,4})\s+(.*)/);
    const li = raw.match(/^\s*[-*]\s+(.*)/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      html += `<h${lvl}>` + inlineMarkdown(h[2]) + `</h${lvl}>`;
      continue;
    }
    if (li) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += "<li>" + inlineMarkdown(li[1]) + "</li>";
      continue;
    }
    closeList();
    if (!raw.trim()) continue;
    html += "<p>" + inlineMarkdown(raw) + "</p>";
  }
  closeList();
  if (inCode) html += "<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>";
  return html || '<span class="note-preview-empty">Sem anotações</span>';
}

/* ---------------- painel flutuante da seleção (página: notas/status · núcleo: notas/cor) ---------------- */
const STATUS_DEFS = [
  { key: "rascunho", label: "Rascunho", color: "#94a3b8" },
  { key: "producao", label: "Em produção", color: "#f59e0b" },
  { key: "publicado", label: "Publicado", color: "#16a34a" },
  { key: "refatorar", label: "Precisa refatorar", color: "#dc2626" },
];
const floatPanel = document.getElementById("float-panel");
const floatPanelHead = document.getElementById("float-panel-head");
const floatPanelTitle = document.getElementById("float-panel-title");
const floatPanelClose = document.getElementById("float-panel-close");
const fpNode = document.getElementById("fp-node");
const fpFrame = document.getElementById("fp-frame");
const inspectorName = document.getElementById("inspector-name");
const inspectorNote = document.getElementById("inspector-note");
const inspectorNotePreview = document.getElementById("inspector-note-preview");
const statusRow = document.getElementById("status-row");
STATUS_DEFS.forEach((s) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "status-opt";
  btn.dataset.status = s.key;
  btn.title = s.label;
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = s.color;
  btn.appendChild(dot);
  btn.appendChild(document.createTextNode(s.label));
  btn.addEventListener("click", () => {
    if (sel.type !== "node") return;
    const n = byId(sel.id);
    if (!n) return;
    n.status = n.status === s.key ? null : s.key;
    render();
    updateInspector();
    autosave();
  });
  statusRow.appendChild(btn);
});

/* posição do painel: null = canto padrão; depois de arrastado, mantém o
   mesmo lugar ao trocar de seleção, até a página recarregar */
let floatPanelPos = null;
function positionFloatPanel() {
  if (floatPanelPos) {
    floatPanel.style.left = floatPanelPos.left + "px";
    floatPanel.style.top = floatPanelPos.top + "px";
    floatPanel.style.right = "auto";
  } else {
    floatPanel.style.left = "auto";
    floatPanel.style.right = "14px";
    floatPanel.style.top = "84px";
  }
}
let fpDrag = null;
floatPanelHead.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest(".float-panel-close")) return;
  const wrapRect = wrap.getBoundingClientRect();
  const panelRect = floatPanel.getBoundingClientRect();
  fpDrag = {
    sx: ev.clientX,
    sy: ev.clientY,
    ox: panelRect.left - wrapRect.left,
    oy: panelRect.top - wrapRect.top,
  };
  floatPanelHead.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});
floatPanelHead.addEventListener("pointermove", (ev) => {
  if (!fpDrag) return;
  const wrapRect = wrap.getBoundingClientRect();
  const maxLeft = Math.max(4, wrapRect.width - floatPanel.offsetWidth - 4);
  const maxTop = Math.max(4, wrapRect.height - floatPanel.offsetHeight - 4);
  const left = Math.min(
    Math.max(4, fpDrag.ox + (ev.clientX - fpDrag.sx)),
    maxLeft,
  );
  const top = Math.min(
    Math.max(4, fpDrag.oy + (ev.clientY - fpDrag.sy)),
    maxTop,
  );
  floatPanelPos = { left, top };
  positionFloatPanel();
});
function endFpDrag(ev) {
  if (!fpDrag) return;
  fpDrag = null;
  try {
    floatPanelHead.releasePointerCapture(ev.pointerId);
  } catch (e) {}
}
floatPanelHead.addEventListener("pointerup", endFpDrag);
floatPanelHead.addEventListener("pointercancel", endFpDrag);
floatPanelClose.addEventListener("click", () => {
  multiSel.clear();
  select(null);
});

function updateInspector() {
  if (sel.type === "node") {
    const n = byId(sel.id);
    if (n) {
      floatPanel.hidden = false;
      floatPanelTitle.textContent = "Página selecionada";
      fpNode.hidden = false;
      fpFrame.hidden = true;
      inspectorName.textContent = n.name;
      inspectorNote.value = n.note || "";
      inspectorNotePreview.innerHTML = renderMarkdown(n.note || "");
      document.querySelectorAll(".status-opt").forEach((b) => {
        b.classList.toggle("active", b.dataset.status === n.status);
      });
      positionFloatPanel();
      return;
    }
  } else if (sel.type === "frame") {
    const f = byFrame(sel.id);
    if (f) {
      floatPanel.hidden = false;
      floatPanelTitle.textContent = "Núcleo selecionado";
      fpNode.hidden = true;
      fpFrame.hidden = false;
      updateFrameColorPanel(f);
      positionFloatPanel();
      return;
    }
  }
  floatPanel.hidden = true;
}
let noteSaveTimer = null;
inspectorNote.addEventListener("input", () => {
  if (sel.type !== "node") return;
  const n = byId(sel.id);
  if (!n) return;
  n.note = inspectorNote.value;
  inspectorNotePreview.innerHTML = renderMarkdown(n.note);
  render();
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => autosave(), 500);
});
["click", "mousedown", "dblclick", "wheel"].forEach((t) =>
  inspectorNote.addEventListener(t, (e) => e.stopPropagation()),
);

/* ---------------- notas e cor personalizável do núcleo ---------------- */
const frameInspectorName = document.getElementById("frame-inspector-name");
const frameInspectorNote = document.getElementById("frame-inspector-note");
const frameInspectorNotePreview = document.getElementById(
  "frame-inspector-note-preview",
);
let frameNoteSaveTimer = null;
frameInspectorNote.addEventListener("input", () => {
  if (sel.type !== "frame") return;
  const f = byFrame(sel.id);
  if (!f) return;
  f.note = frameInspectorNote.value;
  frameInspectorNotePreview.innerHTML = renderMarkdown(f.note);
  clearTimeout(frameNoteSaveTimer);
  frameNoteSaveTimer = setTimeout(() => autosave(), 500);
});
["click", "mousedown", "dblclick", "wheel"].forEach((t) =>
  frameInspectorNote.addEventListener(t, (e) => e.stopPropagation()),
);
const frameColorRow = document.getElementById("frame-color-row");
NUC_COLORS.forEach((color) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "color-swatch";
  btn.style.background = color;
  btn.dataset.color = color;
  btn.title = color;
  btn.addEventListener("click", () => {
    if (sel.type !== "frame") return;
    const f = byFrame(sel.id);
    if (!f) return;
    f.color = color;
    render();
    updateInspector();
    autosave();
  });
  frameColorRow.appendChild(btn);
});
const frameColorCustom = document.createElement("input");
frameColorCustom.type = "color";
frameColorCustom.className = "color-custom";
frameColorCustom.title = "Cor personalizada";
frameColorCustom.addEventListener("input", () => {
  if (sel.type !== "frame") return;
  const f = byFrame(sel.id);
  if (!f) return;
  f.color = frameColorCustom.value;
  render();
});
frameColorCustom.addEventListener("change", () => {
  updateInspector();
  autosave();
});
frameColorRow.appendChild(frameColorCustom);
function updateFrameColorPanel(f) {
  frameInspectorName.textContent = f.name;
  frameInspectorNote.value = f.note || "";
  frameInspectorNotePreview.innerHTML = renderMarkdown(f.note || "");
  frameColorRow.querySelectorAll(".color-swatch").forEach((b) => {
    b.classList.toggle(
      "active",
      b.dataset.color.toLowerCase() === String(f.color).toLowerCase(),
    );
  });
  frameColorCustom.value = /^#[0-9a-f]{6}$/i.test(f.color)
    ? f.color
    : "#4f46e5";
}

/* palette UI */
const pal = document.getElementById("palette");
for (const key in CATS) {
  const c = CATS[key];
  const item = document.createElement("div");
  item.className = "pal-item";
  const g = document.createElementNS(SVGNS, "svg");
  g.setAttribute("viewBox", "-50 -42 100 84");
  g.setAttribute("width", "34");
  g.setAttribute("height", "30");
  buildGlyph(key, { sw: 3.2 }).forEach((el) => g.appendChild(el));
  const glyph = document.createElement("div");
  glyph.className = "glyph";
  glyph.appendChild(g);
  const meta = document.createElement("div");
  meta.className = "meta";
  const b = document.createElement("b");
  b.textContent = c.label;
  const inp = document.createElement("input");
  inp.className = "pal-desc";
  inp.value = getDesc(key);
  inp.title = "Editar descrição da categoria";
  inp.setAttribute("aria-label", "Descrição de " + c.label);
  ["click", "mousedown", "dblclick"].forEach((t) =>
    inp.addEventListener(t, (e) => e.stopPropagation()),
  );
  inp.addEventListener("input", () => {
    state.catDesc[key] = inp.value;
    autosave();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inp.blur();
  });
  meta.appendChild(b);
  meta.appendChild(inp);
  item.appendChild(glyph);
  item.appendChild(meta);
  item.addEventListener("click", () => addNode(key));
  item.addEventListener("mouseenter", () => setCatHighlight(key, true));
  item.addEventListener("mouseleave", () => setCatHighlight(key, false));
  pal.appendChild(item);
}

/* grouping palette: Núcleo */
(function () {
  const item = document.createElement("div");
  item.className = "pal-item";
  const g = document.createElementNS(SVGNS, "svg");
  g.setAttribute("viewBox", "-50 -42 100 84");
  g.setAttribute("width", "34");
  g.setAttribute("height", "30");
  g.appendChild(
    mk("rect", {
      x: -44,
      y: -32,
      width: 88,
      height: 64,
      rx: 12,
      fill: NUC_COLORS[0],
      "fill-opacity": "0.08",
      stroke: NUC_COLORS[0],
      "stroke-width": 3,
      "stroke-dasharray": "7 6",
    }),
  );
  const glyph = document.createElement("div");
  glyph.className = "glyph";
  glyph.appendChild(g);
  const meta = document.createElement("div");
  meta.className = "meta";
  const b = document.createElement("b");
  b.textContent = "Núcleo";
  const inp = document.createElement("input");
  inp.className = "pal-desc";
  inp.value = getDesc("nucleo");
  inp.title = "Editar descrição do núcleo";
  inp.setAttribute("aria-label", "Descrição do Núcleo");
  ["click", "mousedown", "dblclick"].forEach((t) =>
    inp.addEventListener(t, (e) => e.stopPropagation()),
  );
  inp.addEventListener("input", () => {
    state.catDesc.nucleo = inp.value;
    autosave();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inp.blur();
  });
  meta.appendChild(b);
  meta.appendChild(inp);
  item.appendChild(glyph);
  item.appendChild(meta);
  item.addEventListener("click", addFrame);
  document.getElementById("palette-group").appendChild(item);
})();

/* ---------------- recolher/expandir a barra lateral ---------------- */
const ASIDE_KEY = "cluster:aside-collapsed";
const workEl = document.getElementById("work");
const asideToggleBtn = document.getElementById("aside-toggle");
function setAsideCollapsed(collapsed) {
  workEl.classList.toggle("aside-collapsed", collapsed);
  asideToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  asideToggleBtn.title = collapsed ? "Expandir barra lateral" : "Recolher barra lateral";
  localStorage.setItem(ASIDE_KEY, collapsed ? "1" : "0");
}
asideToggleBtn.addEventListener("click", () => {
  setAsideCollapsed(!workEl.classList.contains("aside-collapsed"));
});
setAsideCollapsed(localStorage.getItem(ASIDE_KEY) === "1");

/* ---------------- fit / zoom ---------------- */
function contentBounds() {
  if (!state.nodes.length && !state.frames.length) return null;
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const n of state.nodes) {
    const b = nodeBox(n);
    minX = Math.min(minX, n.x - b.halfW);
    maxX = Math.max(maxX, n.x + b.halfW);
    minY = Math.min(minY, n.y + b.top);
    maxY = Math.max(maxY, n.y + b.bottom);
  }
  for (const f of state.frames) {
    minX = Math.min(minX, f.x);
    maxX = Math.max(maxX, f.x + f.w);
    minY = Math.min(minY, f.y - 16);
    maxY = Math.max(maxY, f.y + f.h);
  }
  return { minX, minY, maxX, maxY };
}
function fitToBounds(b, pad) {
  if (!b) return;
  pad = pad == null ? 70 : pad;
  const r = stage.getBoundingClientRect();
  const w = b.maxX - b.minX + pad * 2,
    h = b.maxY - b.minY + pad * 2;
  view.k = Math.min(
    2,
    Math.max(0.25, Math.min(r.width / w, r.height / h)),
  );
  view.x = r.width / 2 - ((b.minX + b.maxX) / 2) * view.k;
  view.y = r.height / 2 - ((b.minY + b.maxY) / 2) * view.k;
  render();
  updateZoomLabel();
}
function fit() {
  fitToBounds(contentBounds());
}
function nodesBounds(list) {
  if (!list.length) return null;
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const n of list) {
    const b = nodeBox(n);
    minX = Math.min(minX, n.x - b.halfW);
    maxX = Math.max(maxX, n.x + b.halfW);
    minY = Math.min(minY, n.y + b.top);
    maxY = Math.max(maxY, n.y + b.bottom);
  }
  return { minX, minY, maxX, maxY };
}
function fitToNodes(list) {
  fitToBounds(nodesBounds(list), 90);
}

/* ---------------- minimapa ---------------- */
const minimapSvg = document.getElementById("minimap-svg");
const MM_W = 180,
  MM_H = 130,
  MM_PAD = 8;
let minimapXform = null; // {scale, ox, oy} world -> minimap
function renderMinimap() {
  minimapSvg.textContent = "";
  const b = contentBounds();
  if (!b) {
    minimapXform = null;
    return;
  }
  const cw = Math.max(1, b.maxX - b.minX),
    ch = Math.max(1, b.maxY - b.minY);
  const innerW = MM_W - MM_PAD * 2,
    innerH = MM_H - MM_PAD * 2;
  const scale = Math.min(innerW / cw, innerH / ch);
  const ox = MM_PAD - b.minX * scale + (innerW - cw * scale) / 2;
  const oy = MM_PAD - b.minY * scale + (innerH - ch * scale) / 2;
  minimapXform = { scale, ox, oy };
  const toMM = (x, y) => ({ x: x * scale + ox, y: y * scale + oy });

  for (const f of state.frames) {
    const p = toMM(f.x, f.y);
    minimapSvg.appendChild(
      mk("rect", {
        x: p.x,
        y: p.y,
        width: Math.max(1, f.w * scale),
        height: Math.max(1, f.h * scale),
        fill: f.color,
        "fill-opacity": "0.25",
        stroke: f.color,
        "stroke-width": 1,
      }),
    );
  }
  for (const n of state.nodes) {
    const p = toMM(n.x, n.y);
    const c = CATS[n.category];
    minimapSvg.appendChild(
      mk("circle", {
        cx: p.x,
        cy: p.y,
        r: 2.2,
        fill: c ? `var(--c-${c.cssVar}-s)` : "#888",
      }),
    );
  }
  const r = stage.getBoundingClientRect();
  if (r.width && r.height) {
    const p0 = toMM(-view.x / view.k, -view.y / view.k);
    const p1 = toMM(
      (r.width - view.x) / view.k,
      (r.height - view.y) / view.k,
    );
    minimapSvg.appendChild(
      mk("rect", {
        x: p0.x,
        y: p0.y,
        width: Math.max(2, p1.x - p0.x),
        height: Math.max(2, p1.y - p0.y),
        fill: "none",
        stroke: "var(--accent)",
        "stroke-width": 1.5,
      }),
    );
  }
}
function jumpToMinimap(ev) {
  if (!minimapXform) return;
  const rect = minimapSvg.getBoundingClientRect();
  const mx = ((ev.clientX - rect.left) / rect.width) * MM_W;
  const my = ((ev.clientY - rect.top) / rect.height) * MM_H;
  const wx = (mx - minimapXform.ox) / minimapXform.scale;
  const wy = (my - minimapXform.oy) / minimapXform.scale;
  const r = stage.getBoundingClientRect();
  view.x = r.width / 2 - wx * view.k;
  view.y = r.height / 2 - wy * view.k;
  render();
}
let minimapDragging = false;
minimapSvg.addEventListener("pointerdown", (ev) => {
  minimapDragging = true;
  jumpToMinimap(ev);
  try {
    minimapSvg.setPointerCapture(ev.pointerId);
  } catch (e) {}
});
minimapSvg.addEventListener("pointermove", (ev) => {
  if (minimapDragging) jumpToMinimap(ev);
});
minimapSvg.addEventListener("pointerup", () => {
  minimapDragging = false;
});
minimapSvg.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    if (!minimapXform) return;
    const rect = minimapSvg.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * MM_W;
    const my = ((ev.clientY - rect.top) / rect.height) * MM_H;
    const wx = (mx - minimapXform.ox) / minimapXform.scale;
    const wy = (my - minimapXform.oy) / minimapXform.scale;
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nk = Math.min(2.5, Math.max(0.25, view.k * factor));
    const r = stage.getBoundingClientRect();
    view.x = r.width / 2 - wx * nk;
    view.y = r.height / 2 - wy * nk;
    view.k = nk;
    updateZoomLabel();
    render();
  },
  { passive: false },
);
/* ---------------- auto-organizar (layout hierárquico automático) ---------------- */
function autoLayout() {
  if (!state.nodes.length && !state.frames.length) return;
  // congela quem pertence a cada núcleo antes de mover qualquer coisa
  const frameSnap = state.frames.map((f) => ({
    f,
    nodes: nodesInFrame(f),
    inner: framesInFrame(f),
  }));
  const nodeToFrame = new Map();
  frameSnap.forEach(({ f, nodes }) =>
    nodes.forEach((n) => nodeToFrame.set(n.id, f.id)),
  );
  const looseNodes = state.nodes.filter((n) => !nodeToFrame.has(n.id));
  const unitOf = (refId) => nodeToFrame.get(refId) || refId;

  const units = new Map();
  looseNodes.forEach((n) => {
    const b = nodeBox(n);
    units.set(n.id, {
      kind: "node",
      ref: n,
      w: b.halfW * 2,
      h: b.bottom - b.top,
      boxTop: b.top,
    });
  });
  state.frames.forEach((f) => {
    units.set(f.id, { kind: "frame", ref: f, w: f.w, h: f.h + 20 });
  });
  if (!units.size) return;

  const adj = new Map();
  const indeg = new Map();
  units.forEach((_, id) => {
    adj.set(id, new Set());
    indeg.set(id, 0);
  });
  state.edges.forEach((e) => {
    const a = unitOf(e.from),
      b = unitOf(e.to);
    if (a === b || !units.has(a) || !units.has(b)) return;
    adj.get(a).add(b);
    adj.get(b).add(a);
    indeg.set(b, indeg.get(b) + 1);
  });

  // componentes conectados
  const seen = new Set();
  const components = [];
  units.forEach((_, id) => {
    if (seen.has(id)) return;
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      adj.get(cur).forEach((nb) => {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      });
    }
    components.push(comp);
  });

  const HGAP = 60,
    VGAP = 240,
    COMP_GAP = 160;
  let compOffsetX = 0;
  const targets = new Map();

  components.forEach((comp) => {
    let roots = comp.filter((id) => indeg.get(id) === 0);
    if (!roots.length) roots = [comp[0]];
    const level = new Map();
    const queue = [];
    roots.forEach((r) => {
      level.set(r, 0);
      queue.push(r);
    });
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      adj.get(cur).forEach((nb) => {
        if (!level.has(nb)) {
          level.set(nb, level.get(cur) + 1);
          queue.push(nb);
        }
      });
    }
    comp.forEach((id) => {
      if (!level.has(id)) level.set(id, 0);
    });

    const byLevel = new Map();
    comp.forEach((id) => {
      const lv = level.get(id);
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv).push(id);
    });
    const maxLevel = Math.max(...comp.map((id) => level.get(id)));
    let compWidth = 0;
    const levelRows = [];
    for (let lv = 0; lv <= maxLevel; lv++) {
      const ids = (byLevel.get(lv) || []).slice().sort((a, b) => {
        const ua = units.get(a),
          ub = units.get(b);
        const xa = ua.kind === "node" ? ua.ref.x : ua.ref.x + ua.ref.w / 2;
        const xb = ub.kind === "node" ? ub.ref.x : ub.ref.x + ub.ref.w / 2;
        return xa - xb;
      });
      const rowWidth =
        ids.reduce((s, id) => s + units.get(id).w, 0) +
        HGAP * Math.max(0, ids.length - 1);
      compWidth = Math.max(compWidth, rowWidth);
      levelRows.push({ ids, rowWidth });
    }
    let y = 0;
    levelRows.forEach(({ ids, rowWidth }) => {
      let x = compOffsetX + (compWidth - rowWidth) / 2;
      let rowMaxH = 0;
      ids.forEach((id) => {
        const u = units.get(id);
        targets.set(id, { x, y });
        rowMaxH = Math.max(rowMaxH, u.h);
        x += u.w + HGAP;
      });
      y += rowMaxH + VGAP;
    });
    compOffsetX += compWidth + COMP_GAP;
  });

  targets.forEach((pos, id) => {
    const u = units.get(id);
    if (u.kind === "node") {
      u.ref.x = Math.round(pos.x + u.w / 2);
      u.ref.y = Math.round(pos.y - u.boxTop);
    }
  });
  frameSnap.forEach(({ f, nodes, inner }) => {
    const pos = targets.get(f.id);
    if (!pos) return;
    const dx = Math.round(pos.x - f.x);
    const dy = Math.round(pos.y - (f.y - 20));
    f.x += dx;
    f.y += dy;
    nodes.forEach((n) => {
      n.x += dx;
      n.y += dy;
    });
    inner.forEach((fr) => {
      fr.x += dx;
      fr.y += dy;
    });
  });

  multiSel.clear();
  select(null);
  fit();
  autosave();
  toast("Layout reorganizado");
}
document.getElementById("btn-layout").onclick = () => {
  confirmAction(
    "Isso reorganiza automaticamente todas as páginas e núcleos do quadro em hierarquia. Deseja continuar?",
    autoLayout,
  );
};

function updateZoomLabel() {
  document.getElementById("zlabel").textContent =
    Math.round(view.k * 100) + "%";
}
document.getElementById("z-in").onclick = () => {
  view.k = Math.min(2.5, view.k * 1.15);
  render();
  updateZoomLabel();
};
document.getElementById("z-out").onclick = () => {
  view.k = Math.max(0.25, view.k / 1.15);
  render();
  updateZoomLabel();
};
document.getElementById("btn-fit").onclick = fit;

/* ---------------- toast ---------------- */
let tipT;
function toast(msg) {
  const t = document.getElementById("tip");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(tipT);
  tipT = setTimeout(() => t.classList.remove("show"), 1600);
}

/* ---------------- modal de confirmação genérico ---------------- */
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmMessage = document.getElementById("confirm-message");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const confirmOkBtn = document.getElementById("confirm-ok");
let confirmCallback = null;
function confirmAction(message, onConfirm) {
  confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  confirmOverlay.hidden = false;
}
function closeConfirm() {
  confirmOverlay.hidden = true;
  confirmCallback = null;
}
confirmCancelBtn.addEventListener("click", closeConfirm);
confirmOkBtn.addEventListener("click", () => {
  const cb = confirmCallback;
  closeConfirm();
  if (cb) cb();
});
confirmOverlay.addEventListener("click", (ev) => {
  if (ev.target === confirmOverlay) closeConfirm();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !confirmOverlay.hidden) {
    ev.preventDefault();
    closeConfirm();
  }
});

/* ---------------- popup "Como utilizar" ---------------- */
const helpOverlay = document.getElementById("help-overlay");
const helpBtn = document.getElementById("btn-help");
const helpCloseBtn = document.getElementById("help-close");
function openHelp() {
  closeSettings();
  helpOverlay.hidden = false;
}
function closeHelp() {
  helpOverlay.hidden = true;
}
helpBtn.addEventListener("click", openHelp);
helpCloseBtn.addEventListener("click", closeHelp);
helpOverlay.addEventListener("click", (ev) => {
  if (ev.target === helpOverlay) closeHelp();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !helpOverlay.hidden) {
    ev.preventDefault();
    closeHelp();
  }
});

/* ---------------- "Adicionar feedback" (bug/sugestão por e-mail ou WhatsApp) ---------------- */
const FEEDBACK_EMAIL = "erickaxs0105@gmail.com";
const FEEDBACK_WHATSAPP = "5511975700275";
const feedbackOverlay = document.getElementById("feedback-overlay");
const feedbackBtn = document.getElementById("btn-feedback");
const feedbackCloseBtn = document.getElementById("feedback-close");
const feedbackText = document.getElementById("feedback-text");
function openFeedback() {
  closeSettings();
  feedbackOverlay.hidden = false;
  feedbackText.focus();
}
function closeFeedback() {
  feedbackOverlay.hidden = true;
}
feedbackBtn.addEventListener("click", openFeedback);
feedbackCloseBtn.addEventListener("click", closeFeedback);
feedbackOverlay.addEventListener("click", (ev) => {
  if (ev.target === feedbackOverlay) closeFeedback();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !feedbackOverlay.hidden) {
    ev.preventDefault();
    closeFeedback();
  }
});
document.getElementById("feedback-email").addEventListener("click", () => {
  const msg = feedbackText.value.trim();
  if (!msg) {
    toast("Escreva a mensagem antes de enviar");
    return;
  }
  const subject = encodeURIComponent(
    "Feedback — Construtor de Cluster de Site",
  );
  const body = encodeURIComponent(msg);
  window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  closeFeedback();
  feedbackText.value = "";
});
document.getElementById("feedback-whatsapp").addEventListener("click", () => {
  const msg = feedbackText.value.trim();
  if (!msg) {
    toast("Escreva a mensagem antes de enviar");
    return;
  }
  const text = encodeURIComponent(msg);
  window.open(
    `https://wa.me/${FEEDBACK_WHATSAPP}?text=${text}`,
    "_blank",
    "noopener",
  );
  closeFeedback();
  feedbackText.value = "";
});

/* ---------------- export ---------------- */
const FONT =
  'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/* measure the legend block so the canvas can grow to fit it */
function legendEntries() {
  const used = Object.keys(CATS).filter((k) =>
    state.nodes.some((n) => n.category === k),
  );
  const entries = used.map((k) => ({
    kind: "cat",
    cat: k,
    label: CATS[k].label,
    color: CATS[k].stroke,
    desc: getDesc(k),
  }));
  if (state.frames.length)
    entries.push({
      kind: "nuc",
      label: "Núcleo",
      color: NUC_COLORS[0],
      desc: getDesc("nucleo"),
    });
  STATUS_DEFS.forEach((s) => {
    if (state.nodes.some((n) => n.status === s.key))
      entries.push({ kind: "status", label: s.label, color: s.color });
  });
  return entries;
}
function legendMetrics() {
  const entries = legendEntries();
  const rowH = 38,
    headerH = 34,
    glyphCol = 58,
    padIn = 20,
    gapText = 10;
  let textW = 0;
  for (const e of entries) {
    mctx.font = "700 13.5px " + FONT;
    const lw = mctx.measureText(e.label).width;
    mctx.font = "400 13px " + FONT;
    const dw = e.desc ? mctx.measureText("  —  " + e.desc).width : 0;
    textW = Math.max(textW, lw + dw);
  }
  mctx.font = "700 12px " + FONT;
  const titleW = mctx.measureText("LEGENDA").width;
  const W = Math.max(
    glyphCol + gapText + textW + padIn * 2,
    titleW + padIn * 2,
    300,
  );
  const H = headerH + entries.length * rowH + padIn;
  return { entries, rowH, headerH, glyphCol, padIn, gapText, W, H };
}

/* paleta usada na exportação (independente do tema atual do app) */
const EXPORT_THEME = {
  light: {
    bg: "#ffffff",
    ink: "#1e2330",
    arrow: "#9aa0b4",
    legendBg: "#ffffff",
    legendBorder: "#e6e7ee",
    legendTitle: "#6b7180",
    legendDesc: "#5b6172",
  },
  dark: {
    bg: "#14161f",
    ink: "#e7e9f2",
    arrow: "#6b7280",
    legendBg: "#1b1e29",
    legendBorder: "#2b2f3d",
    legendTitle: "#8a90a4",
    legendDesc: "#aab0c4",
  },
};

/* desenha a legenda como um grupo com transform translate(lx,ly), para que
   possa ser arrastada no preview interativo apenas mudando esse transform */
function drawLegend(parent, lx, ly, L, pal) {
  const g = mk("g", {
    transform: `translate(${lx} ${ly})`,
    "data-export-legend": "1",
  });
  g.appendChild(
    mk("rect", {
      x: 0,
      y: 0,
      width: L.W,
      height: L.H,
      rx: 14,
      fill: pal.legendBg,
      stroke: pal.legendBorder,
      "stroke-width": 1.4,
    }),
  );
  const title = mk("text", {
    x: L.padIn,
    y: 24,
    "font-family": FONT,
    "font-size": "12",
    "font-weight": "700",
    "letter-spacing": "1.5",
    fill: pal.legendTitle,
  });
  title.textContent = "LEGENDA";
  g.appendChild(title);
  let ry = L.headerH + L.rowH / 2;
  for (const e of L.entries) {
    const gx = L.padIn + L.glyphCol / 2 - 4;
    if (e.kind === "cat") {
      const gg = mk("g", {
        transform: `translate(${gx} ${ry}) scale(0.30)`,
      });
      buildGlyph(e.cat, { sw: 5, resolved: true }).forEach((el) =>
        gg.appendChild(el),
      );
      g.appendChild(gg);
    } else if (e.kind === "status") {
      g.appendChild(
        mk("circle", {
          cx: gx,
          cy: ry,
          r: 9,
          fill: e.color,
          stroke: pal.legendBg,
          "stroke-width": 1.5,
        }),
      );
    } else {
      g.appendChild(
        mk("rect", {
          x: gx - 19,
          y: ry - 13,
          width: 38,
          height: 26,
          rx: 7,
          fill: e.color,
          "fill-opacity": "0.08",
          stroke: e.color,
          "stroke-width": 2,
          "stroke-dasharray": "5 4",
        }),
      );
    }
    const tx = L.padIn + L.glyphCol + L.gapText;
    const t = mk("text", {
      x: tx,
      y: ry + 5,
      "font-family": FONT,
      "font-size": "13.5",
      fill: pal.ink,
    });
    const a = mk("tspan", { "font-weight": "700", fill: e.color });
    a.textContent = e.label;
    t.appendChild(a);
    if (e.desc) {
      const bsp = mk("tspan", { "font-weight": "400", fill: pal.legendDesc });
      bsp.textContent = "  —  " + e.desc;
      t.appendChild(bsp);
    }
    g.appendChild(t);
    ry += L.rowH;
  }
  parent.appendChild(g);
  return g;
}

/* draw a nucleus frame into the export svg */
function drawFrameExport(parent, f) {
  parent.appendChild(
    mk("rect", {
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      rx: 18,
      fill: f.color,
      "fill-opacity": "0.05",
      stroke: f.color,
      "stroke-opacity": "0.55",
      "stroke-width": 2,
      "stroke-dasharray": "7 6",
    }),
  );
  mctx.font = FRAME_FONT;
  const tw = mctx.measureText(f.name).width;
  const tabW = Math.min(f.w - 16, tw + 28);
  parent.appendChild(
    mk("rect", {
      x: f.x + 12,
      y: f.y - 13.5,
      width: tabW,
      height: 27,
      rx: 9,
      fill: f.color,
    }),
  );
  const tt = mk("text", {
    x: f.x + 26,
    y: f.y + 5,
    "font-family": FONT,
    "font-size": "13",
    "font-weight": "700",
    fill: "#ffffff",
  });
  tt.textContent = f.name;
  parent.appendChild(tt);
}

/* opts: {theme:"light"|"dark", legendShow:bool, legendXY:{x,y}|null} */
function buildExportSVG(opts) {
  opts = opts || {};
  const b = contentBounds();
  if (!b) return null;
  const pal = EXPORT_THEME[opts.theme === "dark" ? "dark" : "light"];
  const pad = 64,
    gap = 42;
  const showLeg = opts.legendShow !== false;
  const L = legendMetrics();
  // posição padrão: abaixo do conteúdo; se houver uma posição arrastada
  // (legendXY), ela é usada em vez do padrão
  let legX = b.minX,
    legY = b.maxY + gap;
  if (opts.legendXY) {
    legX = opts.legendXY.x;
    legY = opts.legendXY.y;
  }
  // union of content + legend
  let minX = b.minX,
    minY = b.minY,
    maxX = b.maxX,
    maxY = b.maxY;
  if (showLeg) {
    minX = Math.min(minX, legX);
    minY = Math.min(minY, legY);
    maxX = Math.max(maxX, legX + L.W);
    maxY = Math.max(maxY, legY + L.H);
  }
  const vx = minX - pad,
    vy = minY - pad;
  const W = Math.ceil(maxX - minX + pad * 2),
    H = Math.ceil(maxY - minY + pad * 2);
  const svg = mk("svg", {
    xmlns: SVGNS,
    width: W,
    height: H,
    viewBox: `${vx} ${vy} ${W} ${H}`,
  });
  // defs (arrow)
  const d = mk("defs", {});
  const m = mk("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: 8.5,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: "auto-start-reverse",
  });
  m.appendChild(mk("path", { d: "M0,0 L10,5 L0,10 Z", fill: pal.arrow }));
  d.appendChild(m);
  svg.appendChild(d);
  svg.appendChild(
    mk("rect", { x: vx, y: vy, width: W, height: H, fill: pal.bg }),
  );
  // frames (behind everything)
  for (const f of state.frames) drawFrameExport(svg, f);
  // edges
  for (const e of state.edges) {
    const ep = edgeEndpoints(e);
    if (!ep) continue;
    const { a, b: bb } = ep;
    const ln = mk("line", {
      x1: a.x,
      y1: a.y,
      x2: bb.x,
      y2: bb.y,
      stroke: pal.arrow,
      "stroke-width": 1.8,
    });
    ln.setAttribute("marker-end", "url(#arrow)");
    if (e.both) ln.setAttribute("marker-start", "url(#arrow)");
    svg.appendChild(ln);
  }
  // nodes
  for (const n of state.nodes) {
    const box = nodeBox(n);
    const g = mk("g", { transform: `translate(${n.x} ${n.y})` });
    buildGlyph(n.category, { resolved: true }).forEach((el) =>
      g.appendChild(el),
    );
    box.lines.forEach((ln, i) => {
      const t = mk("text", {
        x: 0,
        y: box.labelTop + i * LINE_H,
        "text-anchor": "middle",
        "font-family": FONT,
        "font-size": "12.5",
        "font-weight": "600",
        fill: pal.ink,
      });
      t.textContent = ln;
      g.appendChild(t);
    });
    if (n.status) {
      const sd = STATUS_DEFS.find((s) => s.key === n.status);
      if (sd) {
        g.appendChild(
          mk("circle", {
            cx: -box.halfW + 3,
            cy: box.top + 3,
            r: 5,
            fill: sd.color,
            stroke: pal.bg,
            "stroke-width": 1.5,
          }),
        );
      }
    }
    svg.appendChild(g);
  }
  // legend
  const legendGroup = showLeg ? drawLegend(svg, legX, legY, L, pal) : null;
  return { svgEl: svg, W, H, legX, legY, L, legendGroup, showLeg };
}
function rasterize(scale, opts) {
  return new Promise((res, rej) => {
    const out = buildExportSVG(opts);
    if (!out) {
      rej("vazio");
      return;
    }
    const pal = EXPORT_THEME[opts && opts.theme === "dark" ? "dark" : "light"];
    const svgStr = new XMLSerializer().serializeToString(out.svgEl);
    const blob = new Blob([svgStr], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = out.W * scale;
      cv.height = out.H * scale;
      const ctx = cv.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, out.W, out.H);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      res({ canvas: cv, W: out.W, H: out.H });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej("img");
    };
    img.src = url;
  });
}

/* ---------------- pré-visualização interativa (PNG/PDF): legenda arrastável + tema ---------------- */
const exportPreviewOverlay = document.getElementById("export-preview-overlay");
const exportPreviewTitle = document.getElementById("export-preview-title");
const exportPreviewBody = document.getElementById("export-preview-body");
const exportLegendSelect = document.getElementById("export-legend-select");
const exportThemeSelect = document.getElementById("export-theme-select");
const exportPreviewHint = document.getElementById("export-preview-hint");
const exportPreviewCancel = document.getElementById("export-preview-cancel");
const exportPreviewClose = document.getElementById("export-preview-close");
const exportPreviewConfirm = document.getElementById("export-preview-confirm");
let exportKind = null; // "png" | "pdf"
let exportLegendXY = null; // {x,y} em coordenadas do SVG de exportação, ou null = posição automática

function exportOpts() {
  return {
    theme: exportThemeSelect.value === "dark" ? "dark" : "light",
    legendShow: exportLegendSelect.value !== "hide",
    legendXY: exportLegendXY,
  };
}
function attachLegendDrag(svg, legendGroup) {
  if (!legendGroup) return;
  let dragging = null;
  const toSvgPoint = (clientX, clientY) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  legendGroup.addEventListener("pointerdown", (ev) => {
    const start = toSvgPoint(ev.clientX, ev.clientY);
    dragging = { startX: start.x, startY: start.y, lx0: exportLegendXY ? exportLegendXY.x : 0, ly0: exportLegendXY ? exportLegendXY.y : 0 };
    legendGroup.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  legendGroup.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const p = toSvgPoint(ev.clientX, ev.clientY);
    const nx = dragging.lx0 + (p.x - dragging.startX);
    const ny = dragging.ly0 + (p.y - dragging.startY);
    legendGroup.setAttribute("transform", `translate(${nx} ${ny})`);
    exportLegendXY = { x: nx, y: ny };
  });
  function endDrag(ev) {
    if (!dragging) return;
    dragging = null;
    try {
      legendGroup.releasePointerCapture(ev.pointerId);
    } catch (e) {}
    renderExportPreview(); // reconstrói o SVG para reenquadrar o canvas com a legenda na nova posição
  }
  legendGroup.addEventListener("pointerup", endDrag);
  legendGroup.addEventListener("pointercancel", endDrag);
}
function renderExportPreview() {
  const out = buildExportSVG(exportOpts());
  exportPreviewBody.textContent = "";
  if (!out) return;
  exportPreviewBody.appendChild(out.svgEl);
  if (out.legendGroup) {
    // grava a posição efetiva (padrão ou arrastada) para a próxima interação
    exportLegendXY = { x: out.legX, y: out.legY };
    attachLegendDrag(out.svgEl, out.legendGroup);
  }
  exportPreviewHint.hidden = !out.showLeg;
}
function openExportPreview(kind) {
  if (!state.nodes.length) {
    toast("Adicione itens primeiro");
    return;
  }
  exportKind = kind;
  exportPreviewTitle.textContent =
    "Pré-visualização — " + (kind === "pdf" ? "PDF" : "PNG");
  exportLegendSelect.value = state.legendPos.show ? "show" : "hide";
  exportThemeSelect.value =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  exportLegendXY =
    state.legendPos.x != null && state.legendPos.y != null
      ? { x: state.legendPos.x, y: state.legendPos.y }
      : null;
  renderExportPreview();
  exportPreviewOverlay.hidden = false;
}
function closeExportPreview() {
  exportPreviewOverlay.hidden = true;
  exportPreviewBody.textContent = "";
}
exportLegendSelect.addEventListener("change", () => {
  exportLegendXY = null; // volta para a posição automática ao alternar a legenda
  renderExportPreview();
});
exportThemeSelect.addEventListener("change", renderExportPreview);
exportPreviewCancel.addEventListener("click", closeExportPreview);
exportPreviewClose.addEventListener("click", closeExportPreview);
exportPreviewOverlay.addEventListener("click", (ev) => {
  if (ev.target === exportPreviewOverlay) closeExportPreview();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !exportPreviewOverlay.hidden) {
    ev.preventDefault();
    closeExportPreview();
  }
});
exportPreviewConfirm.addEventListener("click", async () => {
  const opts = exportOpts();
  state.legendPos = {
    show: opts.legendShow,
    x: opts.legendXY ? opts.legendXY.x : null,
    y: opts.legendXY ? opts.legendXY.y : null,
  };
  autosave();
  try {
    const { canvas, W, H } = await rasterize(2.5, opts);
    if (exportKind === "png") {
      canvas.toBlob((bl) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(bl);
        a.download = "cluster-de-site.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("PNG exportado");
      });
    } else {
      const img = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const landscape = W >= H;
      const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });
      const pw = pdf.internal.pageSize.getWidth(),
        ph = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const aw = pw - margin * 2,
        ah = ph - margin * 2;
      const r = Math.min(aw / W, ah / H);
      const dw = W * r,
        dh = H * r;
      pdf.addImage(img, "PNG", (pw - dw) / 2, (ph - dh) / 2, dw, dh);
      pdf.save("cluster-de-site.pdf");
      toast("PDF exportado");
    }
    closeExportPreview();
  } catch (e) {
    toast("Falha ao exportar " + (exportKind === "pdf" ? "PDF" : "PNG"));
  }
});
document.getElementById("btn-png").addEventListener("click", () => {
  closeExportMenu();
  openExportPreview("png");
});
document.getElementById("btn-pdf").addEventListener("click", () => {
  closeExportMenu();
  openExportPreview("pdf");
});

/* ---------------- save / load ---------------- */
function snapshot() {
  return JSON.stringify({
    nodes: state.nodes,
    edges: state.edges,
    frames: state.frames,
    view,
    catDesc: state.catDesc,
    legendPos: state.legendPos,
  });
}
async function persist() {
  try {
    if (window.storage)
      await window.storage.set("cluster:auto:v2", snapshot(), false);
  } catch (e) {}
  pushRemote();
}
async function autosave() {
  pushHistory();
  await persist();
}
async function loadAuto() {
  try {
    if (window.storage) {
      const r = await window.storage.get("cluster:auto:v2");
      if (r && r.value) {
        apply(JSON.parse(r.value));
        return true;
      }
    }
  } catch (e) {}
  return false;
}
function syncControls() {
  const keys = Object.keys(CATS);
  document.querySelectorAll("#palette .pal-desc").forEach((inp, i) => {
    const k = keys[i];
    if (k) inp.value = getDesc(k);
  });
  const nd = document.querySelector("#palette-group .pal-desc");
  if (nd) nd.value = getDesc("nucleo");
}
function apply(data) {
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  state.frames = data.frames || [];
  state.catDesc = Object.assign({ ...DEFAULT_DESC }, data.catDesc || {});
  state.legendPos = normalizeLegendPos(data.legendPos);
  if (data.view) view = data.view;
  let max = 0;
  [...state.nodes, ...state.frames].forEach((o) => {
    const m = parseInt(String(o.id).replace(/\D/g, "")) || 0;
    if (m > max) max = m;
  });
  uid = max + 1;
  syncControls();
  render();
  updateZoomLabel();
}
document.getElementById("btn-json").onclick = () => {
  const bl = new Blob([snapshot()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(bl);
  a.download = "cluster-de-site.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("JSON baixado");
};

/* ---------------- exportar lista (Markdown / CSV) ---------------- */
function nodeFrameName(n) {
  const f = state.frames.find((fr) => nodesInFrame(fr).some((x) => x.id === n.id));
  return f ? f.name : "";
}
function nodeConnections(n) {
  const names = [];
  state.edges.forEach((e) => {
    if (e.from === n.id) {
      const t = byId(e.to) || byFrame(e.to);
      if (t) names.push(t.name);
    } else if (e.to === n.id) {
      const t = byId(e.from) || byFrame(e.from);
      if (t) names.push(t.name);
    }
  });
  return names;
}
function pushNodeMd(lines, n) {
  const cat = CATS[n.category] ? CATS[n.category].label : n.category;
  let head = "- **" + n.name + "** — " + cat;
  const sd = STATUS_DEFS.find((s) => s.key === n.status);
  if (sd) head += " — " + sd.label;
  lines.push(head);
  const conns = nodeConnections(n);
  if (conns.length) lines.push("  - Conecta com: " + conns.join(", "));
  if (n.note) lines.push("  - Nota: " + n.note.replace(/\n/g, " "));
}
function buildOutlineMarkdown() {
  const lines = ["# Lista de páginas — Construtor de Cluster de Site", ""];
  const loose = state.nodes.filter((n) => !nodeFrameName(n));
  if (loose.length) {
    lines.push("## Páginas soltas");
    loose.forEach((n) => pushNodeMd(lines, n));
    lines.push("");
  }
  state.frames.forEach((f) => {
    const members = nodesInFrame(f);
    if (!members.length && !f.note) return;
    const label = /^núcleo/i.test(f.name) ? f.name : "Núcleo: " + f.name;
    lines.push("## " + label);
    if (f.note) lines.push("_Nota: " + f.note.replace(/\n/g, " ") + "_");
    members.forEach((n) => pushNodeMd(lines, n));
    lines.push("");
  });
  return lines.join("\n");
}
function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function buildOutlineCSV() {
  const rows = [["Tipo", "Nome", "Núcleo", "Status", "Nota", "Conecta com"]];
  state.nodes.forEach((n) => {
    const cat = CATS[n.category] ? CATS[n.category].label : n.category;
    const sd = STATUS_DEFS.find((s) => s.key === n.status);
    rows.push([
      cat,
      n.name,
      nodeFrameName(n),
      sd ? sd.label : "",
      n.note || "",
      nodeConnections(n).join("; "),
    ]);
  });
  state.frames.forEach((f) => {
    rows.push(["Núcleo", f.name, "", "", f.note || "", nodeConnections(f).join("; ")]);
  });
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
document.getElementById("btn-md").onclick = () => {
  if (!state.nodes.length) {
    toast("Adicione itens primeiro");
    return;
  }
  const bl = new Blob([buildOutlineMarkdown()], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(bl);
  a.download = "cluster-de-site.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Markdown exportado");
};
document.getElementById("btn-csv").onclick = () => {
  if (!state.nodes.length) {
    toast("Adicione itens primeiro");
    return;
  }
  const bl = new Blob(["\ufeff" + buildOutlineCSV()], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(bl);
  a.download = "cluster-de-site.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("CSV exportado");
};
document.getElementById("file-json").onchange = (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      apply(JSON.parse(rd.result));
      fit();
      toast("Projeto aberto");
    } catch (e) {
      toast("Arquivo inválido");
    }
  };
  rd.readAsText(f);
  ev.target.value = "";
};

/* ---------------- colaboração em tempo real (Firebase) ----------------
   Passo a passo para ativar (gratuito), com login obrigatório e lista de
   e-mails permitidos:
   1. Crie um projeto em https://console.firebase.google.com
   2. No menu lateral, abra "Realtime Database" e clique em "Criar banco
      de dados" (pode escolher "modo de teste" para começar — as regras do
      passo 5 substituem isso).
   3. No menu lateral, abra "Authentication" → aba "Sign-in method" →
      ative o provedor "Google".
   4. Ainda em "Authentication" → aba "Settings" → "Authorized domains",
      adicione o domínio onde o app vai rodar (ex.: seuusuario.github.io).
      Sem isso o login com popup falha silenciosamente.
   5. Em "Configurações do projeto" (ícone de engrenagem) → aba "Geral" →
      role até "Seus aplicativos" → clique no ícone Web (</>) e registre
      um app. Copie o objeto `firebaseConfig` que aparece e cole em
      "firebase-config.js" (copie firebase-config.example.js com esse nome
      primeiro — esse arquivo fica fora do git, então as credenciais não
      são versionadas).
   6. Em "Realtime Database" → aba "Regras", cole (troque os e-mails pelos
      das pessoas autorizadas — duplique a linha `auth.token.email == ...`
      para cada uma):
        {
          "rules": {
            "clusters": {
              "$room": {
                ".read": "auth != null && (auth.token.email == 'pessoa1@empresa.com' || auth.token.email == 'pessoa2@empresa.com')",
                ".write": "auth != null && (auth.token.email == 'pessoa1@empresa.com' || auth.token.email == 'pessoa2@empresa.com')"
              }
            }
          }
        }
      Isso bloqueia leitura E escrita para qualquer pessoa que não esteja
      logada com um dos e-mails da lista — mesmo tendo o link. Para
      adicionar/remover alguém, edite essa lista aqui nas regras.
   7. Publique o index.html no GitHub Pages. Quem abrir o mesmo link (mesmo
      parâmetro ?room=) precisa clicar em "Entrar com Google" (menu de
      configurações) com um e-mail autorizado para ver ou editar o quadro.
      Use o botão "Compartilhar" para copiar o link certo.
*/
/* `firebaseConfig` é definido em firebase-config.js (carregado antes deste
   arquivo no index.html), que fica fora do git — veja o passo 5 acima. */
let roomId = new URLSearchParams(location.search).get("room") || "geral";
let collabRef = null;
let presenceListRef = null;
let applyingRemote = false;
let hasSyncedOnce = false;
let pushTimer = null;
let lastSyncedJSON = null;
let permissionShown = false;

/* ---------------- presença / cursores ao vivo ---------------- */
const CURSOR_COLORS = [
  "#e11d48",
  "#2447d6",
  "#0d9488",
  "#b45309",
  "#7c3aed",
  "#0369a1",
  "#15803d",
  "#c026d3",
];
const clientId = Math.random().toString(36).slice(2);
let clientColor =
  localStorage.getItem("cluster:cursor-color") ||
  CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
localStorage.setItem("cluster:cursor-color", clientColor);
function randomName() {
  return "Visitante " + Math.floor(1000 + Math.random() * 9000);
}
let clientName = localStorage.getItem("cluster:name") || randomName();
localStorage.setItem("cluster:name", clientName);
let presenceRef = null;
let cursorTimer = null;
const remoteCursors = {}; // clientId -> {name,color,x,y,t}
const STALE_MS = 12000;

function renderCursors() {
  cursorLayer.textContent = "";
  const now = Date.now();
  for (const id in remoteCursors) {
    const c = remoteCursors[id];
    if (now - c.t > STALE_MS) continue;
    const g = mk("g", { transform: `translate(${c.x} ${c.y})` });
    g.appendChild(
      mk("path", {
        d: "M0,0 L0,15.5 L4.2,12 L7,17.5 L9.6,16.2 L6.8,10.8 L11.5,10.8 Z",
        fill: c.color,
        stroke: "#fff",
        "stroke-width": 1.4,
        "stroke-linejoin": "round",
      }),
    );
    mctx.font = "600 11px " + FONT;
    const tw = mctx.measureText(c.name).width;
    g.appendChild(
      mk("rect", {
        x: 13,
        y: -2,
        width: tw + 12,
        height: 18,
        rx: 9,
        fill: c.color,
      }),
    );
    const t = mk("text", {
      class: "cursor-label",
      x: 19,
      y: 11,
      "font-family": FONT,
      "font-size": "11",
      "font-weight": "600",
      fill: "#fff",
    });
    t.textContent = c.name;
    g.appendChild(t);
    cursorLayer.appendChild(g);
  }
}
function broadcastCursor(x, y) {
  if (!presenceRef) return;
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    if (!presenceRef) return;
    presenceRef
      .update({ name: clientName, color: clientColor, x, y, t: Date.now() })
      .catch(() => {});
  }, 60);
}
stage.addEventListener("pointermove", (ev) => {
  if (!presenceRef) return;
  const w = toWorld(ev.clientX, ev.clientY);
  broadcastCursor(Math.round(w.x), Math.round(w.y));
});
stage.addEventListener("pointerleave", () => {
  if (presenceRef) presenceRef.remove();
});
const nameInput = document.getElementById("collab-name");
nameInput.value = clientName;
nameInput.addEventListener("change", () => {
  clientName = nameInput.value.trim() || randomName();
  localStorage.setItem("cluster:name", clientName);
  if (presenceRef)
    presenceRef
      .update({ name: clientName, color: clientColor })
      .catch(() => {});
});

function setCollabStatus(status) {
  const dot = document.getElementById("collab-dot");
  if (!dot) return;
  const colors = {
    on: "#15803d",
    off: "#cbd0dc",
    err: "#b45309",
    signedout: "#8a90a4",
    denied: "#dc2626",
  };
  const titles = {
    on: "Colaboração ativa (sala: " + roomId + ")",
    off: "Sem conexão com a sala de colaboração",
    err: "Colaboração não configurada — edite mapa mental/firebase-config.js",
    signedout: "Faça login com Google (menu de configurações) para colaborar",
    denied: "Seu e-mail não tem permissão para este quadro",
  };
  dot.style.background = colors[status] || colors.off;
  dot.title = titles[status] || titles.off;
}

const denyOverlay = document.getElementById("denied-overlay");
document.getElementById("denied-leave").addEventListener("click", leaveRoom);

function handlePermissionDenied() {
  if (permissionShown) return;
  permissionShown = true;
  setCollabStatus("denied");
  const user = firebase.auth().currentUser;
  document.getElementById("denied-email").textContent = user ? user.email : "";
  document.getElementById("denied-room").textContent = roomId;
  denyOverlay.hidden = false;
}

async function migrateLegacyBoard(roomRef, boardRef) {
  // versões antigas guardavam nodes/edges/frames direto na raiz da sala,
  // no mesmo nível de _presence — isso fazia a presença (atualizada a
  // cada movimento do mouse) disparar o listener "value" do quadro
  // inteiro e sobrescrever posições recém-arrastadas. Migra uma vez para
  // "board", que fica isolado de _presence.
  try {
    const boardSnap = await boardRef.once("value");
    if (boardSnap.exists()) return;
    const roomSnap = await roomRef.once("value");
    const data = roomSnap.val();
    if (!data) return;
    const legacy = { ...data };
    delete legacy._presence;
    delete legacy.board;
    if (Object.keys(legacy).length === 0) return;
    await boardRef.set(legacy);
    await roomRef.update({
      nodes: null,
      edges: null,
      frames: null,
      catDesc: null,
      legendPos: null,
      view: null,
    });
  } catch (e) {}
}
async function connectCollab() {
  permissionShown = false;
  const db = firebase.database();
  const roomRef = db.ref("clusters/" + roomId);
  collabRef = roomRef.child("board");
  presenceListRef = roomRef.child("_presence");
  presenceRef = presenceListRef.child(clientId);
  await migrateLegacyBoard(roomRef, collabRef);
  db.ref(".info/connected").on("value", (snap) => {
    if (permissionShown) return;
    setCollabStatus(snap.val() ? "on" : "off");
    if (snap.val()) {
      presenceRef.onDisconnect().remove();
      presenceRef
        .set({
          name: clientName,
          color: clientColor,
          x: 0,
          y: 0,
          t: Date.now(),
        })
        .catch(handlePermissionDenied);
    }
  });
  presenceListRef.on(
    "value",
    (snap) => {
      const data = snap.val() || {};
      for (const id in remoteCursors)
        if (!(id in data)) delete remoteCursors[id];
      for (const id in data) {
        if (id === clientId) continue;
        remoteCursors[id] = data[id];
      }
      renderCursors();
    },
    handlePermissionDenied,
  );
  collabRef.on(
    "value",
    (snap) => {
      const data = snap.val();
      if (data == null) {
        pushRemote(true);
        return;
      }
      const json = JSON.stringify(data);
      if (json === lastSyncedJSON) return;
      lastSyncedJSON = json;
      const myView = { ...view };
      applyingRemote = true;
      apply(data);
      if (hasSyncedOnce) {
        view = myView;
        render();
      } else {
        fit();
      }
      hasSyncedOnce = true;
      applyingRemote = false;
    },
    handlePermissionDenied,
  );
}

function disconnectCollab() {
  firebase.database().ref(".info/connected").off();
  if (collabRef) {
    collabRef.off();
    collabRef = null;
  }
  if (presenceListRef) {
    presenceListRef.off();
    presenceListRef = null;
  }
  if (presenceRef) {
    try {
      presenceRef.remove();
    } catch (e) {}
    presenceRef = null;
  }
  for (const id in remoteCursors) delete remoteCursors[id];
  renderCursors();
  hasSyncedOnce = false;
  lastSyncedJSON = null;
  setCollabStatus("signedout");
  denyOverlay.hidden = true;
}

function pushRemote(force) {
  if (!collabRef || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(
    () => {
      if (!collabRef) return;
      const json = snapshot();
      if (!force && json === lastSyncedJSON) return;
      lastSyncedJSON = json;
      collabRef.set(JSON.parse(json)).catch(handlePermissionDenied);
    },
    force ? 0 : 300,
  );
}

/* ---------------- compartilhar (popup para escolher a sala) ---------------- */
const shareOverlay = document.getElementById("share-overlay");
const shareRoomInput = document.getElementById("share-room-input");
const shareCloseBtn = document.getElementById("share-close");
const shareCancelBtn = document.getElementById("share-cancel");
const shareCopyBtn = document.getElementById("share-copy");

function slugifyRoom(raw) {
  const slug = raw
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "geral";
}

function updateRoomUI() {
  const isCustomRoom = roomId !== "geral";
  document.getElementById("room-sec-title").hidden = !isCustomRoom;
  document.getElementById("room-row").hidden = !isCustomRoom;
  document.getElementById("room-name-label").textContent = roomId;
}

function switchRoom(newRoom) {
  if (newRoom === roomId) return;
  const wasConnected = !!collabRef;
  if (wasConnected) disconnectCollab();
  roomId = newRoom;
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState(null, "", url);
  updateRoomUI();
  if (wasConnected) connectCollab();
}

function leaveRoom() {
  closeSettings();
  denyOverlay.hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
  roomId = "geral";
  updateRoomUI();
  // permissão é a mesma lista de e-mails pra qualquer sala (inclusive
  // "geral"), então continuar logado só levaria à mesma tela de bloqueio —
  // sair da sala também desconecta a conta pra voltar ao uso 100% local.
  if (firebase.auth().currentUser) {
    firebase.auth().signOut();
  } else if (collabRef) {
    disconnectCollab();
  }
}
updateRoomUI();

function openShare() {
  closeSettings();
  shareRoomInput.value = roomId;
  shareOverlay.hidden = false;
  shareRoomInput.focus();
  shareRoomInput.select();
}
function closeShare() {
  shareOverlay.hidden = true;
}
document.getElementById("btn-share").addEventListener("click", openShare);
shareCloseBtn.addEventListener("click", closeShare);
shareCancelBtn.addEventListener("click", closeShare);
shareOverlay.addEventListener("click", (ev) => {
  if (ev.target === shareOverlay) closeShare();
});
shareRoomInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    shareCopyBtn.click();
  }
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !shareOverlay.hidden) {
    ev.preventDefault();
    closeShare();
  }
});
shareCopyBtn.addEventListener("click", async () => {
  const room = slugifyRoom(shareRoomInput.value);
  switchRoom(room);
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Link copiado — envie para colaborar");
  } catch (e) {
    toast(url.toString());
  }
  closeShare();
});

/* ---------------- tema (claro / escuro / sistema) ---------------- */
const THEME_KEY = "cluster:theme";
const systemDarkMQ = window.matchMedia("(prefers-color-scheme: dark)");
function currentThemeChoice() {
  return localStorage.getItem(THEME_KEY) || "system";
}
function applyTheme(choice) {
  const dark =
    choice === "dark" || (choice === "system" && systemDarkMQ.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelectorAll(".theme-opt").forEach((b) => {
    b.classList.toggle("active", b.dataset.themeChoice === choice);
  });
}
function setTheme(choice) {
  localStorage.setItem(THEME_KEY, choice);
  applyTheme(choice);
}
document.querySelectorAll(".theme-opt").forEach((b) => {
  b.addEventListener("click", () => setTheme(b.dataset.themeChoice));
});
systemDarkMQ.addEventListener("change", () => {
  if (currentThemeChoice() === "system") applyTheme("system");
});
applyTheme(currentThemeChoice());

/* ---------------- painel de configurações ---------------- */
const settingsBtn = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
function closeSettings() {
  settingsPanel.setAttribute("hidden", "");
  settingsBtn.setAttribute("aria-expanded", "false");
}
settingsBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const willOpen = settingsPanel.hasAttribute("hidden");
  if (willOpen) {
    // fecha o painel de página/núcleo selecionado — os dois flutuam no
    // mesmo canto e ficam ilegíveis um por cima do outro
    multiSel.clear();
    select(null);
    settingsPanel.removeAttribute("hidden");
    settingsBtn.setAttribute("aria-expanded", "true");
  } else {
    closeSettings();
  }
});
document.addEventListener("click", (ev) => {
  if (
    !settingsPanel.hasAttribute("hidden") &&
    !ev.target.closest(".settings-wrap")
  ) {
    closeSettings();
  }
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !settingsPanel.hasAttribute("hidden")) {
    closeSettings();
  }
});

/* ---------------- menu "Exportar" (arquivo/PNG/PDF, fora do perfil) ---------------- */
const exportBtn = document.getElementById("btn-export");
const exportPanel = document.getElementById("export-panel");
function closeExportMenu() {
  exportPanel.setAttribute("hidden", "");
  exportBtn.setAttribute("aria-expanded", "false");
}
exportBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const willOpen = exportPanel.hasAttribute("hidden");
  if (willOpen) {
    exportPanel.removeAttribute("hidden");
    exportBtn.setAttribute("aria-expanded", "true");
  } else {
    closeExportMenu();
  }
});
document.addEventListener("click", (ev) => {
  if (
    !exportPanel.hasAttribute("hidden") &&
    !ev.target.closest(".export-wrap")
  ) {
    closeExportMenu();
  }
});
document.querySelector("#export-panel .export-row").addEventListener("click", (ev) => {
  if (ev.target.closest("button")) closeExportMenu();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !exportPanel.hasAttribute("hidden")) {
    closeExportMenu();
  }
});

/* ---------------- conta Google + login obrigatório (Firebase Auth) ----------------
   O login aqui não é só decorativo: enquanto ninguém estiver autenticado,
   nenhuma leitura/escrita no quadro compartilhado acontece (veja as regras
   do Realtime Database no comentário lá em cima, seção "colaboração em
   tempo real"). Sem Firebase configurado, o app segue funcionando 100%
   local, sem exigir login.
*/
function showAccount(profile) {
  document.getElementById("account-signed-out").hidden = true;
  document.getElementById("account-signed-in").hidden = false;
  document.getElementById("account-name").textContent = profile.name || "";
  document.getElementById("account-email").textContent = profile.email || "";
  document.getElementById("account-avatar").src = profile.picture || "";
  const avatarBtn = document.getElementById("settings-avatar");
  avatarBtn.src = profile.picture || "";
  avatarBtn.hidden = false;
  document.getElementById("profile-icon-default").style.display = "none";
  if (/^Visitante \d+$/.test(clientName) && profile.name) {
    clientName = profile.name;
    localStorage.setItem("cluster:name", clientName);
    nameInput.value = clientName;
    if (presenceRef)
      presenceRef
        .update({ name: clientName, color: clientColor })
        .catch(() => {});
  }
}
function clearAccount() {
  document.getElementById("account-signed-out").hidden = false;
  document.getElementById("account-signed-in").hidden = true;
  const avatarBtn = document.getElementById("settings-avatar");
  avatarBtn.hidden = true;
  avatarBtn.src = "";
  document.getElementById("profile-icon-default").style.display = "";
}
document.getElementById("btn-google-signin").addEventListener("click", () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase
    .auth()
    .signInWithPopup(provider)
    .catch((e) => {
      toast("Falha ao entrar: " + (e && e.code ? e.code : "tente de novo"));
    });
});
document.getElementById("btn-signout").addEventListener("click", () => {
  firebase.auth().signOut();
});
document.getElementById("btn-leave-room").addEventListener("click", leaveRoom);
function initFirebase() {
  const signinBtn = document.getElementById("btn-google-signin");
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "SUA_API_KEY") {
    setCollabStatus("err");
    if (signinBtn) signinBtn.disabled = true;
    return;
  }
  document.getElementById("google-config-hint").hidden = true;
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {}
  setCollabStatus("signedout");
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      showAccount({
        name: user.displayName,
        email: user.email,
        picture: user.photoURL,
      });
      connectCollab();
    } else {
      clearAccount();
      disconnectCollab();
    }
  });
}

/* ---------------- example: 4 thematic nuclei (from the planning doc) ---------------- */
function exampleData() {
  const nodes = [],
    edges = [],
    frames = [];
  const E = (from, to, both) =>
    edges.push({ id: newId(), from, to, both: !!both });
  // top: money + pilar
  const money = {
    id: "money",
    name: "Aqui é a money page",
    category: "money",
    x: 0,
    y: 0,
  };
  const pilar = {
    id: "pilar",
    name: "Aqui vai ser a página Pilar",
    category: "pilar",
    x: 0,
    y: 170,
  };
  nodes.push(money, pilar);
  E("pilar", "money", true);

  const FW = 380,
    STEP = 120,
    GAP = 70,
    TOP = 360;
  const nuclei = [
    {
      name: "Núcleo: Agrupamento de páginas",
      cat: "Página categoria do núcleo",
      sats: ["Página Satelite 1", "Página Satelite 2"],
    },
    ,
  ];
  // center the row of frames around x = 0
  const totalW = nuclei.length * FW + (nuclei.length - 1) * GAP;
  let fx = -totalW / 2;
  nuclei.forEach((nu, i) => {
    const h = 150 + nu.sats.length * STEP + 30;
    const fid = newId();
    frames.push({
      id: fid,
      name: nu.name,
      x: fx,
      y: TOP,
      w: FW,
      h,
      color: NUC_COLORS[i % NUC_COLORS.length],
    });
    const cx = fx + FW / 2;
    const catId = newId();
    nodes.push({
      id: catId,
      name: nu.cat,
      category: "categoria",
      x: cx,
      y: TOP + 64,
    });
    E("pilar", catId, false);
    nu.sats.forEach((s, j) => {
      const sid = newId();
      nodes.push({
        id: sid,
        name: s,
        category: "satelite",
        x: cx,
        y: TOP + 150 + j * STEP,
      });
      E(catId, sid, false);
    });
    fx += FW + GAP;
  });
  return { nodes, edges, frames };
}
function loadExample() {
  uid = 1;
  const d = exampleData();
  state.nodes = d.nodes;
  state.edges = d.edges;
  state.frames = d.frames;
  let max = 0;
  [...state.nodes, ...state.frames].forEach((o) => {
    const m = parseInt(String(o.id).replace(/\D/g, "")) || 0;
    if (m > max) max = m;
  });
  uid = max + 1;
  render();
  fit();
  autosave();
}
document.getElementById("btn-example").onclick = () => {
  confirmAction(
    "Isso substitui o conteúdo atual do quadro pelo exemplo. Deseja continuar?",
    () => {
      loadExample();
      toast("Exemplo carregado");
    },
  );
};
document.getElementById("btn-clear").onclick = () => {
  confirmAction(
    "Isso apaga todas as páginas e núcleos do quadro atual. Deseja continuar?",
    () => {
      state.nodes = [];
      state.edges = [];
      state.frames = [];
      select(null);
      autosave();
      toast("Quadro limpo");
    },
  );
};

/* ---------------- boot ---------------- */
(async function () {
  const had = await loadAuto();
  if (!had || !state.nodes.length) {
    loadExample();
  } else {
    render();
    fit();
  }
  initFirebase();
})();
window.addEventListener("resize", () => render());
