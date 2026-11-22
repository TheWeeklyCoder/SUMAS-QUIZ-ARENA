// "Choose your level": shown once after sign-up (and to students who signed up before levels existed). Also reachable from Profile.
import { db, doc, updateDoc } from "../firebase.js";
import { state } from "../state.js";
import { go } from "../router.js";
import { loadBanks } from "../data.js";
import { LEVELS, levelLabel, levelsWithBanks, myLevel } from "../lib/levels.js";
import { ls, takeNext } from "../lib/util.js";
import { icon, skeleton, toast } from "../ui.js";

/**
 * Saves the level on this phone first (so the app works at once), then on the profile.
 * Returns true when the server copy was saved too. If the rules don't allow the field yet it stays on this phone only.
 */
export async function saveLevel(level) {
  const uid = state.user.uid;
  state.profile = { ...state.profile, level };
  ls("level_" + uid, level); ls("profile_" + uid, state.profile);
  try { await updateDoc(doc(db, "profiles", uid), { level }); return true; } catch { return false; }
}

export default async function levelPage(ctx) {
  const current = myLevel(), changing = !!current;
  ctx.view.innerHTML = `<section class="stack-l" style="max-width:480px;margin:0 auto;padding-top:16px">
    <header><h1>${changing ? "Change your level" : "What level are you in?"}</h1>
      <p class="muted">${changing ? "You will only see question banks for the level you pick. You can change this any time." : "We will show you the question banks for your level. You can change this later in Profile."}</p></header>
    <div id="lv">${skeleton(3)}</div></section>`;
  let banks = [];
  try { banks = await loadBanks(); } catch { /* show the first level only */ }
  if (!ctx.alive()) return;
  let open = levelsWithBanks(banks);
  if (!open.length) open = [LEVELS[0]];   // nothing loaded: never leave the student stuck
  let pick = open.includes(current) ? current : null;

  const box = ctx.view.querySelector("#lv");
  const draw = () => {
    box.innerHTML = `<div class="stack">
      <div class="list" role="radiogroup" aria-label="Your level">${LEVELS.map((l) => {
        const on = open.includes(l);
        return `<button class="item" role="radio" data-l="${l}" aria-checked="${pick === l}" ${on ? "" : 'disabled aria-disabled="true"'} style="${pick === l ? "border-color:var(--edge);box-shadow:0 3px 0 var(--edge)" : ""}${on ? "" : ";opacity:.55;cursor:not-allowed"}">
          <span class="tile ${on ? "" : "gold"}">${icon(on ? "book" : "lock")}</span>
          <div class="grow"><strong>${levelLabel(l)}</strong><div class="meta">${on ? "Question banks available" : "Coming soon. Banks are being added"}</div></div>
          ${pick === l ? icon("check") : ""}</button>`;
      }).join("")}</div>
      <p id="err" class="error" role="alert" hidden></p>
      <div class="row">${changing ? '<button class="btn ghost" id="cancel">Cancel</button>' : ""}<button class="btn primary grow" id="save" ${pick ? "" : "disabled"}>${changing ? "Save" : "Continue"}</button></div></div>`;
    box.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { pick = Number(b.dataset.l); draw(); }));
    box.querySelector("#cancel")?.addEventListener("click", () => go("/profile"));
    box.querySelector("#save").onclick = async (e) => {
      if (!pick) return;
      e.target.disabled = true; e.target.textContent = "Saving...";
      const synced = await saveLevel(pick);
      if (!ctx.alive()) return;
      if (!synced) toast("Saved on this phone. It will not follow you to another phone yet.");
      else toast(`You are in ${levelLabel(pick)}`, "good");
      go(changing ? "/practice" : takeNext() || "/", { replace: true });
    };
  };
  draw();
}
