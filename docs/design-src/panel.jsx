// panel.jsx — presentational components + views, shared via window
const { useState, useRef, useEffect } = React;
const I = window.Icons;

const statusClass = (s) => s < 300 ? "ok" : s < 400 ? "warn" : "err";

function CopyBtn({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setDone(true); setTimeout(() => setDone(false), 1300);
  };
  return (
    <button className={"copy-btn" + (done ? " done" : "")} onClick={copy}>
      {done ? <I.Check size={13} /> : <I.Copy size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

// tiny JSON syntax highlighter
function highlight(json) {
  if (!json) return null;
  const esc = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = "tok-num";
      if (/^"/.test(m)) cls = /:$/.test(m) ? "tok-key" : "tok-str";
      else if (/true|false/.test(m)) cls = "tok-bool";
      else if (/null/.test(m)) cls = "tok-null";
      return `<span class="${cls}">${m}</span>`;
    }
  );
  return { __html: html };
}

/* ---------- LIST VIEW ---------- */
function ListView({ entries, collecting, onToggle, onSelect, onClear, onSend, sending, freshId, query, setQuery, onClose }) {
  const filtered = entries.filter(e =>
    !query || e.path.toLowerCase().includes(query.toLowerCase()) || e.method.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph"><I.Stack size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>API 수집기</h1>
          <div className="sub">REST · {window.AppData.HOST}</div>
        </div>
        <button className="icon-btn" title="패널 닫기" onClick={onClose}><I.Chevron size={17} /></button>
      </div>

      <div className={"recbar" + (collecting ? " live" : "")}>
        <button className={"rec-toggle " + (collecting ? "on" : "off")} onClick={onToggle}
          title={collecting ? "수집 일시정지" : "수집 시작"}>
          {collecting ? <I.Pause size={20} /> : <I.Play size={20} />}
        </button>
        <div className="rec-meta">
          <div className="rec-state">
            <span className="blip" style={{ background: collecting ? "var(--rec)" : "var(--text-3)" }}></span>
            {collecting ? "수집 중" : "일시정지됨"}
          </div>
          <div className="rec-count">
            <b>{entries.length}</b>건 수집됨{collecting ? " · URL 이동 감지 중" : " · 토글하여 시작"}
          </div>
        </div>
        <button className="icon-btn" title="전체 삭제" onClick={onClear} disabled={!entries.length}
          style={{ opacity: entries.length ? 1 : .4 }}><I.Trash size={16} /></button>
      </div>

      <div className="searchrow">
        <I.Search size={14} />
        <input placeholder="경로 · 메서드 검색" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="scroll">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="ring"><I.Stack size={22} /></div>
            <p>{entries.length ? "검색 결과가 없습니다" : "아직 수집된 요청이 없습니다"}</p>
            <span>{entries.length ? query : "수집을 시작하고 페이지를 이동해 보세요"}</span>
          </div>
        ) : (
          <div className="list">
            {filtered.map(e => (
              <button key={e.id} className={"entry" + (e.id === freshId ? " fresh" : "")} onClick={() => onSelect(e.id)}>
                <div className="entry-top">
                  <span className={"badge " + e.method}>{e.method}</span>
                  <span className="path">{e.path.split("?")[0]}</span>
                  <span className={"status " + statusClass(e.status)}>{e.status}</span>
                </div>
                <div className="entry-meta">
                  <span className="host">{e.host}</span>
                  <span className="sep">·</span>
                  <span>{e.ms}ms</span>
                  <span className="sep">·</span>
                  <span>{e.size ? (e.size + "B") : "0B"}</span>
                  <span style={{ marginLeft: "auto" }}>{e.time}</span>
                </div>
                <span className="chev"><I.Chevron size={15} /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pfoot">
        <button className="btn btn-primary" disabled={!entries.length || sending} onClick={onSend}>
          {sending ? <>전송 중…</> : <><I.Send size={16} /> 서버로 전송 <span className="pill">{entries.length}</span></>}
        </button>
        <button className="btn btn-ghost" title="전체 삭제" onClick={onClear} disabled={!entries.length}><I.Trash size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- DETAIL VIEW ---------- */
function DetailView({ entry, onBack }) {
  const [tab, setTab] = useState("body");
  if (!entry) return null;
  const headersText = (hs) => hs.map(([k, v]) => `${k}: ${v}`).join("\n");

  return (
    <div className="pmain">
      <div className="dhead">
        <button className="dback" onClick={onBack}><I.Back size={15} /> 수집 리스트</button>
        <div className="durl">
          <div className="durl-top">
            <span className={"badge " + entry.method}>{entry.method}</span>
            <span className={"status " + statusClass(entry.status)} style={{ fontSize: 12 }}>{entry.status}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-3)" }}>{entry.time}</span>
          </div>
          <div className="full"><span style={{ color: "var(--text-3)" }}>https://{entry.host}</span><b>{entry.path}</b></div>
          <div className="durl-stat">
            <span>응답 <b>{entry.ms}ms</b></span>
            <span>크기 <b>{entry.size}B</b></span>
            <span>형식 <b>{entry.type === "empty" ? "—" : "JSON"}</b></span>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={"tab" + (tab === "body" ? " active" : "")} onClick={() => setTab("body")}>본문</button>
        <button className={"tab" + (tab === "res" ? " active" : "")} onClick={() => setTab("res")}>응답 헤더<span className="n">{entry.resHeaders.length}</span></button>
        <button className={"tab" + (tab === "req" ? " active" : "")} onClick={() => setTab("req")}>요청 헤더<span className="n">{entry.reqHeaders.length}</span></button>
      </div>

      <div className="scroll">
        {tab === "body" && (entry.bodyStr ? (
          <>
            <div className="section-tools"><CopyBtn text={entry.bodyStr} label="본문 복사" /></div>
            <div className="codeblock"><pre className="code" dangerouslySetInnerHTML={highlight(entry.bodyStr)} /></div>
          </>
        ) : (
          <div className="empty-body">{entry.status} · 본문 없음 (No Content)</div>
        ))}
        {tab === "res" && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(entry.resHeaders)} label="헤더 복사" /></div>
            <div className="kv">{entry.resHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
        {tab === "req" && (
          <>
            <div className="section-tools"><CopyBtn text={headersText(entry.reqHeaders)} label="헤더 복사" /></div>
            <div className="kv">{entry.reqHeaders.map(([k, v], i) => (
              <div className="kv-row" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}</div>
          </>
        )}
      </div>

      <div className="pfoot">
        <CopyBtn text={entry.url} label="요청 URL 복사" />
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} title="cURL 복사">
          <CopyBtn text={`curl -X ${entry.method} '${entry.url}'`} label="cURL" />
        </button>
      </div>
    </div>
  );
}

/* ---------- SETTINGS VIEW ---------- */
function SettingsView({ cfg, setCfg }) {
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const toggleM = (m) => setCfg(c => ({ ...c, methods: c.methods.includes(m) ? c.methods.filter(x => x !== m) : [...c.methods, m] }));
  return (
    <div className="pmain">
      <div className="phead">
        <div className="glyph" style={{ background: "var(--surface-hi)", color: "var(--text)" }}><I.Gear size={16} /></div>
        <div style={{ flex: 1 }}><h1>설정</h1><div className="sub">capture &amp; upload</div></div>
      </div>
      <div className="scroll">
        <div className="settings">
          <div className="set-group">
            <h3>전송 서버</h3>
            <div className="field">
              <label>업로드 엔드포인트</label>
              <input type="text" value={cfg.endpoint} onChange={e => setCfg(c => ({ ...c, endpoint: e.target.value }))} />
            </div>
            <div className="field">
              <label>인증 토큰 (선택)</label>
              <input type="text" placeholder="Bearer …" value={cfg.token} onChange={e => setCfg(c => ({ ...c, token: e.target.value }))} />
            </div>
          </div>

          <div className="set-group">
            <h3>캡처 대상</h3>
            <div className="field">
              <label>도메인 화이트리스트</label>
              <input type="text" value={cfg.domain} onChange={e => setCfg(c => ({ ...c, domain: e.target.value }))} />
            </div>
            <div className="field">
              <label>HTTP 메서드</label>
              <div className="chips">{METHODS.map(m => (
                <button key={m} className={"chip" + (cfg.methods.includes(m) ? " on" : "")} onClick={() => toggleM(m)}>{m}</button>
              ))}</div>
            </div>
          </div>

          <div className="set-group">
            <h3>동작</h3>
            <div className="togrow">
              <div className="lbl">응답 본문 저장<small>JSON 본문을 함께 기록합니다</small></div>
              <button className={"sw" + (cfg.saveBody ? " on" : "")} onClick={() => setCfg(c => ({ ...c, saveBody: !c.saveBody }))}></button>
            </div>
            <div className="togrow">
              <div className="lbl">자동 전송<small>50건마다 서버로 자동 업로드</small></div>
              <button className={"sw" + (cfg.autoSend ? " on" : "")} onClick={() => setCfg(c => ({ ...c, autoSend: !c.autoSend }))}></button>
            </div>
            <div className="togrow">
              <div className="lbl">중복 URL 제외<small>같은 경로는 마지막 응답만 유지</small></div>
              <button className={"sw" + (cfg.dedupe ? " on" : "")} onClick={() => setCfg(c => ({ ...c, dedupe: !c.dedupe }))}></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- RAIL ---------- */
function Rail({ view, setView, count }) {
  const items = [
    { id: "list", label: "수집", Icon: I.Stack, badge: count },
    { id: "send", label: "전송", Icon: I.Cloud },
  ];
  return (
    <div className="rail">
      <div className="tabs-top">
        {items.map(it => (
          <button key={it.id} className={"rail-btn" + (view === it.id ? " active" : "")} onClick={() => setView(it.id)}>
            <it.Icon size={19} />
            <span className="lab">{it.label}</span>
            {it.badge ? <span className="ndot">{it.badge > 99 ? "99+" : it.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="spacer"></div>
      <button className={"rail-btn" + (view === "settings" ? " active" : "")} onClick={() => setView("settings")}>
        <I.Gear size={19} /><span className="lab">설정</span>
      </button>
      <div className="ava">K</div>
    </div>
  );
}

Object.assign(window, { ListView, DetailView, SettingsView, Rail, CopyBtn, statusClass });
