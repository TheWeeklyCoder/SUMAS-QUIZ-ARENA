// Notes and summaries sold through Selar. We only list them; buying and delivery happen on Selar.
import { db, getDocs, collection } from "../firebase.js";
import { cacheGet, cacheSet } from "../cache.js";
import { esc, naira, plain } from "../lib/util.js";
import { isHttpsUrl } from "../lib/tournament.js";
import { badge, hint, icon, skeleton } from "../ui.js";
import { handleError } from "../net.js";
import { isOnline } from "../net.js";

const TYPES = { notes: "Notes", summary: "Summary", other: "Study material" };

async function loadProducts() {
  const cached = await cacheGet("products");
  if (cached && (Date.now() - cached.savedAt < 30 * 60000 || !isOnline())) return cached.value;
  try {
    const snap = await getDocs(collection(db, "products"));
    const rows = plain(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    await cacheSet("products", rows);
    return rows;
  } catch (e) { if (cached) return cached.value; throw e; }
}

export default async function store(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Notes &amp; summaries</h1><p class="muted" style="margin:0">Study material made for your courses. Opens on Selar, where you pay and download.</p></header><div id="p">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#p");
  try {
    const rows = (await loadProducts()).filter((p) => p.active !== false && isHttpsUrl(p.selarUrl)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.title).localeCompare(String(b.title)));
    if (!ctx.alive()) return;
    box.innerHTML = rows.length ? `<div class="stack">${rows.map((p) => `<article class="card stack-s"><div class="row between" style="align-items:flex-start;gap:12px"><div class="grow"><h3 style="margin:0">${esc(p.title)}</h3>
        <div class="row wrap" style="gap:6px;margin-top:6px">${badge(TYPES[p.type] || TYPES.other)}${p.price > 0 ? badge(naira(p.price), "gold") : badge("Free", "green")}</div></div></div>
      ${p.description ? `<p class="small muted" style="margin:0;white-space:pre-wrap">${esc(p.description)}</p>` : ""}
      <a class="btn ${p.price > 0 ? "gold" : "primary"} block" href="${esc(p.selarUrl)}" target="_blank" rel="noopener noreferrer">${icon("arrow", "sm")} ${p.price > 0 ? "Get it on Selar" : "Download on Selar"}</a></article>`).join("")}
      ${hint("Selar is a separate website. Purchases there aren't part of your SUMAS subscription.", "info")}</div>`
      : '<div class="card center stack-s"><div style="color:var(--gold)">' + icon("book") + '</div><h2>Coming soon</h2><p class="muted" style="margin:0">Notes and summaries will be listed here.</p></div>';
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load the list.</p><button class="btn" id="r">Try again</button></div>';
    box.querySelector("#r").onclick = () => store(ctx);
    handleError(e, { retry: () => store(ctx) });
  }
}
