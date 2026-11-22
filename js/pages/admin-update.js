// Admin > Settings: "Required update". Writes requireBuild / requireBy / updateMessage to settings/app (students pick it up within minutes).
import { db, doc, setDoc, getDoc, Timestamp, serverTimestamp, deleteField } from "../firebase.js";
import { state } from "../state.js";
import { APP_BUILD } from "../version.js";
import { policy } from "../update.js";
import { esc, ls, fmtDateTime, toMillis } from "../lib/util.js";
import { confirmBox, toast } from "../ui.js";
import { handleError } from "../net.js";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export async function updateCard(box, ctx) {
  if (!box) return;
  try { const s = await getDoc(doc(db, "settings", "app")); if (s.exists()) { state.settings = { ...state.settings, ...JSON.parse(JSON.stringify({ ...s.data(), requireBy: undefined })), requireBy: toMillis(s.data().requireBy) || 0 }; ls("settings_app", state.settings); } } catch { /* use what we have */ }
  if (!ctx.alive()) return;
  const draw = () => {
    const p = policy();
    box.innerHTML = `<div class="card stack-s ${p.req ? "accent" : ""}"><strong>Required update: ${p.req ? `build ${p.req}${p.by ? ` by ${esc(fmtDateTime(p.by))}` : " (immediately)"}` : "none"}</strong>
      <p class="small muted" style="margin:0">This copy of the app is build <strong>${APP_BUILD}</strong>. Steps: 1) raise <code>APP_BUILD</code> in js/version.js and <code>VERSION</code> in sw.js, 2) upload the new files, 3) set the build here.
      Students on an older build then see a notice with your date, and a blocking "Update required" screen after it. Nothing is enforced until the new files are really online, so you cannot lock students out by mistake.</p>
      <div class="row wrap" style="gap:10px">
        <label class="grow">Require build<input id="rb" type="number" min="1" inputmode="numeric" value="${p.req || ""}" placeholder="${APP_BUILD}"></label>
        <label class="grow">Update before<input id="rd" type="datetime-local" value="${toLocalInput(p.by)}"></label></div>
      <label>Message to students (optional)<input id="rm" maxlength="300" value="${esc(p.msg)}" placeholder="e.g. New levels and fixes. Please update."></label>
      <span class="field-hint">Leave the date empty to require the update straight away.</span>
      <div class="row wrap"><button class="btn primary small" id="rsave">Save requirement</button>${p.req ? '<button class="btn small ghost" id="rclear">Remove requirement</button>' : ""}</div></div>`;
    box.querySelector("#rsave").onclick = async (e) => {
      const req = Math.floor(Number(box.querySelector("#rb").value));
      if (!(req >= 1)) return toast("Enter the build number to require", "bad");
      const raw = box.querySelector("#rd").value, by = raw ? new Date(raw).getTime() : 0;
      if (raw && !Number.isFinite(by)) return toast("That date is not valid", "bad");
      if (!(await confirmBox({ title: "Require this update?", text: `Everyone on a build below ${req} will be asked to update${by ? ` before ${fmtDateTime(by)}` : " right now"}. Make sure the new files are already uploaded.`, okLabel: "Save" }))) return;
      e.target.disabled = true;
      const msg = box.querySelector("#rm").value.trim();
      try {
        await setDoc(doc(db, "settings", "app"), { requireBuild: req, requireBy: by ? Timestamp.fromMillis(by) : deleteField(), updateMessage: msg, requireSetAt: serverTimestamp() }, { merge: true });
        state.settings = { ...state.settings, requireBuild: req, requireBy: by || null, updateMessage: msg }; ls("settings_app", state.settings);
        toast("Update requirement saved", "good");
      } catch (ex) { if (!handleError(ex)) toast("That didn't work. Please try again.", "bad"); }
      draw();
    };
    box.querySelector("#rclear")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        await setDoc(doc(db, "settings", "app"), { requireBuild: deleteField(), requireBy: deleteField(), updateMessage: deleteField() }, { merge: true });
        state.settings = { ...state.settings, requireBuild: 0, requireBy: null, updateMessage: "" }; ls("settings_app", state.settings);
        toast("Requirement removed", "good");
      } catch (ex) { if (!handleError(ex)) toast("That didn't work. Please try again.", "bad"); }
      draw();
    });
  };
  draw();
}
