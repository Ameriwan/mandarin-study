// 今天 Today (home). The generated daily routine arrives with M2; for now: streak, minutes, and the map of the app.
import { h, $, clear, mountShell, store, streak, loadJSON, BUILT } from "./app.js";

mountShell("home");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const PAGES = [
  ["lab.html", "注音", "Zhuyin Lab", "37 symbols, every syllable in every tone, contrast drills, dictation"],
  ["tones.html", "聲調", "Tone Gym", "tone ID, tone pairs, pitch mirror, sandhi"],
  ["shadow.html", "跟讀", "Shadowing", "player + guided protocol"],
  ["units.html", "課程", "Units", "dialogues set in Pingtung, by TBCL level"],
  ["library.html", "資料庫", "Library", "words, grammar, patterns, Taiwan usage, my notes"],
  ["plan.html", "計畫", "Plan", "roadmap, placement check, pace"],
  ["advanced.html", "進階", "Advanced", "reading and listening ladders, TOCFL prep"],
  ["settings.html", "設定", "Settings", "display, export/import, credits"],
];

const en = text => h("span", { lang: "en" }, text); // English runs inside the zh-Hant-TW page

function weekMinutes() {
  const days = store.get("days", {});
  const d = new Date();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    total += Object.values(days[k] || {}).reduce((a, b) => a + b, 0);
    d.setDate(d.getDate() - 1);
  }
  return Math.round(total);
}

async function render() {
  const app = clear($("#app"));
  const meta = await loadJSON("meta").catch(() => null);
  app.append(
    h("div", { class: "page-head" }, h("h1", {}, h("span", { lang: "zh-Hant-TW" }, "今天"), h("span", { class: "en", lang: "en" }, "Today"))),
    h("div", { class: "card" },
      h("div", { class: "stat-row" },
        h("span", {}, "連續 ", en("streak"), " ", h("b", {}, streak(), " 天")),
        h("span", {}, "本週 ", en("this week"), " ", h("b", {}, weekMinutes(), " 分鐘")),
        h("span", {}, "程度 ", en("level"), " ", h("b", {}, store.get("level", null) ?? ["未測 ", en("not placed yet")]))),
      h("p", { class: "muted small", style: "margin:10px 0 0" }, "每日練習計畫會在聲調館完成後出現在這裡。", en("The generated daily routine (10 min pronunciation, then the unit, shadowing and an Anki checkbox) arrives with the Tone Gym milestone. Until then, start in the Zhuyin Lab."))),
    h("h2", {}, "開始 ", en("Start")),
    h("div", { class: "home-nav" }, PAGES.map(([href, zh, enName, d]) => {
      const id = href.replace(".html", "");
      const built = BUILT.includes(id);
      // unbuilt pages: a disabled link with no href, like the top nav and the 更多 sheet
      return h("a", { href: built ? href : null, class: built ? "" : "soon", role: built ? null : "link", "aria-disabled": built ? null : "true" },
        h("span", { class: "t" }, h("span", { lang: "zh-Hant-TW" }, zh), " ", h("span", { class: "muted", style: "font-size:15px", lang: "en" }, enName)),
        h("span", { class: "d" }, built ? en(d) : ["尚未建置 ", en("coming soon")]));
    })),
    meta ? h("p", { class: "muted small", style: "margin-top:16px" }, `資料建置 `, en(`data built ${meta.built} · ${meta.counts.moe_clips} MOE human clips · ${meta.counts.syllables} syllables`)) : null);
}
render();
