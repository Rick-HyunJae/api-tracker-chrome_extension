// icons.jsx — minimal line icons (lucide-style), shared via window
const Ic = ({ d, size = 18, sw = 1.7, fill, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"}
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Stack: (p) => <Ic {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></Ic>,
  Code:  (p) => <Ic {...p}><path d="M8 6l-5 6 5 6"/><path d="M16 6l5 6-5 6"/></Ic>,
  Send:  (p) => <Ic {...p}><path d="M4 12l16-8-6 16-3-6-7-2z"/></Ic>,
  Gear:  (p) => <Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.2z"/></Ic>,
  Play:  (p) => <Ic {...p} fill="currentColor" sw={0}><path d="M7 5v14l12-7z"/></Ic>,
  Pause: (p) => <Ic {...p} fill="currentColor" sw={0}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></Ic>,
  Copy:  (p) => <Ic {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></Ic>,
  Check: (p) => <Ic {...p}><path d="M5 13l4 4L19 7"/></Ic>,
  Trash: (p) => <Ic {...p}><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></Ic>,
  Chevron:(p) => <Ic {...p}><path d="M9 6l6 6-6 6"/></Ic>,
  Panel: (p) => <Ic {...p}><rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M14 5.5v13"/><path d="M16.4 9.7h2.4M16.4 12.3h2.4"/></Ic>,
  Broadcast: (p) => <Ic {...p}><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8"/><path d="M15.9 8.1a5.5 5.5 0 0 1 0 7.8"/><path d="M5.4 5.4a9.3 9.3 0 0 0 0 13.2"/><path d="M18.6 5.4a9.3 9.3 0 0 1 0 13.2"/></Ic>,
  Back:  (p) => <Ic {...p}><path d="M15 6l-6 6 6 6"/></Ic>,
  Search:(p) => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></Ic>,
  Lock:  (p) => <Ic {...p}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></Ic>,
  Arrow: (p) => <Ic {...p}><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></Ic>,
  Expand:(p) => <Ic {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/></Ic>,
  Dot:   (p) => <Ic {...p} fill="currentColor" sw={0}><circle cx="12" cy="12" r="5"/></Ic>,
  Filter:(p) => <Ic {...p}><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></Ic>,
  Cloud: (p) => <Ic {...p}><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 0 8.5H7z"/><path d="M12 13v5"/><path d="M9.5 15.5L12 13l2.5 2.5"/></Ic>,
  X:     (p) => <Ic {...p}><path d="M6 6l12 12M18 6L6 18"/></Ic>,
  Clock: (p) => <Ic {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></Ic>,
};

window.Icons = Icons;
