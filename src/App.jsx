import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, GanttChartSquare, PieChart as PieIcon, ListOrdered,
  FolderKanban, ScrollText, Settings as SettingsIcon, Plus, Trash2, Pencil, X,
  RefreshCw, Cloud, HardDrive, Eye, Upload, Download
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid
} from "recharts";

/* ================================================================== */
/* DEPLOY CONFIG — fill these in to make the tracker shared (see guide)*/
/* ================================================================== */
const SUPABASE_URL = "";       // e.g. "https://abcdef.supabase.co"
const SUPABASE_ANON_KEY = "";  // public anon key — safe to ship in client code
const ROW_ID = "main";
/* ================================================================== */

const BLUE = "#005EB8";
const DAY = 86400000;
const BUCKETS = ["Active Dev", "Waiting", "Blocked", "Complete"];

/* ---------- Default config (editable in Settings, then persisted) -- */
const DEFAULT_EVENT_DEFS = [
  { name: "Project Assigned - Ready for Dev", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#2563EB", rev: false, closes: false, reopens: false },
  { name: "Project Assigned - Waiting on Team", devState: "Waiting", defaultTeam: "", bucket: "Waiting", color: "#F97316", rev: false, closes: false, reopens: false },
  { name: "Dev Task Complete - Sent to Team", devState: "Waiting", defaultTeam: "", bucket: "Waiting", color: "#F97316", rev: false, closes: false, reopens: false },
  { name: "Work Returned to Dev", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#2563EB", rev: false, closes: false, reopens: false },
  { name: "Sent for Approval", devState: "Waiting", defaultTeam: "Admin", bucket: "Waiting", color: "#F97316", rev: false, closes: false, reopens: false },
  { name: "Approved by Admin", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#16A34A", rev: false, closes: false, reopens: false },
  { name: "Revision Requested - Ready for Dev", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#1D4ED8", rev: true, closes: false, reopens: false },
  { name: "Revision Requested - Waiting on Team", devState: "Waiting", defaultTeam: "", bucket: "Waiting", color: "#F97316", rev: true, closes: false, reopens: false },
  { name: "Blocked", devState: "Blocked", defaultTeam: "", bucket: "Blocked", color: "#6B7280", rev: false, closes: false, reopens: false },
  { name: "Unblocked - Ready for Dev", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#2563EB", rev: false, closes: false, reopens: false },
  { name: "Final Dev Complete", devState: "Dev Complete", defaultTeam: "Dev", bucket: "Complete", color: "#111827", rev: false, closes: true, reopens: false },
  { name: "Project Reopened - Ready for Dev", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#2563EB", rev: true, closes: false, reopens: true },
  { name: "Project Reopened - Waiting on Team", devState: "Waiting", defaultTeam: "", bucket: "Waiting", color: "#F97316", rev: true, closes: false, reopens: true },
];
const DEFAULT_SETTINGS = {
  eventDefs: DEFAULT_EVENT_DEFS,
  teams: ["Dev", "Design", "Copy", "Legal", "Admin", "QA", "Other"],
  enteredBy: ["Goun", "Trevin", "Other"],
  revisionTypes: ["Revision 1", "Revision 2", "Revision 3+", "Graphic Edit", "Copy Edit", "Legal Edit", "QA Fix", "Product Update", "Scope Change", "Other"],
  projectTypes: ["Shogun LP", "Shopify PDP", "Email", "Blog", "Ad Creative", "Website Banner", "Other"],
};

const WAIT_COLORS = { design: "#9333EA", copy: "#EC4899", legal: "#DC2626", admin: "#F97316", qa: "#16A34A", other: "#6B7280" };
const OWNER_COLORS = { dev: "#2563EB", admin: "#F97316", copy: "#EC4899", design: "#9333EA", legal: "#DC2626", qa: "#16A34A", other: "#6B7280", blocked: "#111827" };
const OWNER_ORDER = ["Dev", "Admin", "Copy", "Design", "Legal", "QA", "Other", "Blocked"];
const PALETTE = ["#9333EA", "#EC4899", "#DC2626", "#0891B2", "#CA8A04", "#7C3AED", "#059669", "#DB2777"];

/* ---------- Live config (synced from React state each render) ------ */
function buildCfg(s) {
  return {
    eventDefs: s.eventDefs,
    defMap: Object.fromEntries(s.eventDefs.map(d => [d.name, d])),
    teams: s.teams, enteredBy: s.enteredBy, revisionTypes: s.revisionTypes, projectTypes: s.projectTypes,
  };
}
let CFG = buildCfg(DEFAULT_SETTINGS);

/* ---------- Helpers ------------------------------------------------ */
function waitColor(t) {
  const k = String(t || "").toLowerCase();
  if (WAIT_COLORS[k]) return WAIT_COLORS[k];
  if (!k) return "#F97316";
  let h = 0; for (const c of k) h = (h + c.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}
const ownerColor = o => OWNER_COLORS[String(o || "").toLowerCase()] || waitColor(o);
const defOf = n => CFG.defMap[n] || { name: n, devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#999999", rev: false, closes: false, reopens: false };

function timelineColor(def, team) {
  if (String(def.bucket).toLowerCase() === "waiting") return waitColor(team || def.defaultTeam || "Other");
  return def.color || "#999999";
}
function displayStatus(bucket, team, devState) {
  const b = String(bucket).toLowerCase();
  if (b === "waiting") return team ? "Waiting on " + team : "Waiting";
  if (b === "blocked") return "Blocked";
  if (b === "complete") return "Dev Complete";
  return devState || "Active Dev";
}
function parseDate(v) {
  if (!v) return null;
  const s = typeof v === "string" && v.length === 10 ? v + "T00:00" : v;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

function dueStatus(dueISO, status, completedISO) {
  const due = parseDate(dueISO);
  if (!due) return "No Due Date";
  if (String(status).toLowerCase() === "complete") {
    const c = parseDate(completedISO);
    if (c && startOfDay(c) > startOfDay(due)) return "Completed Late";
    return "Complete";
  }
  const diff = Math.ceil((startOfDay(due) - startOfDay(new Date())) / DAY);
  if (diff < 0) return "Overdue";
  if (diff <= 2) return "Due Soon";
  return "On Track";
}
const requiresTeam = name => {
  const n = String(name).toLowerCase(), b = String(defOf(name).bucket).toLowerCase();
  return b === "waiting" || n.includes("sent to team") || n.includes("waiting on team") || n.includes("returned to dev");
};
function defaultTaskLabel(name) {
  const m = {
    "project assigned - ready for dev": "Project assigned", "project assigned - waiting on team": "Project assigned",
    "revision requested - ready for dev": "Revision requested", "revision requested - waiting on team": "Revision requested",
    "blocked": "Blocked", "unblocked - ready for dev": "Unblocked", "sent for approval": "Sent for approval",
    "approved by admin": "Approved by admin", "final dev complete": "Final dev complete",
    "project reopened - ready for dev": "Project reopened", "project reopened - waiting on team": "Project reopened",
  };
  return m[String(name).toLowerCase()] || "";
}
function defaultTeamFor(name) {
  const def = defOf(name);
  if (String(def.bucket).toLowerCase() === "active dev") return "Dev";
  return def.defaultTeam || "";
}
const fmtD = d => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const fmtDT = d => d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const n1 = v => (typeof v === "number" && isFinite(v)) ? v.toFixed(1) : "";
const toInput = d => { const x = new Date(d); const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };

/* ---------- Engine ------------------------------------------------- */
function resolveEvent(ev) {
  const d = defOf(ev.devEvent);
  const team = ev.relatedTeam || d.defaultTeam || "";
  return {
    ...ev, ts: parseDate(ev.ts), devState: d.devState, bucket: d.bucket, relatedTeam: team,
    countsRevision: d.rev, closes: d.closes, reopens: d.reopens,
    color: timelineColor(d, team), displayStatus: displayStatus(d.bucket, team, d.devState),
    taskLabel: ev.taskLabel || ev.devEvent,
  };
}
function buildModel(events, projects) {
  const byProj = {};
  events.forEach(e => {
    if (!projects[e.projectId]) return;
    const r = resolveEvent(e);
    if (!r.ts) return;
    (byProj[e.projectId] = byProj[e.projectId] || []).push(r);
  });
  Object.values(byProj).forEach(arr => arr.sort((a, b) => a.ts - b.ts));
  const segs = [];
  const now = new Date();
  Object.keys(byProj).forEach(pid => {
    const evs = byProj[pid];
    evs.forEach((e, i) => {
      const next = evs[i + 1];
      let start = e.ts, end = next ? next.ts : now;
      const stopped = String(e.bucket).toLowerCase() === "complete";
      if (stopped) end = start;
      if (!start || !end || end < start) return;
      segs.push({
        projectId: pid, projectName: projects[pid].name, start, end,
        devEvent: e.devEvent, devState: e.devState, relatedTeam: e.relatedTeam, bucket: e.bucket,
        durationDays: stopped ? 0 : Math.max((end - start) / DAY, 0), color: e.color,
        taskLabel: e.taskLabel, revisionType: e.revisionType, notes: e.notes, enteredBy: e.enteredBy,
        countsRevision: e.countsRevision, reopens: e.reopens, displayStatus: e.displayStatus,
      });
    });
  });
  return { segs, byProj };
}
function metricsFor(pid, projects, segs, byProj) {
  const p = projects[pid];
  const ps = segs.filter(s => s.projectId === pid).sort((a, b) => a.start - b.start);
  const pe = byProj[pid] || [];
  const latest = ps.length ? ps[ps.length - 1] : null;
  const latestEv = pe.length ? pe[pe.length - 1] : null;
  const now = new Date();
  const sum = b => ps.filter(s => String(s.bucket).toLowerCase() === b).reduce((a, s) => a + (s.durationDays || 0), 0);
  const active = sum("active dev"), wait = sum("waiting"), blocked = sum("blocked");
  const revisions = pe.filter(e => e.countsRevision).length;
  const reopens = pe.filter(e => e.reopens).length;
  const complete = latest && String(latest.bucket).toLowerCase() === "complete";
  const completedDate = complete && latestEv ? latestEv.ts : null;
  const projectStatus = latest ? (complete ? "Complete" : "Active") : "Not Started";
  const start = parseDate(p.startDate) || (pe.length ? pe[0].ts : null);
  const daysOpen = start ? Math.max(((completedDate || now) - start) / DAY, 0) : "";
  return {
    project: p, projectStatus, completedDate, daysOpen, active, wait, blocked, revisions, reopens,
    currentDevState: latest ? latest.devState : "", waitingOn: latest && String(latest.bucket).toLowerCase() === "waiting" ? latest.relatedTeam : "",
    since: latest ? latest.start : "", currentStateDays: latest ? latest.durationDays : "",
    dueStatus: dueStatus(p.dueDate, projectStatus, completedDate), lastEvent: latestEv ? latestEv.ts : "",
  };
}
function ownerOf(seg) {
  const b = String(seg.bucket).toLowerCase();
  if (b === "active dev") return "Dev";
  if (b === "waiting") return seg.relatedTeam || "Other";
  if (b === "blocked") return "Blocked";
  return "";
}

/* ---------- CSV import / export ----------------------------------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function importEventsCSV(text, existing) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { error: "Need a header row plus at least one data row." };
  const head = rows[0].map(norm);
  const col = keys => { for (const k of keys) { const i = head.indexOf(norm(k)); if (i !== -1) return i; } return -1; };
  const ci = {
    ts: col(["Timestamp"]), pid: col(["Project ID"]), pname: col(["Project Name"]), ev: col(["Dev Event"]),
    team: col(["Related Team"]), task: col(["Task / Change Label", "Task Label"]), rev: col(["Revision / Change Type", "Revision Type"]),
    notes: col(["Notes"]), by: col(["Entered By"]),
  };
  if (ci.ev === -1 || (ci.pid === -1 && ci.pname === -1)) return { error: "Couldn't find required columns (need Dev Event and Project ID or Name)." };
  const get = (r, i) => (i === -1 ? "" : String(r[i] ?? "").trim());
  const events = []; const projStub = {}; let skipped = 0;
  rows.slice(1).forEach((r, idx) => {
    const ev = get(r, ci.ev);
    let pid = get(r, ci.pid);
    const pname = get(r, ci.pname) || pid;
    if (!pid && pname) pid = norm(pname).slice(0, 16) || "proj" + idx;
    const d = parseDate(get(r, ci.ts));
    if (!ev || !pid || !d) { skipped++; return; }
    if (!projStub[pid]) projStub[pid] = { id: pid, name: pname || pid, type: "Other", owner: "", startDate: "", dueDate: "" };
    events.push({
      id: "imp" + Date.now() + "_" + idx, projectId: pid, ts: toInput(d), devEvent: ev,
      relatedTeam: get(r, ci.team), taskLabel: get(r, ci.task), revisionType: get(r, ci.rev), notes: get(r, ci.notes), enteredBy: get(r, ci.by),
    });
  });
  const have = new Set(existing.map(p => p.id));
  return { events, newProjects: Object.values(projStub).filter(p => !have.has(p.id)), skipped, count: events.length };
}
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportEventsCSV(events, projMap) {
  const head = ["Timestamp", "Project ID", "Project Name", "Dev Event", "Dev State", "Related Team", "Time Bucket", "Task / Change Label", "Revision / Change Type", "Notes", "Entered By"];
  const lines = [head.join(",")];
  [...events].sort((a, b) => new Date(a.ts) - new Date(b.ts)).forEach(e => {
    const d = defOf(e.devEvent);
    lines.push([e.ts, e.projectId, projMap[e.projectId]?.name || "", e.devEvent, d.devState, e.relatedTeam || d.defaultTeam || "", d.bucket, e.taskLabel || "", e.revisionType || "", e.notes || "", e.enteredBy || ""].map(csvCell).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "event-log.csv"; a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Seed data (illustrative) ------------------------------ */
const SEED = {
  projects: [
    { id: "tzo-brc", name: "TZ Blue Raspberry Creatine", type: "Shogun LP", owner: "Dev", startDate: "2026-06-16", dueDate: "2026-06-23" },
    { id: "test", name: "Test Project", type: "Shogun LP", owner: "Dev", startDate: "2026-06-17", dueDate: "2026-06-19" },
  ],
  events: [
    ["tzo-brc", "2026-06-16T13:19", "Project Assigned - Ready for Dev", "Dev", "Project assigned", "", "Kickoff", "Trevin"],
    ["tzo-brc", "2026-06-17T13:19", "Dev Task Complete - Sent to Team", "Admin", "Build sent for review", "", "", "Trevin"],
    ["tzo-brc", "2026-06-19T13:19", "Work Returned to Dev", "Admin", "Review returned", "", "", "Trevin"],
    ["tzo-brc", "2026-06-19T16:00", "Dev Task Complete - Sent to Team", "Admin", "Revisions sent", "", "", "Trevin"],
    ["tzo-brc", "2026-06-22T09:00", "Revision Requested - Waiting on Team", "Legal", "Legal review requested", "Legal Edit", "Waiting on legal sign-off", "Goun"],
    ["test", "2026-06-17T09:00", "Project Assigned - Ready for Dev", "Dev", "Project assigned", "", "", "Trevin"],
    ["test", "2026-06-17T13:00", "Dev Task Complete - Sent to Team", "Copy", "Copy requested", "", "", "Trevin"],
    ["test", "2026-06-18T09:00", "Work Returned to Dev", "Copy", "Copy received", "Copy Edit", "", "Trevin"],
    ["test", "2026-06-18T12:00", "Sent for Approval", "Admin", "Sent for approval", "", "", "Trevin"],
    ["test", "2026-06-18T18:00", "Approved by Admin", "Dev", "Approved", "", "", "Goun"],
    ["test", "2026-06-18T20:00", "Dev Task Complete - Sent to Team", "QA", "QA check", "", "", "Trevin"],
    ["test", "2026-06-19T09:00", "Work Returned to Dev", "QA", "QA passed", "QA Fix", "", "Trevin"],
    ["test", "2026-06-19T10:00", "Final Dev Complete", "Dev", "Final dev complete", "", "", "Trevin"],
    ["test", "2026-06-19T10:30", "Project Reopened - Waiting on Team", "Admin", "Reopened for change", "Scope Change", "", "Goun"],
    ["test", "2026-06-19T11:00", "Work Returned to Dev", "Admin", "Change returned", "", "", "Trevin"],
    ["test", "2026-06-19T11:30", "Final Dev Complete", "Dev", "Final dev complete", "", "", "Trevin"],
    ["test", "2026-06-19T12:00", "Project Reopened - Waiting on Team", "Legal", "Reopened for legal", "Legal Edit", "", "Goun"],
    ["test", "2026-06-19T12:11", "Final Dev Complete", "Dev", "Final dev complete", "", "", "Trevin"],
  ].map((r, i) => ({ id: "seed-" + i, projectId: r[0], ts: r[1], devEvent: r[2], relatedTeam: r[3], taskLabel: r[4], revisionType: r[5], notes: r[6], enteredBy: r[7] })),
};

/* ---------- Storage adapter --------------------------------------- */
const CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const ARTIFACT_STORE = typeof window !== "undefined" && window.storage;
const KEY = "dt:data:v1";
const STORAGE_MODE = CLOUD ? "cloud" : "local";
async function cloudGet() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker?id=eq.${ROW_ID}&select=data`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!r.ok) throw new Error("cloud get " + r.status);
  const rows = await r.json();
  return rows[0] ? rows[0].data : null;
}
async function cloudSet(d) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: ROW_ID, data: d }),
  });
  if (!r.ok) throw new Error("cloud set " + r.status);
}
async function loadData() {
  if (CLOUD) { try { return await cloudGet(); } catch (e) { console.error(e); return null; } }
  if (ARTIFACT_STORE) { try { const r = await window.storage.get(KEY); return r ? JSON.parse(r.value) : null; } catch { return null; } }
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function saveData(d) {
  if (CLOUD) { try { await cloudSet(d); } catch (e) { console.error(e); } return; }
  if (ARTIFACT_STORE) { try { await window.storage.set(KEY, JSON.stringify(d)); } catch (e) {} return; }
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}
const READONLY = typeof window !== "undefined" && /[?&](readonly|view)=1/.test(window.location.search);

/* ---------- UI atoms ----------------------------------------------- */
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200";
const Pill = ({ bg, fg, children }) => <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: bg, color: fg }}>{children}</span>;
function dueBadge(s) {
  const map = { "overdue": ["#F4CCCC", "#990000"], "due soon": ["#FFF2CC", "#B45F06"], "on track": ["#D9EAD3", "#274E13"], "complete": ["#D9EAD3", "#274E13"], "completed late": ["#FCE5CD", "#990000"], "no due date": ["#EFEFEF", "#666"] }[String(s).toLowerCase()] || ["#EFEFEF", "#666"];
  return <Pill bg={map[0]} fg={map[1]}>{s}</Pill>;
}
function stateBadge(state, waitingOn) {
  const s = String(state).toLowerCase();
  let bg = "#EFEFEF", fg = "#374151";
  if (s === "waiting") { bg = waitColor(waitingOn || "Other"); fg = "#fff"; }
  else if (s === "active dev") { bg = "#2563EB"; fg = "#fff"; }
  else if (s === "dev complete" || s === "complete") { bg = "#111827"; fg = "#fff"; }
  else if (s === "blocked") { bg = "#6B7280"; fg = "#fff"; }
  return <Pill bg={bg} fg={fg}>{waitingOn && s === "waiting" ? "Waiting · " + waitingOn : state}</Pill>;
}
const Card = ({ children, className = "" }) => <div className={"rounded-xl border border-gray-200 bg-white " + className}>{children}</div>;
const SectionTitle = ({ children }) => <div className="px-4 py-2.5 text-sm font-bold text-white rounded-t-xl" style={{ background: BLUE }}>{children}</div>;

/* ================================================================== */
/* Main App                                                            */
/* ================================================================== */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("dashboard");
  const [eventForm, setEventForm] = useState(null);
  const [projForm, setProjForm] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const firstSave = useRef(true);

  CFG = useMemo(() => buildCfg(settings), [settings]);

  async function pull() {
    setSyncing(true);
    const d = await loadData();
    if (d) { setProjects(d.projects || []); setEvents(d.events || []); setSettings(d.settings || DEFAULT_SETTINGS); }
    else if (!loaded) { setProjects(SEED.projects); setEvents(SEED.events); setSettings(DEFAULT_SETTINGS); }
    setSyncing(false); setLoaded(true);
  }
  useEffect(() => { pull(); }, []);
  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) { firstSave.current = false; return; }
    saveData({ projects, events, settings });
  }, [projects, events, settings, loaded]);

  const projMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const { segs, byProj } = useMemo(() => buildModel(events, projMap), [events, projMap, settings]);
  const metrics = useMemo(() => projects.map(p => metricsFor(p.id, projMap, segs, byProj)), [projects, projMap, segs, byProj, settings]);

  const addEnteredBy = name => setSettings(s => (!name || s.enteredBy.includes(name)) ? s : { ...s, enteredBy: [...s.enteredBy.filter(x => x !== "Other"), name, "Other"] });

  if (!loaded) return <div className="p-8 text-gray-500">Loading tracker…</div>;

  const TABS = [
    ["dashboard", "Dashboard", LayoutDashboard], ["timeline", "Timeline", GanttChartSquare],
    ["charts", "Charts", PieIcon], ["projects", "Projects", FolderKanban],
    ["flow", "Event Flow", ListOrdered], ["log", "Event Log", ScrollText],
    ["settings", "Settings", SettingsIcon],
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div className="text-white" style={{ background: BLUE }}>
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80">Nutricost · Web Dev</div>
            <h1 className="text-lg font-bold leading-tight">Dev Completion Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
              {STORAGE_MODE === "cloud" ? <><Cloud size={13} /> Shared</> : <><HardDrive size={13} /> Local</>}
            </span>
            {READONLY && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold"><Eye size={13} /> View only</span>}
            <button onClick={pull} title="Refresh" className="rounded-lg bg-white/15 p-2 hover:bg-white/25"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} /></button>
            {!READONLY && <button onClick={() => setEventForm({})} className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-bold" style={{ color: BLUE }}><Plus size={16} /> Log Event</button>}
          </div>
        </div>
        <div className="w-full px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={"flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-semibold border-b-2 " + (tab === k ? "border-white text-white" : "border-transparent text-white/70 hover:text-white")}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 py-5">
        {projects.length === 0 && <Card className="p-6 text-center text-gray-500">No projects yet. {READONLY ? "" : <>Add one in <b>Projects</b>, then log events.</>}</Card>}
        {tab === "dashboard" && <Dashboard metrics={metrics} segs={segs} />}
        {tab === "timeline" && <Timeline segs={segs} projects={projects} />}
        {tab === "charts" && <Charts metrics={metrics} segs={segs} />}
        {tab === "projects" && <Projects metrics={metrics} readOnly={READONLY} onAdd={() => setProjForm({})} onEdit={p => setProjForm(p)} onDelete={id => { setProjects(ps => ps.filter(p => p.id !== id)); setEvents(es => es.filter(e => e.projectId !== id)); }} />}
        {tab === "flow" && <EventFlow segs={segs} projects={projects} />}
        {tab === "log" && <EventLog events={events} projMap={projMap} readOnly={READONLY} onEdit={e => setEventForm(e)} onDelete={id => setEvents(es => es.filter(e => e.id !== id))} />}
        {tab === "settings" && <SettingsView readOnly={READONLY} settings={settings} setSettings={setSettings} events={events} projMap={projMap}
          onReset={() => { setProjects(SEED.projects); setEvents(SEED.events); setSettings(DEFAULT_SETTINGS); }}
          onClear={() => { setProjects([]); setEvents([]); }}
          onImport={(evs, newProjs) => { setEvents(evs); setProjects(ps => { const ids = new Set(ps.map(p => p.id)); return [...ps, ...newProjs.filter(p => !ids.has(p.id))]; }); }} />}
      </div>

      {eventForm && !READONLY && <EventModal initial={eventForm} projects={projects} onAddEnteredBy={addEnteredBy} onClose={() => setEventForm(null)}
        onSave={ev => { setEvents(es => ev.id ? es.map(e => e.id === ev.id ? ev : e) : [...es, { ...ev, id: "e" + Date.now() }]); setEventForm(null); }} />}
      {projForm && !READONLY && <ProjectModal initial={projForm} existingIds={projects.map(p => p.id)} onClose={() => setProjForm(null)}
        onSave={p => { setProjects(ps => ps.some(x => x.id === p.id) ? ps.map(x => x.id === p.id ? p : x) : [...ps, p]); setProjForm(null); }} />}
    </div>
  );
}

/* ---------- Dashboard ---------------------------------------------- */
function StatCard({ label, value, caption, bg, fg }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4" style={{ background: bg }}>
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: fg }}>{label}</div>
      <div className="mt-1 text-3xl font-extrabold" style={{ color: fg }}>{value}</div>
      <div className="text-xs italic" style={{ color: fg, opacity: .8 }}>{caption}</div>
    </div>
  );
}
function Dashboard({ metrics, segs }) {
  const active = metrics.filter(m => m.projectStatus.toLowerCase() !== "complete");
  const done = metrics.filter(m => m.projectStatus.toLowerCase() === "complete");
  const waiting = active.filter(m => m.currentDevState.toLowerCase() === "waiting" || m.waitingOn).length;
  const dueAtt = active.filter(m => ["due soon", "overdue"].includes(m.dueStatus.toLowerCase())).length;
  const teamRows = teamTime(segs);
  const activeByProj = bucketByProj(segs, "active dev");
  const revRows = [...metrics].filter(m => m.revisions || m.reopens).sort((a, b) => (b.revisions + b.reopens) - (a.revisions + a.reopens));
  const Th = ({ children, r }) => <th className={"px-3 py-2 text-xs font-bold text-gray-600 " + (r ? "text-right" : "text-left")}>{children}</th>;
  const Td = ({ children, r }) => <td className={"px-3 py-2 text-sm " + (r ? "text-right tabular-nums" : "")}>{children}</td>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open Projects" value={active.length} caption="active or not started" bg="#EAF3FF" fg={BLUE} />
        <StatCard label="Waiting on Team" value={waiting} caption="dev is blocked externally" bg="#FFF2CC" fg="#B45F06" />
        <StatCard label="Due Soon / Overdue" value={dueAtt} caption="needs date attention" bg="#FCE5CD" fg="#990000" />
        <StatCard label="Completed" value={done.length} caption="finished dev work" bg="#D9EAD3" fg="#274E13" />
      </div>
      <Card>
        <SectionTitle>Queue / Current Status</SectionTitle>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full">
            <thead className="bg-blue-50/60"><tr><Th>Project</Th><Th>Due</Th><Th>Status</Th><Th r>Days Here</Th><Th r>Active Dev</Th><Th r>Wait</Th><Th r>Rev</Th><Th r>Reopen</Th><Th>Due Status</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {active.length === 0 && <tr><Td><span className="text-gray-400 italic">No current dev work.</span></Td></tr>}
              {active.map((m, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <Td><span className="font-semibold">{m.project.name}</span></Td>
                  <Td>{m.project.dueDate ? fmtD(parseDate(m.project.dueDate)) : "—"}</Td>
                  <Td>{stateBadge(m.currentDevState || m.projectStatus, m.waitingOn)}</Td>
                  <Td r>{n1(m.currentStateDays)}</Td><Td r>{n1(m.active)}</Td><Td r>{n1(m.wait)}</Td><Td r>{m.revisions}</Td><Td r>{m.reopens}</Td><Td>{dueBadge(m.dueStatus)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {done.length > 0 && (
        <Card>
          <SectionTitle>Completed Projects</SectionTitle>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full">
              <thead className="bg-blue-50/60"><tr><Th>Project</Th><Th>Completed</Th><Th r>Project Days</Th><Th r>Active Dev</Th><Th r>Wait</Th><Th r>Rev</Th><Th r>Reopen</Th><Th>Due Status</Th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {done.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <Td><span className="font-semibold">{m.project.name}</span></Td><Td>{fmtDT(m.completedDate)}</Td><Td r>{n1(m.daysOpen)}</Td><Td r>{n1(m.active)}</Td><Td r>{n1(m.wait)}</Td><Td r>{m.revisions}</Td><Td r>{m.reopens}</Td><Td>{dueBadge(m.dueStatus)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <SectionTitle>Total Time by Team / Owner</SectionTitle>
          <div className="p-4 space-y-2">
            {teamRows.length === 0 && <div className="text-sm text-gray-400 italic">No data yet.</div>}
            {teamRows.map(r => { const max = teamRows[0].days || 1; return (
              <div key={r.team} className="flex items-center gap-2">
                <div className="w-20 text-sm font-medium">{r.team}</div>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden"><div className="h-full rounded" style={{ width: (r.days / max * 100) + "%", background: r.team === "Dev" ? "#2563EB" : waitColor(r.team) }} /></div>
                <div className="w-12 text-right text-sm font-bold tabular-nums">{n1(r.days)}d</div>
              </div>
            ); })}
          </div>
        </Card>
        <Card>
          <SectionTitle>Active Dev Time by Project</SectionTitle>
          <div className="p-4 space-y-2">
            {activeByProj.length === 0 && <div className="text-sm text-gray-400 italic">No data yet.</div>}
            {activeByProj.map(r => { const max = activeByProj[0].days || 1; return (
              <div key={r.name} className="flex items-center gap-2">
                <div className="w-40 truncate text-sm font-medium" title={r.name}>{r.name}</div>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden"><div className="h-full rounded" style={{ width: (r.days / max * 100) + "%", background: "#16A34A" }} /></div>
                <div className="w-12 text-right text-sm font-bold tabular-nums">{n1(r.days)}d</div>
              </div>
            ); })}
          </div>
        </Card>
      </div>
      <Card>
        <SectionTitle>Revision / Reopen Counts</SectionTitle>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full">
            <thead className="bg-blue-50/60"><tr><Th>Project</Th><Th r>Revisions</Th><Th r>Reopens</Th><Th>Current Status</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {revRows.length === 0 && <tr><Td><span className="text-gray-400 italic">No revisions logged.</span></Td></tr>}
              {revRows.map((m, i) => (
                <tr key={i} className="hover:bg-gray-50"><Td><span className="font-semibold">{m.project.name}</span></Td><Td r>{m.revisions}</Td><Td r>{m.reopens}</Td><Td>{stateBadge(m.currentDevState || m.projectStatus, m.waitingOn)}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
function teamTime(segs) {
  const t = {};
  segs.forEach(s => { const b = String(s.bucket).toLowerCase(); if (b !== "active dev" && b !== "waiting") return; const team = b === "active dev" ? "Dev" : (s.relatedTeam || "Other"); t[team] = (t[team] || 0) + (s.durationDays || 0); });
  return Object.entries(t).map(([team, days]) => ({ team, days })).sort((a, b) => a.team === "Dev" ? -1 : b.team === "Dev" ? 1 : b.days - a.days);
}
function bucketByProj(segs, bucket) {
  const t = {};
  segs.forEach(s => { if (String(s.bucket).toLowerCase() === bucket) t[s.projectName] = (t[s.projectName] || 0) + (s.durationDays || 0); });
  return Object.entries(t).map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days);
}

/* ---------- Timeline (desktop Gantt + mobile list) ----------------- */
function Timeline({ segs, projects }) {
  const [tip, setTip] = useState(null);
  const valid = segs.filter(s => s.start && s.end);
  if (!valid.length) return <Card className="p-6 text-gray-400 italic">No timeline data yet. Log some events.</Card>;
  const legend = [{ l: "Active Dev", c: "#2563EB" }, ...CFG.teams.filter(t => t !== "Dev").map(t => ({ l: t, c: waitColor(t) })), { l: "Blocked", c: "#6B7280" }, { l: "Dev Complete", c: "#111827" }];
  return (
    <div className="space-y-5">
      <Card className="p-3"><div className="flex flex-wrap gap-1.5">{legend.map(x => <Pill key={x.l} bg={x.c} fg="#fff">{x.l}</Pill>)}</div></Card>
      {projects.filter(p => valid.some(s => s.projectId === p.id)).map(p => {
        const ps = valid.filter(s => s.projectId === p.id).sort((a, b) => a.start - b.start);
        const min = startOfDay(new Date(Math.min(...ps.map(s => startOfDay(s.start).getTime()))));
        const max = startOfDay(new Date(Math.max(...ps.map(s => startOfDay(s.end).getTime()))));
        const nDays = daysBetween(min, max) + 1;
        const days = Array.from({ length: nDays }, (_, i) => { const d = new Date(min); d.setDate(d.getDate() + i); return d; });
        const laneEnd = [];
        const placed = ps.map(s => {
          const sc = daysBetween(min, startOfDay(s.start));
          const ec = Math.max(daysBetween(min, startOfDay(s.end)), sc);
          let lane = 0; while (laneEnd[lane] !== undefined && sc <= laneEnd[lane]) lane++;
          laneEnd[lane] = ec; return { s, lane, sc, ec };
        });
        const lanes = Math.max(laneEnd.length, 1);
        const totalA = ps.filter(s => String(s.bucket).toLowerCase() === "active dev").reduce((a, s) => a + s.durationDays, 0);
        const totalW = ps.filter(s => String(s.bucket).toLowerCase() === "waiting").reduce((a, s) => a + s.durationDays, 0);
        const grid = { display: "grid", gridTemplateColumns: `repeat(${nDays}, minmax(46px, 1fr))`, gap: "2px" };
        return (
          <Card key={p.id} className="overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-bold text-white flex flex-wrap gap-x-3 gap-y-0.5 items-baseline" style={{ background: BLUE }}>
              <span>{p.name}</span>
              <span className="text-xs font-normal opacity-80">{ps.length} steps · active {n1(totalA)}d · wait {n1(totalW)}d · {fmtD(ps[0].start)} → {fmtD(ps[ps.length - 1].end)}</span>
            </div>
            {/* Desktop Gantt */}
            <div className="hidden sm:block overflow-x-auto no-scrollbar p-3">
              <div style={{ minWidth: nDays * 48 }}>
                <div style={grid} className="mb-1.5">{days.map((d, i) => <div key={i} className="text-center text-[11px] font-semibold text-gray-500">{(d.getMonth() + 1) + "/" + d.getDate()}</div>)}</div>
                {Array.from({ length: lanes }, (_, lane) => (
                  <div key={lane} style={grid} className="mb-0.5">
                    {placed.filter(pl => pl.lane === lane).map((pl, idx) => (
                      <div key={idx}
                        onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, s: pl.s })}
                        onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, s: pl.s })}
                        onMouseLeave={() => setTip(null)}
                        style={{ gridColumn: `${pl.sc + 1} / ${pl.ec + 2}`, background: pl.s.color, minHeight: 34 }}
                        className="rounded flex items-center justify-center px-1 text-center text-[11px] font-bold text-white leading-tight cursor-default">
                        <span className="truncate">{pl.s.displayStatus}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Mobile vertical list with notes */}
            <div className="sm:hidden divide-y divide-gray-100">
              {ps.map((s, i) => (
                <div key={i} className="flex gap-2.5 p-3">
                  <div className="w-1.5 shrink-0 rounded" style={{ background: s.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: s.color }}>{s.displayStatus}</span>
                      <span className="text-xs text-gray-500 shrink-0">{n1(s.durationDays)}d</span>
                    </div>
                    <div className="text-xs text-gray-500">{fmtDT(s.start)} → {fmtDT(s.end)}</div>
                    {s.taskLabel && <div className="text-sm mt-0.5">{s.taskLabel}</div>}
                    {s.notes && <div className="text-xs text-gray-600 mt-0.5">{s.notes}</div>}
                    {s.enteredBy && <div className="text-[11px] text-gray-400 mt-0.5">by {s.enteredBy}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {tip && (
        <div className="fixed z-50 pointer-events-none w-56 rounded-lg bg-gray-900 text-white text-xs p-2.5 shadow-xl"
          style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240), top: tip.y + 14 }}>
          <div className="font-bold">{tip.s.displayStatus}</div>
          {tip.s.taskLabel && <div className="mt-0.5">{tip.s.taskLabel}</div>}
          <div className="opacity-80 mt-0.5">{fmtDT(tip.s.start)} → {fmtDT(tip.s.end)} · {n1(tip.s.durationDays)}d</div>
          {tip.s.notes && <div className="opacity-90 mt-1 border-t border-white/15 pt-1">{tip.s.notes}</div>}
          {tip.s.enteredBy && <div className="opacity-60 mt-0.5">by {tip.s.enteredBy}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- Charts ------------------------------------------------- */
function Charts({ metrics, segs }) {
  const rows = metrics.filter(m => (m.active + m.wait + m.blocked) > 0).map(m => ({ name: m.project.name, "Active Dev": +m.active.toFixed(2), Waiting: +m.wait.toFixed(2), Blocked: +m.blocked.toFixed(2), total: m.daysOpen || (m.active + m.wait + m.blocked) })).slice(0, 12);
  if (!rows.length) return <Card className="p-6 text-gray-400 italic">No chart data yet. Log events with some elapsed time.</Card>;
  const ownerData = {}; const ownerSet = {};
  segs.forEach(s => { const o = ownerOf(s); if (!o) return; const k = s.projectName; ownerData[k] = ownerData[k] || { name: k }; ownerData[k][o] = (ownerData[k][o] || 0) + (s.durationDays || 0); ownerSet[o] = true; });
  const owners = [...OWNER_ORDER.filter(o => ownerSet[o]), ...Object.keys(ownerSet).filter(o => !OWNER_ORDER.includes(o))];
  const ownerRows = Object.values(ownerData);
  const q = {};
  metrics.forEach(m => { const st = m.projectStatus.toLowerCase(), ds = m.currentDevState.toLowerCase(); let key = "Not Started"; if (st === "complete" || ds === "dev complete") key = "Complete"; else if (ds === "waiting" || m.waitingOn) key = "Waiting"; else if (ds === "blocked") key = "Blocked"; else if (ds === "active dev") key = "Active Dev"; q[key] = (q[key] || 0) + 1; });
  const qData = Object.entries(q).map(([name, value]) => ({ name, value }));
  const qColor = { "Active Dev": "#2563EB", "Waiting": "#F97316", "Blocked": "#6B7280", "Complete": "#111827", "Not Started": "#D1D5DB" };
  const projDays = rows.map(r => ({ name: r.name, days: +(r.total || 0).toFixed(1) })).sort((a, b) => b.days - a.days);
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <SectionTitle>Project Time Mix (% of tracked time)</SectionTitle>
        <div className="p-3" style={{ height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={rows} stackOffset="expand" margin={{ top: 8, right: 8, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={50} />
              <YAxis tickFormatter={v => Math.round(v * 100) + "%"} tick={{ fontSize: 11 }} /><Tooltip formatter={v => n1(v) + "d"} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Active Dev" stackId="a" fill="#2563EB" /><Bar dataKey="Waiting" stackId="a" fill="#F97316" /><Bar dataKey="Blocked" stackId="a" fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionTitle>Time by Owner (% of tracked time)</SectionTitle>
        <div className="p-3" style={{ height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={ownerRows} layout="vertical" stackOffset="expand" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={v => Math.round(v * 100) + "%"} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => n1(v) + "d"} /><Legend wrapperStyle={{ fontSize: 12 }} />
              {owners.map(o => <Bar key={o} dataKey={o} stackId="o" fill={ownerColor(o)} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionTitle>Total Project Days</SectionTitle>
        <div className="p-3" style={{ height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={projDays} margin={{ top: 8, right: 8, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={50} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={v => v + "d"} />
              <Bar dataKey="days" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <SectionTitle>Current Queue</SectionTitle>
        <div className="p-3" style={{ height: 300 }}>
          <ResponsiveContainer>
            <PieChart><Pie data={qData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>{qData.map((e, i) => <Cell key={i} fill={qColor[e.name] || "#ccc"} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Event Flow --------------------------------------------- */
function EventFlow({ segs, projects }) {
  const valid = segs.filter(s => s.start && s.end);
  if (!valid.length) return <Card className="p-6 text-gray-400 italic">No event flow data yet.</Card>;
  const Th = ({ children, r }) => <th className={"px-3 py-2 text-xs font-bold text-gray-600 " + (r ? "text-right" : "text-left")}>{children}</th>;
  const Td = ({ children, r }) => <td className={"px-3 py-2 text-sm " + (r ? "text-right tabular-nums" : "")}>{children}</td>;
  return (
    <div className="space-y-5">
      {projects.filter(p => valid.some(s => s.projectId === p.id)).map(p => {
        const ps = valid.filter(s => s.projectId === p.id).sort((a, b) => a.start - b.start);
        return (
          <Card key={p.id} className="overflow-hidden">
            <SectionTitle>{p.name}</SectionTitle>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full">
                <thead className="bg-blue-50/60"><tr><Th>#</Th><Th>Status</Th><Th>Owner</Th><Th>Start</Th><Th>End</Th><Th r>Days</Th><Th>Task / Change</Th><Th>Notes</Th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {ps.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50 align-top">
                      <Td r>{i + 1}</Td><Td><span className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: s.color }}>{s.displayStatus}</span></Td>
                      <Td>{s.relatedTeam || "—"}</Td><Td>{fmtDT(s.start)}</Td><Td>{fmtDT(s.end)}</Td><Td r>{n1(s.durationDays)}</Td>
                      <Td>{s.taskLabel}{s.revisionType ? <span className="block text-xs text-gray-500">{s.revisionType}</span> : null}</Td>
                      <Td><span className="text-xs text-gray-500">{s.notes}{s.enteredBy ? (s.notes ? " · " : "") + "by " + s.enteredBy : ""}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Projects ----------------------------------------------- */
function Projects({ metrics, readOnly, onAdd, onEdit, onDelete }) {
  const Th = ({ children, r }) => <th className={"px-3 py-2 text-xs font-bold text-gray-600 " + (r ? "text-right" : "text-left")}>{children}</th>;
  const Td = ({ children, r }) => <td className={"px-3 py-2 text-sm " + (r ? "text-right tabular-nums" : "")}>{children}</td>;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ background: BLUE }}>
        <span className="text-sm font-bold">Projects</span>
        {!readOnly && <button onClick={onAdd} className="flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/25"><Plus size={14} /> Add Project</button>}
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full">
          <thead className="bg-blue-50/60"><tr><Th>ID</Th><Th>Name</Th><Th>Type</Th><Th>Owner</Th><Th>Due</Th><Th>Status</Th><Th>Current State</Th><Th r>Active Dev</Th><Th r>Wait</Th><Th r>Rev</Th><Th>Due Status</Th>{!readOnly && <Th></Th>}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {metrics.length === 0 && <tr><Td><span className="text-gray-400 italic">No projects.</span></Td></tr>}
            {metrics.map((m, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <Td><span className="font-mono text-xs">{m.project.id}</span></Td><Td><span className="font-semibold">{m.project.name}</span></Td><Td>{m.project.type}</Td><Td>{m.project.owner}</Td>
                <Td>{m.project.dueDate ? fmtD(parseDate(m.project.dueDate)) : "—"}</Td>
                <Td><Pill bg={m.projectStatus === "Complete" ? "#D9EAD3" : m.projectStatus === "Active" ? "#EAF3FF" : "#F3F4F6"} fg={m.projectStatus === "Complete" ? "#274E13" : m.projectStatus === "Active" ? BLUE : "#374151"}>{m.projectStatus}</Pill></Td>
                <Td>{m.currentDevState ? stateBadge(m.currentDevState, m.waitingOn) : "—"}</Td>
                <Td r>{n1(m.active)}</Td><Td r>{n1(m.wait)}</Td><Td r>{m.revisions}</Td><Td>{dueBadge(m.dueStatus)}</Td>
                {!readOnly && <Td><div className="flex gap-1 justify-end"><button onClick={() => onEdit(m.project)} className="rounded p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil size={15} /></button><button onClick={() => { if (confirm("Delete " + m.project.name + " and its events?")) onDelete(m.project.id); }} className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button></div></Td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Event Log ---------------------------------------------- */
function EventLog({ events, projMap, readOnly, onEdit, onDelete }) {
  const rows = [...events].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">{children}</th>;
  const Td = ({ children }) => <td className="px-3 py-2 text-sm align-top">{children}</td>;
  return (
    <Card className="overflow-hidden">
      <SectionTitle>Event Log · source of truth ({events.length})</SectionTitle>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full">
          <thead className="bg-blue-50/60"><tr><Th>Timestamp</Th><Th>Project</Th><Th>Dev Event</Th><Th>Team</Th><Th>Task / Change</Th><Th>By</Th>{!readOnly && <Th></Th>}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><Td><span className="text-gray-400 italic">No events logged.</span></Td></tr>}
            {rows.map(e => {
              const def = defOf(e.devEvent);
              return (
                <tr key={e.id} className="hover:bg-gray-50">
                  <Td>{fmtDT(parseDate(e.ts))}</Td><Td>{projMap[e.projectId]?.name || <span className="text-red-500">missing</span>}</Td>
                  <Td><span className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: timelineColor(def, e.relatedTeam) }}>{e.devEvent}</span></Td>
                  <Td>{e.relatedTeam || "—"}</Td><Td>{e.taskLabel}{e.revisionType ? <span className="block text-xs text-gray-500">{e.revisionType}</span> : null}</Td><Td>{e.enteredBy}</Td>
                  {!readOnly && <Td><div className="flex gap-1"><button onClick={() => onEdit(e)} className="rounded p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil size={15} /></button><button onClick={() => { if (confirm("Delete this event?")) onDelete(e.id); }} className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button></div></Td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------- Settings (editable) ------------------------------------ */
function EditableList({ title, items, onChange, readOnly, locked = [] }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) { onChange([...items, t]); setV(""); } };
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <div className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {items.map(i => (
            <span key={i} className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-sm">
              {i}
              {!readOnly && !locked.includes(i) && <button onClick={() => onChange(items.filter(x => x !== i))} className="text-gray-400 hover:text-red-600"><X size={13} /></button>}
            </span>
          ))}
        </div>
        {!readOnly && (
          <div className="mt-3 flex gap-2">
            <input className={inputCls} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={"Add to " + title + "…"} />
            <button onClick={add} className="rounded-lg px-3 py-2 text-sm font-bold text-white shrink-0" style={{ background: BLUE }}>Add</button>
          </div>
        )}
      </div>
    </Card>
  );
}
function SettingsView({ readOnly, settings, setSettings, events, projMap, onReset, onClear, onImport }) {
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState(null);
  const [defForm, setDefForm] = useState(null);
  const fileRef = useRef(null);
  const Th = ({ children, c }) => <th className={"px-3 py-2 text-xs font-bold text-gray-600 " + (c ? "text-center" : "text-left")}>{children}</th>;
  const Td = ({ children, c }) => <td className={"px-3 py-2 text-sm " + (c ? "text-center" : "")}>{children}</td>;
  const setList = (k, arr) => setSettings(s => ({ ...s, [k]: arr }));

  function saveDef(orig, def) {
    setSettings(s => {
      const exists = s.eventDefs.some(d => d.name === orig);
      const defs = exists ? s.eventDefs.map(d => d.name === orig ? def : d) : [...s.eventDefs, def];
      return { ...s, eventDefs: defs };
    });
    setDefForm(null);
  }
  function deleteDef(name) { if (confirm(`Delete event type "${name}"? Existing log entries using it will fall back to defaults.`)) setSettings(s => ({ ...s, eventDefs: s.eventDefs.filter(d => d.name !== name) })); }
  function doImport(text) {
    const res = importEventsCSV(text, Object.values(projMap));
    if (res.error) { setMsg({ ok: false, t: res.error }); return; }
    if (!confirm(`Import ${res.count} events and add ${res.newProjects.length} project(s)? This replaces all current events.`)) return;
    onImport(res.events, res.newProjects);
    setMsg({ ok: true, t: `Imported ${res.count} events · added ${res.newProjects.length} project(s)${res.skipped ? ` · skipped ${res.skipped} row(s)` : ""}.` });
    setCsv("");
  }
  function onFile(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setCsv(String(r.result)); doImport(String(r.result)); }; r.readAsText(f); }

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">Storage mode: <b>{STORAGE_MODE === "cloud" ? "Shared (cloud)" : "Local (this browser)"}</b>. Changes to the config below are saved with your data.</div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportEventsCSV(events, projMap)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50"><Download size={15} /> Export CSV</button>
            <button onClick={() => { if (confirm("Reload illustrative seed data + default config? Replaces current data.")) onReset(); }} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50"><RefreshCw size={15} /> Reset to Seed</button>
            <button onClick={() => { if (confirm("Clear ALL projects and events?")) onClear(); }} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15} /> Clear All</button>
          </div>
        )}
      </Card>

      {!readOnly && (
        <Card>
          <SectionTitle>Import Event Log (CSV)</SectionTitle>
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-600">Paste your Event Log CSV (or upload a file). Recognized columns: <span className="font-mono text-xs">Timestamp, Project ID, Project Name, Dev Event, Related Team, Task / Change Label, Revision / Change Type, Notes, Entered By</span>.</p>
            <textarea className={inputCls + " font-mono text-xs"} rows={5} value={csv} onChange={e => setCsv(e.target.value)} placeholder="Timestamp,Project ID,Project Name,Dev Event,..." />
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => doImport(csv)} disabled={!csv.trim()} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: BLUE }}><Upload size={15} /> Import & Replace Events</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">Upload file…</button>
              {msg && <span className={"text-sm font-medium " + (msg.ok ? "text-green-700" : "text-red-600")}>{msg.t}</span>}
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ background: BLUE }}>
          <span className="text-sm font-bold">Dev Event Types</span>
          {!readOnly && <button onClick={() => setDefForm({ isNew: true, def: { name: "", devState: "Active Dev", defaultTeam: "Dev", bucket: "Active Dev", color: "#2563EB", rev: false, closes: false, reopens: false } })} className="flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/25"><Plus size={14} /> Add Event Type</button>}
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full">
            <thead className="bg-blue-50/60"><tr><Th>Dev Event</Th><Th>State</Th><Th>Default Team</Th><Th c>Bucket</Th><Th c>Color</Th><Th c>Rev</Th><Th c>Closes</Th><Th c>Reopens</Th>{!readOnly && <Th></Th>}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {settings.eventDefs.map(d => (
                <tr key={d.name} className="hover:bg-gray-50">
                  <Td><span className="font-semibold">{d.name}</span></Td><Td>{d.devState}</Td><Td>{d.defaultTeam || "—"}</Td><Td c>{d.bucket}</Td>
                  <Td c><span className="inline-block h-4 w-8 rounded align-middle" style={{ background: d.color }} /></Td>
                  <Td c>{d.rev ? "✓" : ""}</Td><Td c>{d.closes ? "✓" : ""}</Td><Td c>{d.reopens ? "✓" : ""}</Td>
                  {!readOnly && <Td c><div className="flex gap-1 justify-center"><button onClick={() => setDefForm({ isNew: false, orig: d.name, def: { ...d } })} className="rounded p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil size={15} /></button><button onClick={() => deleteDef(d.name)} className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button></div></Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <EditableList title="Related Teams" items={settings.teams} readOnly={readOnly} locked={["Dev"]} onChange={a => setList("teams", a)} />
        <EditableList title="Entered By" items={settings.enteredBy} readOnly={readOnly} locked={["Other"]} onChange={a => setList("enteredBy", a)} />
        <EditableList title="Revision / Change Types" items={settings.revisionTypes} readOnly={readOnly} onChange={a => setList("revisionTypes", a)} />
        <EditableList title="Project Types" items={settings.projectTypes} readOnly={readOnly} onChange={a => setList("projectTypes", a)} />
      </div>

      {defForm && <EventDefModal initial={defForm} existing={settings.eventDefs.map(d => d.name)} onClose={() => setDefForm(null)} onSave={saveDef} />}
    </div>
  );
}
function EventDefModal({ initial, existing, onClose, onSave }) {
  const [d, setD] = useState(initial.def);
  const [err, setErr] = useState("");
  const set = (k, v) => setD(s => ({ ...s, [k]: v }));
  function submit() {
    const name = d.name.trim();
    if (!name) { setErr("Event name is required."); return; }
    if (initial.isNew && existing.includes(name)) { setErr("An event type with that name already exists."); return; }
    onSave(initial.orig, { ...d, name });
  }
  return (
    <Modal title={initial.isNew ? "Add Event Type" : "Edit Event Type"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Event Name"><input className={inputCls} value={d.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Sent to Design" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Resulting State"><input className={inputCls} value={d.devState} onChange={e => set("devState", e.target.value)} placeholder="Active Dev / Waiting…" /></Field>
          <Field label="Time Bucket" hint="drives where the time is counted"><select className={inputCls} value={d.bucket} onChange={e => set("bucket", e.target.value)}>{BUCKETS.map(b => <option key={b}>{b}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default Team" hint="auto-filled in the log form"><input className={inputCls} value={d.defaultTeam} onChange={e => set("defaultTeam", e.target.value)} placeholder="Dev / Admin / —" /></Field>
          <Field label="Color"><input type="color" className="h-10 w-full rounded-lg border border-gray-300" value={d.color} onChange={e => set("color", e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          {[["rev", "Counts as revision"], ["closes", "Closes project"], ["reopens", "Reopens project"]].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!d[k]} onChange={e => set(k, e.target.checked)} /> {label}</label>
          ))}
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saveLabel="Save Event Type" />
    </Modal>
  );
}

/* ---------- Modals ------------------------------------------------- */
function Field({ label, hint, children }) {
  return <div><label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>{children}{hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}</div>;
}
function EventModal({ initial, projects, onAddEnteredBy, onClose, onSave }) {
  const editing = !!initial.id;
  const inList = initial.enteredBy && CFG.enteredBy.includes(initial.enteredBy) && initial.enteredBy !== "Other";
  const [f, setF] = useState({
    id: initial.id, projectId: initial.projectId || (projects[0]?.id || ""), ts: initial.ts || toInput(new Date()),
    devEvent: initial.devEvent || "", relatedTeam: initial.relatedTeam || "", taskLabel: initial.taskLabel || "",
    revisionType: initial.revisionType || "", notes: initial.notes || "",
    byChoice: initial.enteredBy ? (inList ? initial.enteredBy : "Other") : "",
    otherName: initial.enteredBy && !inList ? initial.enteredBy : "",
  });
  const [err, setErr] = useState("");
  const def = f.devEvent ? defOf(f.devEvent) : null;
  const byOptions = [...CFG.enteredBy.filter(x => x !== "Other"), "Other"];
  function pickEvent(name) { setF(s => ({ ...s, devEvent: name, relatedTeam: s.relatedTeam || defaultTeamFor(name), taskLabel: s.taskLabel || defaultTaskLabel(name) })); }
  function submit() {
    const enteredBy = f.byChoice === "Other" ? f.otherName.trim() : f.byChoice;
    if (!f.projectId || !f.devEvent || !f.taskLabel || !enteredBy) { setErr("Project, Dev Event, Task/Change Label, and Entered By are required."); return; }
    if (requiresTeam(f.devEvent) && !f.relatedTeam) { setErr("Related Team is required for this event."); return; }
    if (f.byChoice === "Other" && !CFG.enteredBy.includes(enteredBy)) onAddEnteredBy(enteredBy);
    onSave({ id: f.id, projectId: f.projectId, ts: f.ts, devEvent: f.devEvent, relatedTeam: f.relatedTeam, taskLabel: f.taskLabel, revisionType: f.revisionType, notes: f.notes, enteredBy });
  }
  return (
    <Modal title={editing ? "Edit Dev Event" : "Log Dev Event"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Project"><select className={inputCls} value={f.projectId} onChange={e => setF(s => ({ ...s, projectId: e.target.value }))}>
          {projects.length === 0 && <option value="">— add a project first —</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field>
        <Field label="Dev Event" hint={def ? `Creates state: ${def.devState} · Bucket: ${def.bucket}` : "Select what happened — state & clock are derived."}>
          <select className={inputCls} value={f.devEvent} onChange={e => pickEvent(e.target.value)}><option value="">— select —</option>{CFG.eventDefs.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={"Related Team" + (def && requiresTeam(f.devEvent) ? " *" : "")}><select className={inputCls} value={f.relatedTeam} onChange={e => setF(s => ({ ...s, relatedTeam: e.target.value }))}><option value="">—</option>{CFG.teams.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Entered By"><select className={inputCls} value={f.byChoice} onChange={e => setF(s => ({ ...s, byChoice: e.target.value }))}><option value="">—</option>{byOptions.map(t => <option key={t}>{t}</option>)}</select></Field>
        </div>
        {f.byChoice === "Other" && <Field label="Name" hint="saved to your Entered By list"><input className={inputCls} value={f.otherName} onChange={e => setF(s => ({ ...s, otherName: e.target.value }))} placeholder="Type the person's name" autoFocus /></Field>}
        <Field label="Task / Change Label"><input className={inputCls} value={f.taskLabel} onChange={e => setF(s => ({ ...s, taskLabel: e.target.value }))} placeholder="e.g. Copy received, Build complete" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Revision / Change Type"><select className={inputCls} value={f.revisionType} onChange={e => setF(s => ({ ...s, revisionType: e.target.value }))}><option value="">—</option>{CFG.revisionTypes.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Timestamp"><input type="datetime-local" className={inputCls} value={f.ts} onChange={e => setF(s => ({ ...s, ts: e.target.value }))} /></Field>
        </div>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={e => setF(s => ({ ...s, notes: e.target.value }))} /></Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saveLabel={editing ? "Save Changes" : "Log Event"} />
    </Modal>
  );
}
function ProjectModal({ initial, existingIds, onClose, onSave }) {
  const editing = !!initial.id;
  const [f, setF] = useState({ id: initial.id || "", name: initial.name || "", type: initial.type || CFG.projectTypes[0], owner: initial.owner || "Dev", startDate: initial.startDate || "", dueDate: initial.dueDate || "" });
  const [err, setErr] = useState("");
  function submit() {
    if (!f.id || !f.name) { setErr("Project ID and Name are required."); return; }
    if (!editing && existingIds.includes(f.id)) { setErr("That Project ID already exists."); return; }
    onSave(f);
  }
  return (
    <Modal title={editing ? "Edit Project" : "Add Project"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project ID" hint={editing ? "ID can't change" : "short, e.g. tzo-brc"}><input disabled={editing} className={inputCls + (editing ? " bg-gray-100" : "")} value={f.id} onChange={e => setF(s => ({ ...s, id: e.target.value.trim() }))} /></Field>
          <Field label="Owner"><input className={inputCls} value={f.owner} onChange={e => setF(s => ({ ...s, owner: e.target.value }))} /></Field>
        </div>
        <Field label="Project Name"><input className={inputCls} value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} /></Field>
        <Field label="Project Type"><select className={inputCls} value={f.type} onChange={e => setF(s => ({ ...s, type: e.target.value }))}>{CFG.projectTypes.map(t => <option key={t}>{t}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date"><input type="date" className={inputCls} value={f.startDate} onChange={e => setF(s => ({ ...s, startDate: e.target.value }))} /></Field>
          <Field label="Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={e => setF(s => ({ ...s, dueDate: e.target.value }))} /></Field>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saveLabel={editing ? "Save Changes" : "Add Project"} />
    </Modal>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 text-white rounded-t-2xl" style={{ background: BLUE }}><span className="font-bold">{title}</span><button onClick={onClose} className="rounded-full p-1 hover:bg-white/15"><X size={18} /></button></div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
function ModalFooter({ onClose, onSave, saveLabel }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
      <button onClick={onSave} className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: BLUE }}>{saveLabel}</button>
    </div>
  );
}