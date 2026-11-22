// Hash router. Every screen has its own link (#/progress) and the back button works.
import { closeAllSheets } from "./ui.js";
const routes = [];
let guard = () => null;
let leave = [];
let token = 0;
let onRendered = () => {};

export function route(pattern, handler, meta = {}) {
  const keys = [];
  // "*" is the not-found fallback and is matched explicitly in dispatch(), never by regex.
  const re = pattern === "*" ? /^$\b/ : new RegExp("^" + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
  routes.push({ pattern, re, keys, handler, meta });
}
export const setGuard = (fn) => { guard = fn; };
export const setOnRendered = (fn) => { onRendered = fn; };

export function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs)) };
}

export const go = (path, { replace = false } = {}) => {
  const target = "#" + path;
  if (replace) { history.replaceState(null, "", target); dispatch(); }
  else if (location.hash === target) dispatch();
  else location.hash = target;
};

export async function dispatch() {
  const my = ++token;
  const { path, query } = parseHash();
  const redirect = guard(path);
  if (redirect && redirect !== path) { history.replaceState(null, "", "#" + redirect); return dispatch(); }

  leave.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  leave = [];
  try { closeAllSheets(); } catch { /* ignore */ }   // a sheet must not stay open over the next page

  const view = document.getElementById("view");
  const hit = routes.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  const route404 = routes.find((r) => r.pattern === "*");
  const found = hit || (route404 && { r: route404, m: [] });
  if (!found) return;
  const params = {};
  found.r.keys.forEach((k, i) => (params[k] = decodeURIComponent(found.m[i + 1])));
  const ctx = {
    params, query, path, view, meta: found.r.meta,
    alive: () => my === token,
    onLeave: (fn) => leave.push(fn),
  };
  onRendered(ctx);
  view.classList.remove("page"); void view.offsetWidth; view.classList.add("page");
  window.scrollTo(0, 0);
  try { await found.r.handler(ctx); }
  catch (e) {
    console.error(e);
    if (ctx.alive()) view.innerHTML = `<div class="card stack"><h2>Something went wrong</h2><p class="muted">Please go back and try again. Nothing was lost.</p><a class="btn" href="#/">Go home</a></div>`;
  }
  if (ctx.alive()) view.focus({ preventScroll: true });
}

export function startRouter() {
  window.addEventListener("hashchange", dispatch);
  return dispatch();
}
