// app.jsx — root: state, capture simulation, faux browser, tweaks
const { useState: uS, useEffect: uE, useRef: uR } = React;
const Ix = window.Icons;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#5aa9bf",
  "uiFont": "Space Grotesk",
  "density": "regular"
}/*EDITMODE-END*/;

const ACCENTS = {
  "#5aa9bf": "oklch(0.74 0.075 210)",   // muted teal
  "#7d88c4": "oklch(0.70 0.07 268)",    // dusty indigo
  "#6bb89a": "oklch(0.75 0.075 162)",   // sage
  "#c79a6a": "oklch(0.75 0.07 72)",     // sand
};

/* ---------- SEND VIEW ---------- */
function SendView({ entries, cfg, onSend, sending, progress }) {
  const byMethod = entries.reduce((a, e) => { a[e.method] = (a[e.method] || 0) + 1; return a; }, {});
  const totalBytes = entries.reduce((a, e) => a + e.size, 0);
  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><Ix.Cloud size={17} /></div>
        <div style={{ flex: 1 }}><h1>서버로 전송</h1><div className="sub">batch upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
          <div className="set-group">
            <h3>업로드 요약</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "13px 14px" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600 }}>{entries.length}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>수집 건수</div>
              </div>
              <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "13px 14px" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600 }}>{(totalBytes / 1024).toFixed(1)}<span style={{ fontSize: 13, color: "var(--text-3)" }}>KB</span></div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>페이로드</div>
              </div>
            </div>
          </div>

          <div className="set-group">
            <h3>메서드 분포</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byMethod).map(([m, n]) => (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className={"badge " + m} style={{ width: 52, textAlign: "center" }}>{m}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (n / entries.length * 100) + "%", background: `var(--m-${m === "DELETE" ? "del" : m.toLowerCase()})`, borderRadius: 6 }}></div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)", width: 22, textAlign: "right" }}>{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="set-group">
            <h3>대상</h3>
            <div className="durl" style={{ background: "var(--surface)" }}>
              <div className="full"><span style={{ color: "var(--text-3)" }}>POST </span><b>{cfg.endpoint}</b></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pfoot" style={{ flexDirection: "column", gap: 9, alignItems: "stretch" }}>
        {sending && (
          <div style={{ height: 5, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: "var(--accent)", borderRadius: 5, transition: "width .2s" }}></div>
          </div>
        )}
        <button className="btn btn-primary" disabled={!entries.length || sending} onClick={onSend} style={{ height: 44 }}>
          {sending ? `업로드 중… ${progress}%` : <><Ix.Send size={16} /> {entries.length}건 전송</>}
        </button>
      </div>
    </div>
  );
}

/* ---------- ROOT ---------- */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [entries, setEntries] = uS(window.AppData.SEED);
  const [collecting, setCollecting] = uS(true);
  const [panelOpen, setPanelOpen] = uS(true);
  const [view, setView] = uS("list");
  const [selectedId, setSelectedId] = uS(null);
  const [freshId, setFreshId] = uS(null);
  const [query, setQuery] = uS("");
  const [sending, setSending] = uS(false);
  const [progress, setProgress] = uS(0);
  const [toast, setToast] = uS(null);
  const [omni, setOmni] = uS(window.AppData.SEED[0]);
  const [cfg, setCfg] = uS({
    endpoint: "https://collector.internal/api/capture",
    token: "",
    domain: "*.shopmall.io",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    saveBody: true, autoSend: false, dedupe: false,
  });

  // apply tweaks to :root
  uE(() => {
    const r = document.documentElement;
    r.style.setProperty("--accent", ACCENTS[t.accent] || ACCENTS["#5aa9bf"]);
    const a = t.accent;
    r.style.setProperty("--accent-dim", a + "24");
    r.style.setProperty("--ui", `"${t.uiFont}", system-ui, sans-serif`);
  }, [t.accent, t.uiFont]);

  // capture simulation — new requests stream in while collecting
  uE(() => {
    if (!collecting) return;
    const iv = setInterval(() => {
      const e = window.AppData.nextCapture();
      setEntries(prev => [e, ...prev].slice(0, 60));
      setFreshId(e.id);
      setOmni(e);
      setTimeout(() => setFreshId(null), 500);
    }, 2600);
    return () => clearInterval(iv);
  }, [collecting]);

  const flash = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  // ---- draggable floating dock (vertical) ----
  const dockRef = uR(null);
  const dragRef = uR({ active: false, sy: 0, st: 0, moved: false });
  const topRef = uR(0);
  const [dockTop, setDockTop] = uS(() => {
    const s = parseFloat(localStorage.getItem("fabTop"));
    return !isNaN(s) ? s : Math.round(window.innerHeight * 0.56);
  });
  uE(() => { topRef.current = dockTop; }, [dockTop]);
  uE(() => {
    const onR = () => { const h = dockRef.current ? dockRef.current.offsetHeight : 90;
      setDockTop(tp => Math.max(10, Math.min(window.innerHeight - h - 10, tp))); };
    window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR);
  }, []);
  const dockDown = (e) => {
    dragRef.current = { active: true, sy: e.clientY, st: topRef.current, moved: false };
    try { dockRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    dockRef.current && dockRef.current.classList.add("dragging");
  };
  const dockMove = (e) => {
    const d = dragRef.current; if (!d.active) return;
    const dy = e.clientY - d.sy;
    if (Math.abs(dy) > 3) d.moved = true;
    const h = dockRef.current ? dockRef.current.offsetHeight : 90;
    setDockTop(Math.max(10, Math.min(window.innerHeight - h - 10, d.st + dy)));
  };
  const dockUp = () => {
    const d = dragRef.current; if (!d.active) return;
    d.active = false;
    dockRef.current && dockRef.current.classList.remove("dragging");
    if (d.moved) localStorage.setItem("fabTop", String(topRef.current));
  };
  const guard = (fn) => () => { if (dragRef.current.moved) { dragRef.current.moved = false; return; } fn(); };

  const selectEntry = (id) => { setSelectedId(id); setView("detail"); };

  const send = () => {
    if (!entries.length || sending) return;
    setSending(true); setProgress(0);
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(iv); return 100; }
        return Math.min(100, p + Math.floor(Math.random() * 22) + 10);
      });
    }, 220);
    setTimeout(() => {
      clearInterval(iv); setProgress(100);
      setTimeout(() => {
        setSending(false); setProgress(0);
        flash(`${entries.length}건을 서버로 전송했습니다`);
        setEntries([]); setView("list");
      }, 350);
    }, 1700);
  };

  const clearAll = () => { setEntries([]); setSelectedId(null); flash("수집 리스트를 비웠습니다"); };

  const selected = entries.find(e => e.id === selectedId) || null;
  let content;
  if (view === "detail") content = <DetailView entry={selected} onBack={() => setView("list")} />;
  else if (view === "settings") content = <SettingsView cfg={cfg} setCfg={setCfg} />;
  else if (view === "send") content = <SendView entries={entries} cfg={cfg} onSend={send} sending={sending} progress={progress} />;
  else content = <ListView entries={entries} collecting={collecting} onToggle={() => setCollecting(c => !c)}
    onSelect={selectEntry} onClear={clearAll} onSend={() => setView("send")} sending={sending}
    onClose={() => setPanelOpen(false)}
    freshId={freshId} query={query} setQuery={setQuery} />;

  return (
    <div className="browser">
      <div className="chrome">
        <div className="lights"><i></i><i></i><i></i></div>
        <div className="chrome-nav">
          <button><Ix.Back size={16} /></button>
          <button style={{ transform: "scaleX(-1)" }}><Ix.Back size={16} /></button>
        </div>
        <div className="omni">
          <Ix.Lock size={13} />
          <span className="url"><span style={{ color: "var(--text-3)" }}>https://{omni.host}</span><b>{omni.path}</b></span>
          {collecting && <span className="live" title="수집 중"></span>}
        </div>
        <div className="chrome-nav"><button><Ix.Gear size={16} /></button></div>
      </div>

      <div className="browser-body">
        <div className="page">
          <div className="ph">
            <div className="bar" style={{ width: "45%" }}></div>
            <div className="blk"><span>[ page content — 사용자가 탐색 중인 웹페이지 ]</span></div>
            <div className="bar" style={{ width: "70%" }}></div>
            <div className="bar" style={{ width: "55%" }}></div>
            <div className="blk" style={{ height: 140 }}><span>product / list view</span></div>
          </div>
          <div className="scrim"></div>
          <div className="tag">SHOPMALL · 데모 사이트</div>
        </div>

        <div className={"panel" + (panelOpen ? "" : " closed")}>
          <div id="rootpanel" style={{ width: "100%", display: "flex", minHeight: 0, position: "relative" }}>
            {content}
            <Rail view={view} setView={setView} count={entries.length} />
            {toast && (
              <div className={"toast" + (toast.ok ? " ok" : "")}>
                <span className="ic">{toast.ok ? <Ix.Check size={15} /> : <Ix.Dot size={13} />}</span>{toast.msg}
              </div>
            )}
          </div>
        </div>

        <div className="fab-dock" ref={dockRef} style={{ top: dockTop, right: panelOpen ? 408 : 0 }}
          onPointerDown={dockDown} onPointerMove={dockMove} onPointerUp={dockUp} onPointerCancel={dockUp}>
          <button className={"fab fab-fn" + (collecting ? " rec" : "")}
            onClick={guard(() => { setCollecting(c => !c); flash(collecting ? "수집을 일시정지했습니다" : "수집을 시작합니다"); })}
            title={collecting ? "수집 일시정지" : "수집 시작"}>
            <Ix.Broadcast size={16} />
            {collecting && <span className="fab-rec-dot"></span>}
            <span className="fab-tip">{collecting ? "수집 중 — 클릭하여 정지" : "수집 시작"}</span>
          </button>
          <button className="fab fab-main" onClick={guard(() => setPanelOpen(o => !o))}
            title={panelOpen ? "패널 닫기" : "패널 열기"}>
            <Ix.Panel size={16} style={{ transform: panelOpen ? "scaleX(1)" : "scaleX(-1)" }} />
            {entries.length > 0 && <span className="fab-badge">{entries.length > 99 ? "99+" : entries.length}</span>}
            <span className="fab-tip">{panelOpen ? "패널 닫기" : `열기 · ${entries.length}건`}</span>
          </button>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="테마" />
        <TweakColor label="액센트" value={t.accent}
          options={Object.keys(ACCENTS)} onChange={(v) => setTweak("accent", v)} />
        <TweakSelect label="UI 폰트" value={t.uiFont}
          options={["Space Grotesk", "IBM Plex Mono", "system-ui"]}
          onChange={(v) => setTweak("uiFont", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
