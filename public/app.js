// Airbag dashboard. Polls /api/status every 1.5 s and draws everything with plain DOM + SVG.
// All text from the server goes in with textContent (never innerHTML).
const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;
let S = null;            // last /api/status
let replay = null;       // /api/replay
const drawn = { log: "", stream: "", odds: "", width: 0 };

// ------------------------------------------------------------------ formatting
const pct = (x) => (x == null ? "–" : x > 0 && x < 0.001 ? "<0.1%" : x < 0.1 ? `${+(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);
const usd = (x) => (x == null ? "–" : `$${Math.round(x).toLocaleString("en-US")}`);
const usdK = (x) => `$${Math.round(x / 1000)}K`;
const usdc = (x, d = 2) => (x == null ? "–" : `${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} USDC`);
const btc = (x) => (x == null ? "–" : `${+x.toFixed(8)} cirBTC`);
const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour12: false });
const hhmm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
const ago = (t) => {
  const s = Math.max(0, Math.round(((S?.now ?? Date.now()) - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const dayET = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const dayUTC = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const BANDS = [[1.2, "SAFE", "good"], [1.1, "WARN", "warning"], [1.05, "URGENT", "serious"], [1.0, "IMMINENT", "critical"], [-Infinity, "LIQUIDATABLE", "critical"]];
const bandOf = (h) => BANDS.find(([min]) => h >= min);
const bandClass = (name) => (BANDS.find((b) => b[1] === name) ?? [0, 0, ""])[2];

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
const SVG = "http://www.w3.org/2000/svg";
function sv(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
const txLinks = (txs) => {
  if (!txs?.length) return null;
  const box = el("div", { class: "txs" });
  for (const t of txs) box.append(t.url ? el("a", { href: t.url, target: "_blank", rel: "noopener", text: `${t.label} ↗` }) : el("span", { class: "muted", text: t.label }));
  return box;
};

// ------------------------------------------------------------------ polling
async function poll() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    S = await res.json();
    render();
    setupPublicDemo();
  } catch (e) {
    $("bot-badge").className = "badge bad";
    $("bot-text").textContent = `server unreachable (${e.message})`;
  } finally {
    setTimeout(poll, POLL_MS);
  }
}

async function loadReplay() {
  try {
    const res = await fetch("/api/replay", { cache: "no-store" });
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    replay = await res.json();
    renderReplay();
  } catch (e) {
    $("replay-lede").textContent = `Replay not available: ${e.message}`;
  }
}

// ------------------------------------------------------------------ render
let lastZone = null;
function render() {
  const s = S;
  const r = s.reading;

  // badges
  const mb = $("mode-badge");
  mb.textContent = s.mode === "live" ? `Live · Arc Testnet${s.dryRun ? " · dry run" : ""}` : `Simulated Arc · live Gemini odds${s.dryRun ? " · dry run" : ""}`;
  mb.className = `badge ${s.mode === "live" ? "live" : ""}`;
  const bb = $("bot-badge");
  let botText, botClass;
  if (s.bot.lastError) { botText = `error: ${s.bot.lastError.message}`; botClass = "bad"; }
  else if (s.paused) { botText = "paused (reads, but will not move money)"; botClass = ""; }
  else if (s.bot.cooldownLeftMs > 0) { botText = "just acted · re-reading the loan"; botClass = "busy"; }
  else if (s.bot.busy) { botText = "checking…"; botClass = "busy"; }
  else { botText = `watching · checked ${s.bot.lastTick ? ago(s.bot.lastTick) : "…"}`; botClass = "ok"; }
  const w = s.bot.lastWake;
  if (w && w.reason !== "timer" && s.now - w.at < 120_000) botText += ` · woken by ${w.reason}`;
  bb.className = `badge ${botClass}`;
  $("bot-text").textContent = botText;

  renderHero(s, r);
  renderTiles(s, r);
  renderLog(s);
  renderStream(s);
  renderOdds(s);

  // price note + footer
  const pn = $("price-note");
  if (r && r.loan.oraclePrice && r.spot && Math.abs(r.loan.oraclePrice - r.spot) / r.spot > 0.02 && r.priceSource === "real")
    pn.textContent = `On Arc Testnet the lending market prices cirBTC at a fixed ${usd(r.loan.oraclePrice)}, while bitcoin trades at ${usd(r.spot)}. Airbag values the collateral at the live price from Gemini, as a mainnet price feed would, so the line and the odds match the real market. Borrow Kit's own health number is shown under Health.`;
  else pn.textContent = r ? `Collateral is valued at ${usd(r.priceUsed)} (${r.priceSource === "real" ? "live BTC price from Gemini" : "the lending market's price"}).` : "";
  const fw = $("foot-wallet");
  fw.replaceChildren();
  if (s.explorer && s.wallet?.address)
    fw.append("Bot wallet ", el("a", { href: `${s.explorer}/address/${s.wallet.address}`, target: "_blank", rel: "noopener", text: `${s.wallet.address.slice(0, 6)}…${s.wallet.address.slice(-4)}` }),
      s.wallet.usdc != null ? ` · ${usdc(s.wallet.usdc)} in the wallet for gas and demos` : "");
  else fw.textContent = s.mode === "sim" ? "Simulated wallet (no real transactions)." : "";
  syncDemoButtons();
}

function renderHero(s, r) {
  const hero = $("hero"), fig = $("hero-odds"), text = $("hero-text"), pill = $("hero-pill"), meter = $("meter");
  const src = $("hero-source"), note = $("hero-note");
  if (!r) {
    hero.className = "card hero";
    fig.textContent = "–";
    text.textContent = s.bot.noLoan ? "no loan to protect yet" : s.bot.syncing ? "Borrow Kit is updating the loan…" : "reading the loan…";
    pill.className = "pill"; $("hero-pill-icon").textContent = ""; $("hero-pill-text").textContent = s.bot.noLoan ? "Open one with npm run loan:open" : "Waiting for data";
    meter.style.visibility = "hidden";
    src.textContent = ""; note.textContent = s.bot.geminiError ? `Gemini: ${s.bot.geminiError}` : "";
    return;
  }
  const d = r.decision, odds = d.odds, limit = s.limit;
  const ladder = r.ladders.find((l) => l.ticker === r.odds?.ticker) ?? r.ladders[0];
  const overOdds = odds != null && odds > limit;
  const lowHealth = r.health < s.rule.actBelowHealth;
  const zone = overOdds || lowHealth ? "over" : "under";
  hero.className = `card hero ${zone}`;
  fig.textContent = odds == null ? "–" : pct(odds);
  text.textContent = ladder ? `chance you lose your bitcoin by ${dayET(ladder.expiryDate)}` : "chance you lose your bitcoin";
  pill.className = `pill ${zone === "over" ? "critical" : "good"}`;
  $("hero-pill-icon").textContent = zone === "over" ? "▲" : "✓";
  $("hero-pill-text").textContent = overOdds ? `Over your ${pct(limit)} limit` : lowHealth ? `Health under ${s.rule.actBelowHealth.toFixed(2)}` : odds == null ? "Odds unavailable: health rule only" : `Under your ${pct(limit)} limit`;

  // meter: 0 .. 4x the limit, with a tick at the limit
  meter.style.visibility = odds == null ? "hidden" : "visible";
  const max = limit * 4;
  $("meter-fill").style.width = `${Math.min(1, (odds ?? 0) / max) * 100}%`;
  $("meter-limit").style.left = "25%";
  $("meter-limit-label").textContent = `limit ${pct(limit)}`;
  meter.classList.toggle("over", overOdds);
  meter.setAttribute("aria-label", `Odds ${pct(odds)} against a limit of ${pct(limit)}`);

  src.replaceChildren();
  if (ladder) {
    src.append(`Source: Gemini prediction market, live: "${ladder.title}" (${ladder.highestStrike != null ? `bets from ${usd(ladder.lowestStrike)} to ${usd(ladder.highestStrike)}` : ""}). Your limit: ${pct(limit)}.`);
  } else src.textContent = `Gemini odds unavailable${s.bot.geminiError ? ` (${s.bot.geminiError})` : ""}. The bot falls back to the health rule.`;
  const others = r.ladders.filter((l) => l !== ladder && l.odds).map((l) => `by ${dayET(l.expiryDate)}: ${pct(l.odds.odds)}`);
  const how = r.odds?.source === "estimated"
    ? `Your line (${usd(r.line)}) is below Gemini's lowest bet (${usd(ladder?.lowestStrike)}), so this is estimated from the shape of the ladder.`
    : r.odds ? "Read from Gemini's quotes." : "";
  note.textContent = [how, "Doubled because the loan dies if bitcoin dips under the line at any moment, not only on the end date.", others.length ? `Other ladders, ${others.join(", ")}.` : ""].filter(Boolean).join(" ");

  if (zone !== lastZone) {
    $("hero-live").textContent = `Odds ${pct(odds)}, ${zone === "over" ? "over" : "under"} your ${pct(limit)} limit.`;
    lastZone = zone;
  }
}

function renderTiles(s, r) {
  if (!r) {
    for (const id of ["t-debt", "t-line", "t-health", "t-savings"]) $(id).textContent = "–";
    for (const id of ["t-debt-sub", "t-line-sub", "t-health-sub", "t-savings-sub"]) $(id).textContent = "";
    $("t-band").textContent = ""; $("t-band").className = "pill small";
    return;
  }
  const L = r.loan;
  $("t-debt").textContent = usdc(L.debt);
  $("t-debt-sub").textContent = `borrowed against ${btc(L.collateral)}${L.borrowApy != null ? ` at ${(L.borrowApy * 100).toFixed(2)}% a year` : ""}`;
  $("t-line").textContent = usd(r.line);
  $("t-line-sub").textContent = `You lose your bitcoin if BTC falls under ${usd(r.line)}. BTC now: ${usd(r.priceUsed)}.`;
  const [, band, cls] = bandOf(r.health);
  $("t-health").textContent = r.health.toFixed(2);
  const tb = $("t-band");
  tb.textContent = band; tb.className = `pill small ${cls}`;
  const hs = $("t-health-sub");
  hs.replaceChildren(`1.00 means liquidation. The bot acts under ${s.rule.actBelowHealth.toFixed(2)} or when the odds pass your limit.`);
  if (L.healthFactor != null)
    hs.append(el("span", { class: "muted", text: `Borrow Kit on-chain${L.oraclePrice ? ` (cirBTC at ${usd(L.oraclePrice)})` : ""}: ${L.healthFactor.toFixed(2)} ${L.band ?? ""}` }));
  const sv2 = r.savings;
  $("t-savings").textContent = sv2 ? usdc(sv2.balance) : "–";
  const ss = $("t-savings-sub");
  ss.replaceChildren(r.inLoan > 0 ? `${usdc(r.inLoan)} more is inside the loan right now (the bot will give it back when calm).` : "None of it is inside the loan right now.");
  if (sv2) ss.append(el("span", { class: "muted", text: `${sv2.vaultName}${sv2.apy != null ? ` · earning ${(sv2.apy * 100).toFixed(1)}% a year` : ""}` }));
}

function renderLog(s) {
  const key = `${s.log.length}:${s.log[0]?.t}:${s.mode}`;
  if (key === drawn.log) return;
  drawn.log = key;
  const ol = $("log");
  const icon = { action: "●", info: "·", warn: "▲", error: "✕" };
  ol.replaceChildren(...(s.log.length ? s.log.map((e) =>
    el("li", { class: e.level },
      el("time", { datetime: new Date(e.t).toISOString(), text: clock(e.t) }),
      el("div", { class: "msg" }, el("span", { class: "lvl", "aria-hidden": "true", text: icon[e.level] ?? "·" }), e.text, txLinks(e.txs)),
    )) : [el("li", { class: "empty", text: "Nothing yet." })]));
  $("log-meta").textContent = `moved ${usdc(s.movedLast24h)} in the last 24 h (cap ${s.dailyCapUsdc} USDC)`;
}

function renderStream(s) {
  const key = `${s.stream.length}:${s.stream[0]?.t}`;
  if (key === drawn.stream) return;
  drawn.stream = key;
  const ol = $("stream");
  if (!s.stream.length) {
    ol.replaceChildren(el("li", { class: "empty", text: "No Stream events yet. Connect a QuickNode Stream with the filter in stream/filter.js (see the README); every match wakes the bot." }));
    return;
  }
  ol.replaceChildren(...s.stream.map((e) =>
    el("li", {},
      el("time", { datetime: new Date(e.t).toISOString(), text: clock(e.t) }),
      el("div", { class: "msg" }, el("span", { class: "kind", text: e.kind }), e.block != null ? ` · block ${e.block}` : "", e.detail ? ` · ${e.detail}` : "",
        e.tx && s.explorer ? el("div", { class: "txs" }, el("a", { href: `${s.explorer}/tx/${e.tx}`, target: "_blank", rel: "noopener", text: "transaction ↗" })) : null),
    )));
}

// ------------------------------------------------------------------ charts
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function nearestIndex(xs, x) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid; else hi = mid; }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

const tip = $("tooltip");
function showTip(clientX, clientY, title, rows, extra) {
  tip.replaceChildren(el("div", { class: "tt-title", text: title }));
  for (const r of rows) {
    const key = el("span", { class: "tt-key" });
    key.style.background = r.color;
    tip.append(el("div", { class: "tt-row" }, key, el("span", { class: "tt-val", text: r.value }), el("span", { class: "tt-name", text: r.name })));
  }
  if (extra) tip.append(el("div", { class: "tt-title", text: extra }));
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = clientX + pad, y = clientY + pad;
  if (x + w > innerWidth - 8) x = clientX - w - pad;
  if (y + h > innerHeight - 8) y = clientY - h - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => (tip.hidden = true);

/** One-axis line chart. cfg: { xs, series:[{name,color,values}], xDomain, yDomain, yTicks, yFmt, xTicks, xFmt,
 *  refs:[{y,label,color}], markers:[{x,y,color,shape}], labels:[{x,y,text,anchor,dy,strong}], tip:(i)=>({title,rows,extra}), aria, height, padRight } */
function lineChart(host, cfg) {
  const W = Math.max(280, Math.round(host.clientWidth || 600));
  const H = cfg.height ?? 250;
  const m = { l: 52, r: cfg.padRight ?? 18, t: 14, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const [x0, x1] = cfg.xDomain, [y0, y1] = cfg.yDomain;
  const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * iw;
  const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * ih;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": cfg.aria, tabindex: 0 });

  const grid = sv("g", { class: "grid" });
  for (const v of cfg.yTicks) {
    grid.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    grid.append(sv("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, cfg.yFmt(v)));
  }
  svg.append(grid);
  const axis = sv("g", { class: "axis" });
  axis.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(y0), y2: Y(y0) }));
  svg.append(axis);
  for (const v of cfg.xTicks) svg.append(sv("text", { x: X(v), y: H - 8, "text-anchor": "middle" }, cfg.xFmt(v)));

  for (const r of cfg.refs ?? []) {
    svg.append(sv("line", { class: "ref", x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), stroke: r.color }));
    svg.append(sv("text", { class: "label", x: W - m.r, y: Y(r.y) - 5, "text-anchor": "end" }, r.label));
  }
  for (const s of cfg.series) {
    let d = "", pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(cfg.xs[i]).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    if (d) svg.append(sv("path", { class: "series", d, stroke: s.color }));
  }
  for (const mk of cfg.markers ?? []) {
    if (mk.shape === "x") {
      const cx = X(mk.x), cy = Y(mk.y), k = 5;
      svg.append(sv("circle", { cx, cy, r: 8, fill: "var(--surface)" }));
      svg.append(sv("path", { d: `M${cx - k},${cy - k}L${cx + k},${cy + k}M${cx + k},${cy - k}L${cx - k},${cy + k}`, stroke: mk.color, "stroke-width": 2.5, "stroke-linecap": "round" }));
    } else svg.append(sv("circle", { cx: X(mk.x), cy: Y(mk.y), r: 4.5, fill: mk.color, stroke: "var(--surface)", "stroke-width": 2 }));
  }
  for (const lb of cfg.labels ?? []) {
    svg.append(sv("text", { class: lb.strong ? "label-strong" : "label", x: X(lb.x) + (lb.dx ?? 0), y: Y(lb.y) + (lb.dy ?? 4), "text-anchor": lb.anchor ?? "start" }, lb.text));
  }

  // hover layer: crosshair snaps to the nearest x, one tooltip lists every series
  const hover = sv("g", { "pointer-events": "none" });
  const cross = sv("line", { class: "crosshair", y1: m.t, y2: m.t + ih, visibility: "hidden" });
  hover.append(cross);
  const dots = cfg.series.map((s) => { const c = sv("circle", { class: "hover-dot", r: 4.5, fill: s.color, visibility: "hidden" }); hover.append(c); return c; });
  svg.append(hover);
  const hit = sv("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
  svg.append(hit);
  let idx = cfg.xs.length - 1;
  const place = (i, clientX, clientY) => {
    idx = i;
    const x = X(cfg.xs[i]);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
    cfg.series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) dots[k].setAttribute("visibility", "hidden");
      else { dots[k].setAttribute("cx", x); dots[k].setAttribute("cy", Y(v)); dots[k].setAttribute("visibility", "visible"); }
    });
    const t = cfg.tip(i);
    if (clientX == null) {
      const b = svg.getBoundingClientRect(), scale = b.width / W;
      clientX = b.left + x * scale; clientY = b.top + m.t * scale;
    }
    showTip(clientX, clientY, t.title, t.rows, t.extra);
  };
  const clear = () => { cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); hideTip(); };
  hit.addEventListener("pointermove", (e) => {
    const b = svg.getBoundingClientRect(), scale = b.width / W;
    const xv = x0 + (((e.clientX - b.left) / scale - m.l) / iw) * (x1 - x0);
    place(nearestIndex(cfg.xs, xv), e.clientX, e.clientY);
  });
  hit.addEventListener("pointerleave", clear);
  svg.addEventListener("focus", () => place(idx));
  svg.addEventListener("blur", clear);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { place(Math.max(0, idx - 1)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { place(Math.min(cfg.xs.length - 1, idx + 1)); e.preventDefault(); }
    else if (e.key === "Escape") clear();
  });
  host.replaceChildren(svg);
}

function renderOdds(s, force = false) {
  const host = $("odds-chart");
  const pts = s.samples;
  const key = `${pts.length}:${pts.at(-1)?.t}:${s.limit}:${host.clientWidth}`;
  if (!force && key === drawn.odds) return;
  drawn.odds = key;
  if (pts.length < 2) {
    host.replaceChildren(el("p", { class: "empty", text: "Collecting readings… the bot saves one every 15 seconds." }));
    $("odds-table").replaceChildren();
    return;
  }
  const xs = pts.map((p) => p.t);
  const vals = pts.map((p) => p.odds);
  const maxV = Math.max(s.limit * 2, ...vals.filter((v) => v != null).map((v) => v * 1.1));
  const step = niceStep(Math.min(1, maxV), 4);
  const yMax = Math.min(1, Math.ceil(maxV / step) * step);
  const yTicks = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) yTicks.push(+v.toFixed(6));
  const x0 = xs[0], x1 = xs.at(-1);
  const tickStep = x1 - x0 > 40 * 60_000 ? 10 * 60_000 : x1 - x0 > 12 * 60_000 ? 5 * 60_000 : 60_000;
  const xTicks = [];
  for (let t = Math.ceil(x0 / tickStep) * tickStep; t <= x1; t += tickStep) xTicks.push(t);
  const actions = s.log.filter((e) => e.level === "action" && e.t >= x0 && e.t <= x1 + 5000);
  const markers = actions.map((a) => { const i = nearestIndex(xs, a.t); return vals[i] == null ? null : { x: xs[i], y: vals[i], color: "var(--series-1)" }; }).filter(Boolean);
  const last = pts.at(-1);
  lineChart(host, {
    xs, xDomain: [x0, x1], yDomain: [0, yMax], yTicks, yFmt: (v) => `${+(v * 100).toFixed(1)}%`, xTicks, xFmt: hhmm,
    series: [{ name: "odds the loan dies", color: "var(--series-1)", values: vals }],
    refs: [{ y: s.limit, label: `your limit ${pct(s.limit)}`, color: "var(--critical)" }],
    markers,
    labels: last.odds != null ? [{ x: last.t, y: last.odds, text: pct(last.odds), dx: 6, dy: -6, anchor: "start", strong: true }] : [],
    padRight: 44,
    aria: `Odds the loan dies over the last hour. Latest ${pct(last.odds)}, limit ${pct(s.limit)}. ${markers.length} bot actions marked.`,
    tip: (i) => {
      const p = pts[i];
      const act = actions.find((a) => nearestIndex(xs, a.t) === i);
      return {
        title: clock(p.t),
        rows: [
          { name: "odds the loan dies", value: pct(p.odds), color: "var(--series-1)" },
        ],
        extra: `line ${usd(p.line)} · health ${p.health?.toFixed(2) ?? "–"} · BTC ${usd(p.btc)}${act ? ` · bot: ${act.text}` : ""}`,
      };
    },
  });
  $("odds-meta").textContent = `one reading every 15 s · ${markers.length} bot move${markers.length === 1 ? "" : "s"} marked`;
  const tbl = $("odds-table");
  tbl.replaceChildren(el("thead", {}, el("tr", {}, ...["Time", "Odds", "How", "Line", "Health", "BTC"].map((h) => el("th", { text: h })))),
    el("tbody", {}, ...pts.slice().reverse().map((p) => el("tr", {}, ...[clock(p.t), pct(p.odds), p.source ?? "–", usd(p.line), p.health?.toFixed(2) ?? "–", usd(p.btc)].map((v) => el("td", { text: v }))))));
}

function renderReplay() {
  if (!replay) return;
  const h = replay.headline, P = replay.params;
  const U = h.untouched, A = h.intraday, D = h.daily;
  const liq = U.liquidation;
  $("replay-lede").textContent = `A loan opened on ${dayUTC(P.start)}, 2025: 1 BTC at ${usd(U.openPrice)}, ${Math.round(U.ltv * 100)}% borrowed (${usd(U.debt0)}), so the line sat at ${usd(U.line0)}. Then bitcoin fell from about $73,000 to $60,000 on Feb 5 and 6, 2026.`;

  const side = $("replay-side");
  const outcome = (color, title, body) => {
    const key = el("span", { class: "key" });
    key.style.background = color;
    return el("div", { class: "outcome" }, el("h3", {}, key, title), body);
  };
  side.replaceChildren(
    outcome("var(--series-2)", "Left alone", el("p", {}, liq ? el("strong", { text: `Liquidated on ${dayUTC(liq.date)}` }) : el("strong", { text: "Survived" }), liq ? ` at ${usd(liq.price)}. Keeps ${liq.btcKept.toFixed(2)} BTC of 1.` : "")),
    outcome("var(--series-3)", "With Airbag", el("p", {}, el("strong", { text: A.liquidated ? `Liquidated ${dayUTC(A.liquidation.date)}` : "Kept the whole bitcoin." }),
      ` Used up to ${usd(A.maxInLoan)} of its ${usd(A.savings)} savings; on average ${Math.round(A.avgInPot * 100)}% stayed in the pot earning interest.`)),
    outcome("var(--muted)", "Airbag checking only once a day", el("p", {}, el("strong", { text: D.liquidated ? `Liquidated ${dayUTC(D.liquidation.date)}.` : "Also kept the bitcoin" }), D.liquidated ? "" : " in this crash: the odds were already over the limit at the Feb 4 close.")),
  );

  const days = replay.chart;
  const xs = days.map((d) => Date.parse(d.date + "T00:00:00Z"));
  const liqT = liq ? Date.parse(liq.date + "T00:00:00Z") : Infinity;
  const lows = days.map((d) => d.low);
  const untouched = days.map((d, i) => (xs[i] <= liqT ? d.untouchedLine0 : null));
  const airbag = days.map((d) => d.airbagLine);
  const all = [...lows, ...untouched, ...airbag].filter((v) => v != null);
  const step = 10_000;
  const y0 = Math.floor(Math.min(...all) / step) * step - 5000, y1 = Math.ceil(Math.max(...all) / step) * step;
  const yTicks = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) yTicks.push(v);
  const xTicks = ["2026-01-15", "2026-02-01", "2026-02-15", "2026-03-01", "2026-03-15"].map((d) => Date.parse(d + "T00:00:00Z")).filter((t) => t >= xs[0] && t <= xs.at(-1));
  const lastI = days.length - 1;
  const draw = () => lineChart($("replay-chart"), {
    xs, xDomain: [xs[0], xs.at(-1)], yDomain: [y0, y1], yTicks, yFmt: usdK, xTicks, xFmt: (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    // Airbag is drawn before "left alone": the two lines are the same until the bot first acts,
    // so the left-alone line stays visible on top and the Airbag line peels away below it.
    series: [
      { name: "BTC daily low", color: "var(--series-1)", values: lows },
      { name: "line, loan with Airbag", color: "var(--series-3)", values: airbag },
      { name: "line, loan left alone", color: "var(--series-2)", values: untouched },
    ],
    markers: liq ? [{ x: liqT, y: U.line0, color: "var(--series-2)", shape: "x" }] : [],
    labels: [
      { x: xs[lastI], y: lows[lastI], text: "BTC daily low", dx: 6 },
      { x: xs[lastI], y: airbag[lastI] ?? y0, text: "With Airbag", dx: 6 },
      ...(liq ? [{ x: liqT, y: U.line0, text: `Left alone: liquidated ${dayUTC(liq.date)}`, dx: 12, dy: 16 }] : [{ x: xs[lastI], y: U.line0, text: "Left alone", dx: 6 }]),
    ],
    padRight: 104,
    height: 280,
    aria: `BTC daily low against the liquidation line, ${dayUTC(days[0].date)} to ${dayUTC(days[lastI].date)}. Left alone, the loan is liquidated on ${liq ? dayUTC(liq.date) : "no date"}. With Airbag the line drops out of the way and the loan survives.`,
    tip: (i) => ({
      title: new Date(xs[i]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
      rows: [
        { name: "BTC daily low", value: usd(lows[i]), color: "var(--series-1)" },
        { name: "line, with Airbag", value: usd(airbag[i]), color: "var(--series-3)" },
        { name: "line, left alone", value: untouched[i] != null ? usd(untouched[i]) : "liquidated", color: "var(--series-2)" },
      ],
      extra: `Airbag savings inside the loan: ${usd(days[i].inLoan)}`,
    }),
  });
  draw();
  replayDraw = draw;

  const modes = ["untouched", "daily", "intraday"];
  const cell = (r) => (r.liquidated ? `liquidated ${dayUTC(r.liquidation.date)} (${r.btcKept.toFixed(2)} BTC left)` : "kept 1 BTC");
  const ltvs = [...new Set(replay.table.map((r) => r.ltv))];
  $("replay-table").replaceChildren(
    el("thead", {}, el("tr", {}, ...["Borrowed", "Line", "Left alone", "Airbag, once a day", "Airbag, real time", "Most savings in use", "Avg. left in the pot"].map((t) => el("th", { text: t })))),
    el("tbody", {}, ...ltvs.map((ltv) => {
      const [u, d, a] = modes.map((mo) => replay.table.find((r) => r.ltv === ltv && r.mode === mo));
      return el("tr", {}, ...[`${Math.round(ltv * 100)}%`, usd(u.line0), cell(u), cell(d), cell(a), `${usd(a.maxInLoan)} of ${usd(a.savings)}`, `${Math.round(a.avgInPot * 100)}%`].map((v) => el("td", { text: v })));
    })),
  );
  $("replay-days").replaceChildren(
    el("thead", {}, el("tr", {}, ...["Date", "BTC low", "BTC close", "Line, left alone", "Line, with Airbag", "Savings in the loan"].map((t) => el("th", { text: t })))),
    el("tbody", {}, ...days.map((d, i) => el("tr", {}, ...[d.date, usd(d.low), usd(d.close), untouched[i] != null ? usd(untouched[i]) : "liquidated", usd(d.airbagLine), usd(d.inLoan)].map((v) => el("td", { text: v }))))),
  );
  $("replay-method").textContent = `Method: daily BTC/USD candles from Gemini. Gemini keeps no history of its prediction-market prices, so the odds come from the last ${P.volWindowDays} days of volatility over ${P.horizonDays} days, doubled like the bot. Limit ${pct(P.limit)}, savings ${Math.round(P.savingsPct * 100)}% of the loan, liquidation incentive ${((P.liquidationIncentive - 1) * 100).toFixed(1)}%. No fees or interest; the whole loan is liquidated at the line. "Real time" walks each day open → high → low → close in small steps. The rule is the bot's own decide().`;
}
let replayDraw = null;

// redraw charts when their width changes
new ResizeObserver(() => {
  const w = $("odds-chart").clientWidth;
  if (Math.abs(w - drawn.width) < 4) return;
  drawn.width = w;
  if (S) renderOdds(S, true);
  if (replayDraw) replayDraw();
}).observe(document.querySelector("main"));

// ------------------------------------------------------------------ demo controls (press "d")
const demo = $("demo");
let demoKey = "";
try { demoKey = sessionStorage.getItem("airbag-demo-key") ?? ""; } catch { /* storage blocked */ }
const out = (msg) => ($("demo-out").textContent = msg);
async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-airbag-key": demoKey }, body: JSON.stringify(body ?? {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}
async function unlock() {
  try {
    await api("/api/demo/check-key");
    try { sessionStorage.setItem("airbag-demo-key", demoKey); } catch { /* ignore */ }
    $("demo-actions").hidden = false;
    $("demo-key-form").hidden = true;
    out(S?.publicDemo && !demoKey ? "" : "Unlocked.");
    syncDemoButtons();
  } catch (e) {
    $("demo-actions").hidden = true;
    $("demo-key-form").hidden = false;
    out(`Locked: ${e.message}`);
  }
}
function toggleDemo(force) {
  demo.hidden = force != null ? !force : !demo.hidden;
  if (!demo.hidden) { $("demo-key").value = demoKey; unlock(); }
}
// Hosted simulator with PUBLIC_DEMO=true: no key needed, so show a "Try the demo" button,
// open the panel once on first visit, and hide the key box and Pause (the server refuses Pause anyway).
let publicSetUp = false;
function setupPublicDemo() {
  if (publicSetUp || !S?.publicDemo) return;
  publicSetUp = true;
  $("demo-intro").hidden = false;
  $("btn-pause").hidden = true;
  $("demo-open").hidden = false;
  $("foot-demo").hidden = true;
  $("demo-open").addEventListener("click", () => toggleDemo(true));
  let seen = false;
  try { seen = sessionStorage.getItem("airbag-demo-seen") === "1"; sessionStorage.setItem("airbag-demo-seen", "1"); } catch { /* ignore */ }
  if (!seen) toggleDemo(true);
}
function syncDemoButtons() {
  if (!S || demo.hidden) return;
  $("btn-pause").textContent = S.paused ? "Resume bot" : "Pause bot";
  const li = $("limit-input");
  if (document.activeElement !== li) li.value = +(S.limit * 100).toFixed(2);
}
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (!typing && (e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleDemo();
  else if (e.key === "Escape" && !demo.hidden) toggleDemo(false);
});
$("demo-close").addEventListener("click", () => toggleDemo(false));
$("demo-key-form").addEventListener("submit", (e) => { e.preventDefault(); demoKey = $("demo-key").value.trim(); unlock(); });
const run = (btn, path, body, label) => async () => {
  btn.disabled = true;
  out(`${label}…`);
  try { const j = await api(path, body?.()); out(`${label}: ${j.result ?? "done"}`); }
  catch (e) { out(`${label} failed: ${e.message}`); }
  finally { btn.disabled = false; }
};
$("btn-push").addEventListener("click", run($("btn-push"), "/api/demo/push", null, "Push it to the edge"));
$("btn-reset").addEventListener("click", run($("btn-reset"), "/api/demo/reset", null, "Reset"));
$("btn-pause").addEventListener("click", run($("btn-pause"), "/api/demo/pause", () => ({ paused: !S?.paused }), "Pause / resume"));
$("limit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = Number($("limit-input").value) / 100;
  run($("limit-form").querySelector("button"), "/api/demo/limit", () => ({ limit: v }), "Set limit")();
});

poll();
loadReplay();
