/* askwire landing: procedural curtain, cue-light replay, log ruler. No dependencies. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const NS = "http://www.w3.org/2000/svg";
  const C = { dark: "#6e0f1f", base: "#a3162b", light: "#c42a3c", hem: "#8c1222", black: "#141216" };

  /* ---------------- curtain ---------------- */
  const stage = $("#stage"), svg = $("#curtain");
  let W = 0, H = 0, lift = 0, sway = 0, t0 = performance.now();
  const bands = [[0, .16, C.dark], [.16, .58, C.base], [.58, .8, C.light], [.8, 1, C.base]];
  const paths = bands.map(([, , fill]) => { const p = document.createElementNS(NS, "path"); p.setAttribute("fill", fill); svg.appendChild(p); return p; });
  const fringe = document.createElementNS(NS, "path"); fringe.setAttribute("fill", C.hem); svg.appendChild(fringe);
  const valance = document.createElementNS(NS, "path"); valance.setAttribute("fill", C.dark); svg.appendChild(valance);
  const valance2 = document.createElementNS(NS, "path"); valance2.setAttribute("fill", C.base); svg.appendChild(valance2);

  function size() {
    const r = stage.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(300, Math.round(r.height));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    draw(performance.now());
  }
  const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function draw(now) {
    const t = (now - t0) / 1000;
    const n = Math.max(7, Math.round(W / 95));
    const top = 40; // valance depth
    const p = lift;
    // as the curtain flies out the folds bunch up (narrower near the hem) and the hem scallops
    const yb = top + (H - top) * (1 - p) + 14 * p;
    const sag = 7 + (Math.min(80, H * .1) * Math.pow(Math.sin(Math.PI * Math.min(p, .999)), .6)) + 18 * p;
    const gather = 1 - .08 * Math.sin(Math.PI * p);
    const xs = [];
    for (let i = 0; i <= n; i++) {
      // uneven fold widths, fixed per fold so the cloth looks hung, not printed
      const u = (i + (i === 0 || i === n ? 0 : Math.sin(i * 12.9898) * .28)) / n;
      const centred = (u - .5) * gather + .5;
      const wob = i === 0 || i === n ? 0 : Math.sin(t * 2.1 + i * 1.7) * sway * 7;
      xs.push(centred * W + wob);
    }
    xs[0] = -2; xs[n] = W + 2;
    const hemY = (u) => yb + sag * Math.sin(Math.PI * u);
    const ds = bands.map(() => "");
    let fr = "";
    for (let i = 0; i < n; i++) {
      const x0 = xs[i], x1 = xs[i + 1], w = x1 - x0;
      const j = Math.sin(i * 78.233) * .07; // each fold catches the light a little differently
      bands.forEach(([a0, b0], k) => {
        const a = k === 0 ? a0 : a0 + j, b = k === 3 ? b0 : b0 + j;
        const steps = 5;
        let d = `M${(x0 + w * a).toFixed(1)},0 L${(x0 + w * b).toFixed(1)},0`;
        for (let s = 0; s <= steps; s++) {
          const u = b - (b - a) * (s / steps);
          d += ` L${(x0 + w * u).toFixed(1)},${hemY(u).toFixed(1)}`;
        }
        ds[k] += d + "Z";
      });
      // fringe: little triangles hanging from the hem
      const m = Math.max(4, Math.round(w / 13));
      for (let j = 0; j < m; j++) {
        const u0 = j / m, u1 = (j + .5) / m, u2 = (j + 1) / m;
        fr += `M${(x0 + w * u0).toFixed(1)},${(hemY(u0) - 1).toFixed(1)} L${(x0 + w * u1).toFixed(1)},${(hemY(u1) + 9).toFixed(1)} L${(x0 + w * u2).toFixed(1)},${(hemY(u2) - 1).toFixed(1)}Z`;
      }
    }
    paths.forEach((el, k) => el.setAttribute("d", ds[k]));
    fringe.setAttribute("d", fr);
    // valance: short swags across the top that never move
    const sw = Math.max(80, W / Math.max(4, Math.round(W / 160)));
    let v = `M0,0 H${W} V${top - 10}`, v2 = `M0,0 H${W} V${top - 18}`;
    for (let x = W; x > 0; x -= sw) { v += ` Q${x - sw / 2},${top + 14} ${x - sw},${top - 10}`; v2 += ` Q${x - sw / 2},${top + 4} ${x - sw},${top - 18}`; }
    valance.setAttribute("d", v + "Z"); valance2.setAttribute("d", v2 + "Z");
  }

  let raf = 0;
  function loop(now) { draw(now); if (sway > 0.01 || animating) raf = requestAnimationFrame(loop); else raf = 0; sway *= .985; }
  let animating = false;
  const kick = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); };
  function ripple(a = 1) { if (reduce) return; sway = Math.min(1.4, sway + a); kick(); }
  function flyTo(target, ms) {
    if (reduce) { lift = target; draw(performance.now()); return Promise.resolve(); }
    const from = lift, start = performance.now();
    animating = true; kick();
    return new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - start) / ms);
        lift = from + (target - from) * ease(k);
        if (k < 1) requestAnimationFrame(step); else { animating = false; sway = Math.max(sway, .6); kick(); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  new ResizeObserver(size).observe(stage);
  size();

  /* ---------------- replay data (real runs, 2026-10-25) ---------------- */
  const RUNS = {
    headless: {
      claude: { cmd: "-P", ans: "cancel", ms: "5 ms", note: "answered by the client · curtain stayed down", tone: "" },
      codex: { cmd: "EXEC", ans: "decline", ms: "2 ms", note: "spec: decline = the user said no", tone: "" },
      opencode: { cmd: "RUN", ans: "not advertised", ms: "", note: "nothing sent · -32601 if you try", tone: "no" },
      gemini: { cmd: "-P", ans: "not advertised", ms: "", note: "nothing sent · -32601 if you try", tone: "no" },
    },
    tui: {
      claude: { cmd: "INTERACTIVE", ans: "cancel", ms: "1.8 s", note: "on screen in ~120 ms · then Esc", tone: "ok" },
      codex: { cmd: "INTERACTIVE", ans: "decline", ms: "2.0 s", note: "url prompt, Esc · spec says cancel", tone: "warn" },
      opencode: { cmd: "INTERACTIVE", ans: "not advertised", ms: "", note: "nothing sent · -32601 if you try", tone: "no" },
      gemini: { cmd: "INTERACTIVE", ans: "not advertised", ms: "", note: "nothing sent · -32601 if you try", tone: "no" },
    },
  };
  const SCREENS = {
    claude: { title: "claude 2.1.310 · interactive", answer: '{"action":"cancel"} after 1769 ms', lines: [
      ["❯ Run the askwire probe tools.", ""], ["  Calling askwire…", "dim"], ["─".repeat(64), "dim"],
      ["  MCP server “askwire” requests your input", "hl"],
      ["  askwire probe AW-2HPL: confirm a test action? This is a test from askwire; nothing happens whichever you choose.", ""],
      ["  ❯ ✔ Confirm the test action: ☐", "sel"], ["    Accept    Decline", ""],
      ["  Esc to cancel · ↑/↓ to navigate · Backspace to unset · Space to toggle", "dim"]] },
    codex: { title: "codex 0.164.0 · interactive", answer: '{"action":"decline"} after 2054 ms', lines: [
      ["› Run the askwire probe tools.", ""], ["• Calling askwire.askwire_url", "dim"],
      ["  Action required", "hl"], ["  Server: askwire", "dim"],
      ["  askwire probe AW-2HPL: open this page to continue. This is a test from askwire; nothing happens whichever you choose.", ""],
      ["  https://blackman99.github.io/askwire/probe.html?n=AW-2HPL", "sel"],
      ["› 1. Open link", ""], ["  2. Back", ""], ["  tab / ↑ ↓ move · enter select · esc close", "dim"]] },
  };

  const caption = $("#caption"), btn = $("#standby"), term = $("#term-body");
  let mode = "headless", busy = false, runId = 0;
  const cue = (c) => $(`.cue[data-client="${c}"]`);
  const lamp = (c, color, on) => cue(c).querySelector(`.lamp.${color}`).classList.toggle("on", on);
  const say = (s) => { caption.textContent = s; };
  function setAnswer(c, r) {
    const el = $(`#${c}-ans`);
    if (!r) { el.innerHTML = "&nbsp;"; return; }
    el.innerHTML = `<span class="k ${r.tone}">${r.ans}</span>${r.ms ? ` ${r.ms}` : ""}<small>${r.note}</small>`;
  }
  function reset() {
    ["claude", "codex", "opencode", "gemini"].forEach((c) => { lamp(c, "red", false); lamp(c, "green", false); setAnswer(c, null); $(`#${c}-cmd`).textContent = RUNS[mode][c].cmd; });
  }
  async function blinkWhile(c, promise, id) {
    let on = true, done = false;
    promise.then(() => { done = true; });
    while (!done && id === runId) { lamp(c, "red", on); on = !on; await sleep(500); }
    lamp(c, "red", false);
  }
  function packet(c, up, ms) {
    const p = cue(c).querySelector(".packet"), wire = cue(c).querySelector(".wire");
    const h = wire.getBoundingClientRect().height - 14;
    if (reduce) return Promise.resolve();
    return p.animate([
      { transform: `translateY(${up ? 0 : -h}px)`, opacity: 1 },
      { transform: `translateY(${up ? -h : 0}px)`, opacity: 1 }], { duration: ms, easing: "cubic-bezier(.5,0,.5,1)" }).finished.then(() => { p.style.opacity = 0; });
  }
  async function typeScreen(c, id) {
    const s = SCREENS[c];
    $("#term-title").textContent = s.title;
    $("#term-esc").classList.remove("on");
    term.innerHTML = "";
    for (const [txt, cls] of s.lines) {
      if (id !== runId) return;
      const span = document.createElement("span"); if (cls) span.className = cls; span.textContent = txt + "\n"; term.appendChild(span);
      if (!reduce) await sleep(70);
    }
  }

  async function runHeadless(id) {
    say("STANDBY · elicitation/create goes to all four clients");
    const jobs = ["claude", "codex"].map(async (c, i) => {
      await sleep(i * 260);
      const trip = (async () => { await packet(c, true, 900); ripple(.5); await sleep(reduce ? 0 : 250); await packet(c, false, 600); })();
      await blinkWhile(c, trip, id);
      if (id !== runId) return;
      lamp(c, "green", true); setAnswer(c, RUNS.headless[c]);
    });
    (async () => { await sleep(520); if (id === runId) { setAnswer("opencode", RUNS.headless.opencode); setAnswer("gemini", RUNS.headless.gemini); } })();
    await Promise.all(jobs);
    if (id === runId) say("Two answers in under 5 ms, both from the client itself. The curtain never went up: nobody was asked.");
  }

  async function runTui(id) {
    setAnswer("opencode", RUNS.tui.opencode); setAnswer("gemini", RUNS.tui.gemini);
    for (const c of ["claude", "codex"]) {
      if (id !== runId) return;
      say(`STANDBY · ${c} draws the question in its terminal`);
      const show = (async () => {
        await packet(c, true, 800);
        await typeScreen(c, id);
        await flyTo(1, 1500);
        await sleep(reduce ? 0 : 1300);
        $("#term-esc").classList.add("on");
        const ans = document.createElement("span"); ans.className = "hl";
        ans.textContent = `\n  └ client answered ${SCREENS[c].answer}`; term.appendChild(ans);
        await sleep(reduce ? 0 : 1200);
        if (!reduce) await flyTo(0, 1100);
        await packet(c, false, 500);
      })();
      await blinkWhile(c, show, id);
      if (id !== runId) return;
      lamp(c, "green", true); setAnswer(c, RUNS.tui[c]);
    }
    if (id === runId) say("Shown on screen, then dismissed with Esc. Claude says cancel; Codex says decline for the URL prompt.");
    if (reduce) { lift = .62; draw(performance.now()); }
  }

  async function run() {
    const id = ++runId;
    busy = true; btn.disabled = true;
    stage.classList.toggle("up", mode === "tui");
    reset();
    if (lift > 0) await flyTo(0, 600);
    if (mode === "headless") await runHeadless(id); else await runTui(id);
    if (id === runId) { busy = false; btn.disabled = false; stage.classList.toggle("up", mode === "tui" && reduce); }
  }

  btn.addEventListener("click", run);
  $$(".switch button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    $$(".switch button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    run();
  }));
  // first replay when the desk comes into view
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(run, reduce ? 0 : 700); } }, { threshold: .4 });
  io.observe($(".desk"));

  /* ---------------- copy buttons ---------------- */
  $$(".copy").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "copied"; b.classList.add("done"); }
    catch { b.textContent = "select it"; }
    setTimeout(() => { b.textContent = "copy"; b.classList.remove("done"); }, 1600);
  }));

  /* ---------------- log ruler ---------------- */
  const R = $("#ruler");
  const X = (ms) => 70 + (Math.log10(ms) + 1) / 5 * 880;
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; R.appendChild(e); return e; };
  el("line", { x1: 70, x2: 950, y1: 214, y2: 214, stroke: "#5e5862", "stroke-width": 2 });
  [[0.1, "0.1 ms"], [1, "1 ms"], [10, "10 ms"], [100, "100 ms"], [1000, "1 s"], [10000, "10 s"]].forEach(([ms, l]) => {
    el("line", { x1: X(ms), x2: X(ms), y1: 206, y2: 222, stroke: "#b8b2a7", "stroke-width": 2 });
    el("text", { x: X(ms), y: 244, fill: "#b8b2a7", "font-family": "Geist Mono, monospace", "font-size": 16, "text-anchor": "middle" }, l);
    for (let k = 2; k < 10 && ms < 10000; k++) el("line", { x1: X(ms * k), x2: X(ms * k), y1: 210, y2: 218, stroke: "#5e5862", "stroke-width": 1 });
  });
  const label = (attrs, text) => el("text", { stroke: "#1f1c22", "stroke-width": 8, "paint-order": "stroke", "stroke-linejoin": "round", ...attrs }, text);
  el("line", { x1: X(250), x2: X(250), y1: 16, y2: 214, stroke: "#f2b632", "stroke-width": 3, "stroke-dasharray": "6 6" });
  label({ x: X(250) + 12, y: 40, fill: "#f2b632", "font-family": "Manrope, sans-serif", "font-size": 17, "font-weight": 700 }, "≈ 250 ms");
  label({ x: X(250) + 12, y: 60, fill: "#b8b2a7", "font-family": "Manrope, sans-serif", "font-size": 14 }, "a person reacts to");
  label({ x: X(250) + 12, y: 78, fill: "#b8b2a7", "font-family": "Manrope, sans-serif", "font-size": 14 }, "anything at all");
  const bars = [
    [0.5, 2, 30, "#e5342b", "codex exec · decline · <1–2 ms", 1],
    [3, 5, 72, "#e5342b", "claude -p · cancel · 3–5 ms", 1],
    [1700, 2100, 150, "#2fbf5b", "interactive · after Esc · 1.7–2.1 s", -1],
  ];
  const grow = [];
  bars.forEach(([a, b, y, col, text, side]) => {
    const r = el("rect", { x: X(a), y, width: Math.max(8, X(b) - X(a)), height: 26, fill: col, rx: 2 });
    label({ x: side > 0 ? X(b) + 12 : X(a) - 12, y: y + 19, fill: "#e9e4dc", "font-family": "Geist Mono, monospace", "font-size": 18, "font-weight": 600, "text-anchor": side > 0 ? "start" : "end" }, text);
    grow.push(r);
  });
  if (!reduce) {
    grow.forEach((r) => { r.style.transformOrigin = `${r.getAttribute("x")}px 0`; r.style.transformBox = "view-box"; r.style.transform = "scaleX(0)"; });
    const io2 = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return; io2.disconnect();
      grow.forEach((r, i) => r.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: 200 + i * 350, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }));
    }, { threshold: .5 });
    io2.observe(R);
  }
})();
