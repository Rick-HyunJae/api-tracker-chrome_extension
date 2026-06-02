// data.jsx — realistic sample REST captures + a generator, shared via window
const HOST = "api.shopmall.io";

function jstr(obj) { return JSON.stringify(obj, null, 2); }

// pool of plausible endpoints the user "navigates" through
const POOL = [
  { m: "GET", path: "/v1/users/me", status: 200, type: "json",
    body: { id: "usr_8821", name: "김도현", email: "dohyun@mail.com", tier: "gold", points: 12480 } },
  { m: "GET", path: "/v1/products?page=2&sort=popular", status: 200, type: "json",
    body: { page: 2, total: 1840, items: [{ id: "p_5521", title: "에어 러너 V3", price: 139000, stock: 24 }, { id: "p_5522", title: "메리노 울 삭스", price: 18000, stock: 0 }] } },
  { m: "GET", path: "/v1/products/p_5521", status: 200, type: "json",
    body: { id: "p_5521", title: "에어 러너 V3", price: 139000, rating: 4.7, reviews: 312, options: ["250", "260", "270"] } },
  { m: "POST", path: "/v1/cart/items", status: 201, type: "json",
    body: { cartId: "cart_771", added: { productId: "p_5521", qty: 1, option: "270" }, itemCount: 3 } },
  { m: "GET", path: "/v1/cart", status: 200, type: "json",
    body: { cartId: "cart_771", itemCount: 3, subtotal: 296000, shipping: 0 } },
  { m: "POST", path: "/v1/orders", status: 201, type: "json",
    body: { orderId: "ord_40192", status: "pending", total: 296000, eta: "2026-06-04" } },
  { m: "GET", path: "/v1/orders/ord_40192", status: 200, type: "json",
    body: { orderId: "ord_40192", status: "paid", items: 3, total: 296000, tracking: null } },
  { m: "PATCH", path: "/v1/users/me", status: 200, type: "json",
    body: { id: "usr_8821", updated: ["address"], address: "서울시 성동구 …" } },
  { m: "DELETE", path: "/v1/cart/items/it_902", status: 204, type: "empty", body: null },
  { m: "GET", path: "/v1/search?q=러닝화&limit=20", status: 200, type: "json",
    body: { q: "러닝화", count: 47, took_ms: 38, hits: ["p_5521", "p_5530", "p_5544"] } },
  { m: "GET", path: "/v1/recommendations", status: 200, type: "json",
    body: { strategy: "collab-v4", items: [{ id: "p_5530", score: 0.91 }, { id: "p_5544", score: 0.86 }] } },
  { m: "POST", path: "/v1/auth/refresh", status: 401, type: "json",
    body: { error: "token_expired", message: "Access token has expired." } },
  { m: "GET", path: "/v1/notifications?unread=true", status: 200, type: "json",
    body: { unread: 2, items: [{ id: "n_1", type: "shipping", read: false }] } },
  { m: "GET", path: "/v1/coupons", status: 200, type: "json",
    body: { available: 4, items: [{ code: "WELCOME10", discount: 0.1, expires: "2026-06-30" }] } },
];

const pad = (n) => String(n).padStart(2, "0");
function clockNow(offsetSec = 0) {
  const d = new Date(Date.now() - offsetSec * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function reqHeaders(m) {
  return [
    [":method", m],
    [":authority", HOST],
    ["accept", "application/json, text/plain, */*"],
    ["authorization", "Bearer eyJhbGciOiJI…d3F2"],
    ["content-type", "application/json"],
    ["x-client", "web/2.18.0"],
    ["user-agent", "Mozilla/5.0 (Macintosh; …) Chrome/126.0"],
  ];
}
function resHeaders(status, len) {
  return [
    [":status", String(status)],
    ["content-type", status === 204 ? "—" : "application/json; charset=utf-8"],
    ["content-length", String(len)],
    ["cache-control", "no-store, max-age=0"],
    ["x-request-id", "req_" + Math.random().toString(36).slice(2, 10)],
    ["x-ratelimit-remaining", String(Math.floor(Math.random() * 90) + 10)],
    ["server", "envoy"],
  ];
}

let _seq = 1000;
function makeEntry(spec, offsetSec) {
  const bodyStr = spec.type === "empty" ? "" : jstr(spec.body);
  const size = spec.type === "empty" ? 0 : new Blob([bodyStr]).size;
  return {
    id: "cap_" + (_seq++),
    method: spec.m,
    path: spec.path,
    host: HOST,
    url: `https://${HOST}${spec.path}`,
    status: spec.status,
    type: spec.type,
    ms: Math.floor(Math.random() * 180) + 28,
    size,
    time: clockNow(offsetSec),
    reqHeaders: reqHeaders(spec.m),
    resHeaders: resHeaders(spec.status, size),
    bodyStr,
  };
}

// initial list (already-collected, shown on load)
const SEED = [POOL[0], POOL[1], POOL[2], POOL[3], POOL[4]]
  .map((s, i) => makeEntry(s, (5 - i) * 17));

let _poolIdx = 5;
function nextCapture() {
  const spec = POOL[_poolIdx % POOL.length];
  _poolIdx++;
  return makeEntry(spec, 0);
}

window.AppData = { SEED, nextCapture, HOST, POOL };
