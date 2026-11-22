// Share helpers: the phone's share sheet when there is one, otherwise copy to the clipboard.
import { toast } from "./ui.js";

const NAME = "SUMAS Quiz Arena";
const appUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : "");

async function send(title, text, url) {
  try {
    if (navigator.share) await navigator.share({ title, text, url: url || undefined });
    else { await navigator.clipboard.writeText(text + (url ? " " + url : "")); toast("Copied. Paste it into a chat.", "good"); }
  } catch { /* the person closed the share sheet */ }
}

/** A direct link to a page inside the app, e.g. linkTo("/match/abc"). Opening it signs the person in first, then lands on that page. */
export const linkTo = (path) => { const b = appUrl(); return b ? `${b}#${path}` : ""; };

/** Share a match or tournament: the phone's share sheet (WhatsApp etc.), or copy the text and link. */
export const shareLink = ({ title, text, path }) => send(title, text, linkTo(path));
export const copyLink = async (path) => {
  try { await navigator.clipboard.writeText(linkTo(path)); toast("Link copied", "good"); } catch { toast(linkTo(path) || "Open the app from its web address to copy a link."); }
};

/** "I scored 8/10 (80%) on Anatomy Set 1" */
export const shareResult = ({ score, total, percent, title }) =>
  send(`${NAME} result`, `I scored ${score}/${total} (${percent}%) on ${title} with ${NAME}. Think you can beat me? 🏆`, appUrl());

const LINES = [
  `📚 Studying just got easier! Practice question banks with instant explanations and progress tracking on ${NAME}:`,
  `Exam coming up? 📝 Practise on ${NAME}. It works offline and installs on your phone:`,
  `🎯 Study smarter, not harder. Pick a bank, quiz yourself and see how you rank on ${NAME}:`,
];
export const shareApp = (percent = null) => send(NAME, percent !== null && percent >= 60 ? `I just scored ${percent}% on ${NAME} 🏆 Think you can beat me?` : LINES[Math.floor(Math.random() * LINES.length)], appUrl());
