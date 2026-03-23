import React, { useState, useEffect } from "react";

const COINS = [
  { id: "BTC", name: "비트코인", base: 132000000, color: "#F7931A", vol: 0.018 },
  { id: "ETH", name: "이더리움", base: 4200000,   color: "#627EEA", vol: 0.022 },
  { id: "SOL", name: "솔라나",   base: 280000,    color: "#9945FF", vol: 0.030 },
  { id: "XRP", name: "리플",     base: 1050,      color: "#346AA9", vol: 0.025 },
];

const TIMEFRAMES = [
  { id: "1m",  label: "1분",  ms: 900  },
  { id: "3m",  label: "3분",  ms: 1800 },
  { id: "5m",  label: "5분",  ms: 2700 },
  { id: "15m", label: "15분", ms: 3600 },
];

const CONDITIONS = [
  { id: "stoch_below",     label: "스토캐스틱 %K ≤", ind: "STOCH", hasVal: true,  def: 20,  action: "buy",  group: "단기" },
  { id: "stoch_above",     label: "스토캐스틱 %K ≥", ind: "STOCH", hasVal: true,  def: 80,  action: "sell", group: "단기" },
  { id: "stoch_golden",    label: "스토캐스틱 골든",  ind: "STOCH", hasVal: false,           action: "buy",  group: "단기" },
  { id: "stoch_dead",      label: "스토캐스틱 데드",  ind: "STOCH", hasVal: false,           action: "sell", group: "단기" },
  { id: "wr_below",        label: "Williams %R ≤",    ind: "WR",    hasVal: true,  def: -80, action: "buy",  group: "단기" },
  { id: "wr_above",        label: "Williams %R ≥",    ind: "WR",    hasVal: true,  def: -20, action: "sell", group: "단기" },
  { id: "atr_expand",      label: "ATR 변동성 확대",  ind: "ATR",   hasVal: false,           action: "buy",  group: "단기" },
  { id: "ema_golden",      label: "EMA9 > EMA21",     ind: "EMA",   hasVal: false,           action: "buy",  group: "단기" },
  { id: "ema_dead",        label: "EMA9 < EMA21",     ind: "EMA",   hasVal: false,           action: "sell", group: "단기" },
  { id: "above_vwap",      label: "가격 > VWAP",      ind: "VWAP",  hasVal: false,           action: "buy",  group: "단기" },
  { id: "below_vwap",      label: "가격 < VWAP",      ind: "VWAP",  hasVal: false,           action: "sell", group: "단기" },
  { id: "rsi_below",       label: "RSI ≤",            ind: "RSI",   hasVal: true,  def: 30,  action: "buy",  group: "중기" },
  { id: "rsi_above",       label: "RSI ≥",            ind: "RSI",   hasVal: true,  def: 70,  action: "sell", group: "중기" },
  { id: "macd_golden",     label: "MACD 골든크로스",  ind: "MACD",  hasVal: false,           action: "buy",  group: "중기" },
  { id: "macd_dead",       label: "MACD 데드크로스",  ind: "MACD",  hasVal: false,           action: "sell", group: "중기" },
  { id: "bb_lower",        label: "볼린저 하단 터치",  ind: "BB",   hasVal: false,           action: "buy",  group: "중기" },
  { id: "bb_upper",        label: "볼린저 상단 터치",  ind: "BB",   hasVal: false,           action: "sell", group: "중기" },
];

const uid = () => Math.random().toString(36).slice(2);
const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : Math.round(n).toLocaleString("ko-KR");
const fmtW = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const green = "#00d4a1";
const red = "#ff4757";
const clrPnl = (n) => (n >= 0 ? green : red);

// ── INDICATOR MATH ────────────────────────────────────
function calcRSI(closes, p = 14) {
  const r = new Array(closes.length).fill(null);
  if (closes.length < p + 1) return r;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? (ag += d) : (al += Math.abs(d));
  }
  ag /= p; al /= p;
  r[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1], g = d > 0 ? d : 0, l = d < 0 ? Math.abs(d) : 0;
    ag = (ag * (p - 1) + g) / p;
    al = (al * (p - 1) + l) / p;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcEMA(arr, p) {
  const k = 2 / (p + 1), r = new Array(arr.length).fill(null);
  if (arr.length < p) return r;
  let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  r[p - 1] = e;
  for (let i = p; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); r[i] = e; }
  return r;
}

function calcMACD(closes) {
  const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
  const macd = closes.map((_, i) => e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null);
  const sig = calcEMA(macd.map(v => v ?? 0), 9);
  return { macd, sig };
}

function calcBB(closes, p = 20) {
  return closes.map((_, i) => {
    if (i < p - 1) return null;
    const sl = closes.slice(i - p + 1, i + 1), mean = sl.reduce((a, b) => a + b, 0) / p;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
    return { upper: mean + 2 * std, mid: mean, lower: mean - 2 * std };
  });
}

function calcMA(closes, p) {
  return closes.map((_, i) => {
    if (i < p - 1) return null;
    return closes.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p;
  });
}

function calcStoch(candles, kp = 14, dp = 3) {
  const k = candles.map((_, i) => {
    if (i < kp - 1) return null;
    const sl = candles.slice(i - kp + 1, i + 1);
    const hi = Math.max(...sl.map(c => c.h)), lo = Math.min(...sl.map(c => c.l));
    return hi === lo ? 50 : (candles[i].c - lo) / (hi - lo) * 100;
  });
  const d = k.map((_, i) => {
    const v = k.slice(Math.max(0, i - dp + 1), i + 1).filter(x => x != null);
    return v.length === dp ? v.reduce((a, b) => a + b, 0) / dp : null;
  });
  return { k, d };
}

function calcWR(candles, p = 14) {
  return candles.map((_, i) => {
    if (i < p - 1) return null;
    const sl = candles.slice(i - p + 1, i + 1);
    const hi = Math.max(...sl.map(c => c.h)), lo = Math.min(...sl.map(c => c.l));
    return hi === lo ? -50 : ((hi - candles[i].c) / (hi - lo)) * -100;
  });
}

function calcATR(candles, p = 14) {
  const tr = candles.map((c, i) =>
    i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i-1].c), Math.abs(c.l - candles[i-1].c))
  );
  const atr = new Array(candles.length).fill(null);
  if (candles.length < p) return atr;
  atr[p - 1] = tr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < tr.length; i++) atr[i] = (atr[i-1] * (p-1) + tr[i]) / p;
  return atr;
}

function calcVWAP(candles) {
  let cpv = 0, cv = 0;
  return candles.map(c => {
    const tp = (c.h + c.l + c.c) / 3, vol = c.h - c.l;
    cpv += tp * vol; cv += vol;
    return cv === 0 ? c.c : cpv / cv;
  });
}

function getIndicators(candles) {
  const closes = candles.map(c => c.c);
  const rsiArr = calcRSI(closes);
  const { macd, sig } = calcMACD(closes);
  const bbArr = calcBB(closes);
  const { k: stochK, d: stochD } = calcStoch(candles);
  const wrArr = calcWR(candles);
  const atrArr = calcATR(candles);
  const ema9 = calcEMA(closes, 9), ema21 = calcEMA(closes, 21);
  const vwapArr = calcVWAP(candles);

  const last = closes.at(-1);
  const lastBB = bbArr.filter(Boolean).at(-1);
  const lastATR = atrArr.filter(Boolean).at(-1) ?? 0;
  const prevATR = atrArr.filter(Boolean).at(-3) ?? 0;
  const lastStochK = stochK.filter(Boolean).at(-1) ?? 50;
  const lastStochD = stochD.filter(Boolean).at(-1) ?? 50;
  const prevStochK = stochK.filter(Boolean).at(-2) ?? 50;
  const prevStochD = stochD.filter(Boolean).at(-2) ?? 50;
  const lastEMA9 = ema9.filter(Boolean).at(-1) ?? 0;
  const lastEMA21 = ema21.filter(Boolean).at(-1) ?? 0;
  const prevEMA9 = ema9.filter(Boolean).at(-2) ?? 0;
  const prevEMA21 = ema21.filter(Boolean).at(-2) ?? 0;

  return {
    rsi: rsiArr.filter(Boolean).at(-1) ?? 50,
    macd: macd.filter(Boolean).at(-1) ?? 0,
    sig: sig.filter(Boolean).at(-1) ?? 0,
    lastBB, last,
    stochK: lastStochK, stochD: lastStochD, prevStochK, prevStochD,
    wr: wrArr.filter(Boolean).at(-1) ?? -50,
    atr: lastATR, prevATR,
    ema9: lastEMA9, ema21: lastEMA21, prevEMA9, prevEMA21,
    vwap: vwapArr.at(-1) ?? last,
    rsiArr, macdArr: macd, sigArr: sig, bbArr,
    stochKArr: stochK, stochDArr: stochD, wrArr, atrArr, ema9Arr: ema9, ema21Arr: ema21, vwapArr,
  };
}

function evalCond(cond, iv) {
  switch (cond.id) {
    case "rsi_below":    return iv.rsi <= (cond.val ?? 30);
    case "rsi_above":    return iv.rsi >= (cond.val ?? 70);
    case "macd_golden":  return iv.macd > iv.sig;
    case "macd_dead":    return iv.macd < iv.sig;
    case "bb_lower":     return iv.lastBB && iv.last <= iv.lastBB.lower;
    case "bb_upper":     return iv.lastBB && iv.last >= iv.lastBB.upper;
    case "stoch_below":  return iv.stochK <= (cond.val ?? 20);
    case "stoch_above":  return iv.stochK >= (cond.val ?? 80);
    case "stoch_golden": return iv.stochK > iv.stochD && iv.prevStochK <= iv.prevStochD;
    case "stoch_dead":   return iv.stochK < iv.stochD && iv.prevStochK >= iv.prevStochD;
    case "wr_below":     return iv.wr <= (cond.val ?? -80);
    case "wr_above":     return iv.wr >= (cond.val ?? -20);
    case "atr_expand":   return iv.atr > iv.prevATR * 1.2;
    case "ema_golden":   return iv.ema9 > iv.ema21 && iv.prevEMA9 <= iv.prevEMA21;
    case "ema_dead":     return iv.ema9 < iv.ema21 && iv.prevEMA9 >= iv.prevEMA21;
    case "above_vwap":   return iv.last > iv.vwap;
    case "below_vwap":   return iv.last < iv.vwap;
    default: return false;
  }
}

// ── CANDLE GENERATOR ──────────────────────────────────
function genCandles(base, vol, count = 150) {
  const out = [];
  let p = base * (0.88 + Math.random() * 0.12);
  for (let i = 0; i < count; i++) {
    const o = p, mv = (Math.random() - 0.49) * p * vol, c = Math.max(p + mv, base * 0.4);
    out.push({ o, h: Math.max(o, c) * (1 + Math.random() * vol * 0.4), l: Math.min(o, c) * (1 - Math.random() * vol * 0.4), c });
    p = c;
  }
  return out;
}

// ── CANDLE CHART SVG ──────────────────────────────────
function CandleChart({ candles, iv, showEMA, showBB, showVWAP }) {
  const W = 580, H = 160, PL = 4, PR = 4, PT = 6, PB = 6;
  const cw = W - PL - PR, ch = H - PT - PB;
  const vis = candles.slice(-60);

  let allP = vis.flatMap(c => [c.h, c.l]);
  if (showBB && iv.bbArr) iv.bbArr.slice(-60).forEach(b => b && allP.push(b.upper, b.lower));
  if (showEMA) {
    iv.ema9Arr?.slice(-60).forEach(v => v && allP.push(v));
    iv.ema21Arr?.slice(-60).forEach(v => v && allP.push(v));
  }
  if (showVWAP) iv.vwapArr?.slice(-60).forEach(v => v && allP.push(v));

  const minP = Math.min(...allP) * 0.999, maxP = Math.max(...allP) * 1.001;
  const sy = (v) => PT + ch * (1 - (v - minP) / (maxP - minP));
  const sx = (i) => PL + (i + 0.5) * (cw / vis.length);
  const bw = cw / vis.length * 0.6;

  const linePath = (arr) => {
    const pts = arr?.slice(-60).map((v, i) => v != null ? `${sx(i)},${sy(v)}` : null).filter(Boolean);
    return pts?.length > 1 ? `M${pts.join("L")}` : null;
  };

  const bbs = iv.bbArr?.slice(-60) ?? [];
  const bbUpper = bbs.map((b, i) => b ? `${sx(i)},${sy(b.upper)}` : null).filter(Boolean);
  const bbLower = bbs.map((b, i) => b ? `${sx(i)},${sy(b.lower)}` : null).filter(Boolean);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {vis.map((c, i) => {
        const x = sx(i), isBull = c.c >= c.o, cc = isBull ? green : red;
        const top = sy(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(sy(c.o) - sy(c.c)));
        return (
          <g key={i}>
            <line x1={x} y1={sy(c.h)} x2={x} y2={sy(c.l)} stroke={cc} strokeWidth={0.7} />
            <rect x={x - bw / 2} y={top} width={bw} height={bh} fill={cc} />
          </g>
        );
      })}
      {showBB && bbUpper.length > 1 && (
        <>
          <path d={`M${bbUpper.join("L")}`} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,2" opacity={0.7} />
          <path d={`M${bbLower.join("L")}`} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,2" opacity={0.7} />
        </>
      )}
      {showEMA && linePath(iv.ema9Arr) && <path d={linePath(iv.ema9Arr)} fill="none" stroke="#34d399" strokeWidth={1.4} />}
      {showEMA && linePath(iv.ema21Arr) && <path d={linePath(iv.ema21Arr)} fill="none" stroke="#f59e0b" strokeWidth={1.4} />}
      {showVWAP && linePath(iv.vwapArr) && <path d={linePath(iv.vwapArr)} fill="none" stroke="#e879f9" strokeWidth={1.4} strokeDasharray="5,2" />}
    </svg>
  );
}

// ── SUB CHART ─────────────────────────────────────────
function SubChart({ arr1, arr2, color1, color2, min, max, zones, H = 52 }) {
  const W = 580, PL = 4, PR = 4, PT = 4, PB = 4, cw = W - PL - PR, ch = H - PT - PB;
  const d1 = arr1.filter(Boolean).slice(-60);
  const d2 = arr2 ? arr2.filter(Boolean).slice(-60) : [];
  const all = [...d1, ...d2];
  if (all.length < 2) return null;
  const minV = min ?? Math.min(...all) * 0.98, maxV = max ?? Math.max(...all) * 1.02;
  const rng = maxV - minV || 1;
  const sy = (v) => PT + ch * (1 - (v - minV) / rng);
  const sx = (i, len) => PL + (i + 0.5) * (cw / len);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {zones && zones.map((z, i) => (
        <g key={i}>
          <rect x={PL} y={sy(z.max)} width={cw} height={Math.abs(sy(z.min) - sy(z.max))} fill={z.fill} opacity={0.08} />
          <line x1={PL} y1={sy(z.at)} x2={W - PR} y2={sy(z.at)} stroke={z.fill} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
        </g>
      ))}
      {d1.length > 1 && (
        <path d={`M${d1.map((v, i) => `${sx(i, d1.length)},${sy(v)}`).join("L")}`} fill="none" stroke={color1} strokeWidth={1.5} />
      )}
      {d2.length > 1 && (
        <path d={`M${d2.map((v, i) => `${sx(i, d2.length)},${sy(v)}`).join("L")}`} fill="none" stroke={color2} strokeWidth={1.4} />
      )}
    </svg>
  );
}

// ── INDICATOR CARDS ───────────────────────────────────
function IndCards({ iv }) {
  const cards = [
    {
      label: "스토캐스틱 %K",
      value: iv.stochK.toFixed(1),
      sub: iv.stochK <= 20 ? "과매도" : iv.stochK >= 80 ? "과매수" : "중립",
      color: iv.stochK <= 20 ? green : iv.stochK >= 80 ? red : "#f59e0b",
    },
    {
      label: "Williams %R",
      value: iv.wr.toFixed(1),
      sub: iv.wr <= -80 ? "과매도" : iv.wr >= -20 ? "과매수" : "중립",
      color: iv.wr <= -80 ? green : iv.wr >= -20 ? red : "#fb923c",
    },
    {
      label: "ATR 변동성",
      value: fmtN(iv.atr),
      sub: iv.atr > iv.prevATR * 1.2 ? "확대 중" : "안정",
      color: iv.atr > iv.prevATR * 1.2 ? red : green,
    },
    {
      label: "EMA 9 / 21",
      value: iv.ema9 > iv.ema21 ? "골든크로스" : "데드크로스",
      sub: `${fmtN(iv.ema9)} / ${fmtN(iv.ema21)}`,
      color: iv.ema9 > iv.ema21 ? green : red,
    },
    {
      label: "VWAP",
      value: fmtN(iv.vwap),
      sub: iv.last > iv.vwap ? "가격 > VWAP 강세" : "가격 < VWAP 약세",
      color: iv.last > iv.vwap ? green : red,
    },
    {
      label: "RSI(14)",
      value: iv.rsi.toFixed(1),
      sub: iv.rsi >= 70 ? "과매수" : iv.rsi <= 30 ? "과매도" : "중립",
      color: iv.rsi >= 70 ? red : iv.rsi <= 30 ? green : "#a78bfa",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: "#0d1520", border: "1px solid #1e2a3a", borderRadius: 10, padding: "10px 12px", borderTop: `2px solid ${c.color}` }}>
          <div style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{c.label}</div>
          <div style={{ color: c.color, fontFamily: "monospace", fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{c.value}</div>
          <div style={{ color: "#4a5568", fontSize: 10 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── CHART TAB ─────────────────────────────────────────
function ChartTab({ allCandles, ivMap, prices, tf, setTf }) {
  const [sel, setSel] = useState("BTC");
  const [showEMA, setShowEMA] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [subTab, setSubTab] = useState("stoch");

  const iv = ivMap[sel];
  const coin = COINS.find(c => c.id === sel);

  const subTabs = [
    { id: "stoch", label: "STOCH" },
    { id: "wr",    label: "%R" },
    { id: "atr",   label: "ATR" },
    { id: "rsi",   label: "RSI" },
    { id: "macd",  label: "MACD" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Coin selector */}
      <div style={{ display: "flex", gap: 5 }}>
        {COINS.map(c => (
          <button key={c.id} onClick={() => setSel(c.id)}
            style={{ flex: 1, padding: "8px 6px", borderRadius: 9, border: `2px solid ${sel === c.id ? c.color : "#1e2a3a"}`, background: sel === c.id ? c.color + "11" : "transparent", cursor: "pointer", textAlign: "left" }}>
            <div style={{ color: c.color, fontWeight: 800, fontSize: 12 }}>{c.id}</div>
            <div style={{ color: "#4a5568", fontSize: 10, marginTop: 1 }}>{fmtN(Math.round(prices[c.id]?.price ?? c.base))}</div>
            <div style={{ color: clrPnl(prices[c.id]?.change ?? 0), fontSize: 10 }}>{fmtPct(prices[c.id]?.change ?? 0)}</div>
          </button>
        ))}
      </div>

      {/* Timeframe + overlays */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {TIMEFRAMES.map(t => (
          <button key={t.id} onClick={() => setTf(t.id)}
            style={{ padding: "4px 11px", borderRadius: 6, border: `1px solid ${tf === t.id ? green : "#1e2a3a"}`, background: tf === t.id ? green + "22" : "transparent", color: tf === t.id ? green : "#4a5568", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[
            { key: "ema",  label: "EMA", val: showEMA,  set: setShowEMA,  color: "#34d399" },
            { key: "bb",   label: "BB",  val: showBB,   set: setShowBB,   color: "#fbbf24" },
            { key: "vwap", label: "VWAP",val: showVWAP, set: setShowVWAP, color: "#e879f9" },
          ].map(({ key, label, val, set, color }) => (
            <button key={key} onClick={() => set(!val)}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `1px solid ${val ? color : "#1e2a3a"}`, background: val ? color + "22" : "transparent", color: val ? color : "#4a5568", cursor: "pointer", fontWeight: 700 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart */}
      <div style={{ background: "#060d17", borderRadius: 10, border: "1px solid #1e2a3a", overflow: "hidden" }}>
        <div style={{ padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #0d1520" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: coin.color, fontWeight: 800 }}>{sel}</span>
            <span style={{ color: "#e8edf5", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{fmtW(Math.round(prices[sel]?.price ?? coin.base))}</span>
            <span style={{ color: clrPnl(prices[sel]?.change ?? 0), fontSize: 12 }}>{fmtPct(prices[sel]?.change ?? 0)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
            {showEMA && <><span style={{ color: "#34d399" }}>━ EMA9</span><span style={{ color: "#f59e0b" }}>━ EMA21</span></>}
            {showVWAP && <span style={{ color: "#e879f9" }}>╌ VWAP</span>}
          </div>
        </div>
        <CandleChart candles={allCandles[sel]} iv={iv} showEMA={showEMA} showBB={showBB} showVWAP={showVWAP} />
      </div>

      {/* Sub chart selector */}
      <div style={{ display: "flex", gap: 4 }}>
        {subTabs.map(s => (
          <button key={s.id} onClick={() => setSubTab(s.id)}
            style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${subTab === s.id ? green : "#1e2a3a"}`, background: subTab === s.id ? green + "22" : "transparent", color: subTab === s.id ? green : "#4a5568", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Sub chart */}
      <div style={{ background: "#060d17", borderRadius: 10, border: "1px solid #1e2a3a", overflow: "hidden" }}>
        {subTab === "stoch" && (
          <>
            <div style={{ padding: "4px 10px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>STOCHASTIC(14,3)</span>
              <span style={{ color: iv.stochK <= 20 ? green : iv.stochK >= 80 ? red : "#f59e0b", fontSize: 11, fontWeight: 700 }}>%K {iv.stochK.toFixed(1)} · %D {iv.stochD.toFixed(1)}</span>
            </div>
            <SubChart arr1={iv.stochKArr} arr2={iv.stochDArr} color1="#f59e0b" color2="#60a5fa" min={0} max={100}
              zones={[{ at: 20, min: 0, max: 20, fill: green }, { at: 80, min: 80, max: 100, fill: red }]} />
            <div style={{ padding: "0 10px 5px", display: "flex", gap: 10, fontSize: 9, color: "#4a5568" }}>
              <span style={{ color: "#f59e0b" }}>● %K</span><span style={{ color: "#60a5fa" }}>● %D</span>
              <span style={{ marginLeft: "auto" }}>과매도 ≤20 / 과매수 ≥80</span>
            </div>
          </>
        )}
        {subTab === "wr" && (
          <>
            <div style={{ padding: "4px 10px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>WILLIAMS %R(14)</span>
              <span style={{ color: iv.wr <= -80 ? green : iv.wr >= -20 ? red : "#fb923c", fontSize: 11, fontWeight: 700 }}>{iv.wr.toFixed(1)}</span>
            </div>
            <SubChart arr1={iv.wrArr} color1="#fb923c" min={-100} max={0}
              zones={[{ at: -80, min: -100, max: -80, fill: green }, { at: -20, min: -20, max: 0, fill: red }]} />
          </>
        )}
        {subTab === "atr" && (
          <>
            <div style={{ padding: "4px 10px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>ATR(14)</span>
              <span style={{ color: iv.atr > iv.prevATR * 1.2 ? red : green, fontSize: 11, fontWeight: 700 }}>
                {fmtN(iv.atr)} · {iv.atr > iv.prevATR * 1.2 ? "변동성 확대" : "안정"}
              </span>
            </div>
            <SubChart arr1={iv.atrArr} color1="#38bdf8" />
          </>
        )}
        {subTab === "rsi" && (
          <>
            <div style={{ padding: "4px 10px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>RSI(14)</span>
              <span style={{ color: iv.rsi >= 70 ? red : iv.rsi <= 30 ? green : "#a78bfa", fontSize: 11, fontWeight: 700 }}>{iv.rsi.toFixed(1)}</span>
            </div>
            <SubChart arr1={iv.rsiArr} color1="#a78bfa" min={0} max={100}
              zones={[{ at: 30, min: 0, max: 30, fill: green }, { at: 70, min: 70, max: 100, fill: red }]} />
          </>
        )}
        {subTab === "macd" && (
          <>
            <div style={{ padding: "4px 10px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>MACD(12,26,9)</span>
              <span style={{ color: iv.macd > iv.sig ? green : red, fontSize: 11, fontWeight: 700 }}>{iv.macd > iv.sig ? "골든크로스" : "데드크로스"}</span>
            </div>
            <SubChart arr1={iv.macdArr} arr2={iv.sigArr} color1="#60a5fa" color2="#f59e0b" />
            <div style={{ padding: "0 10px 5px", display: "flex", gap: 10, fontSize: 9 }}>
              <span style={{ color: "#60a5fa" }}>● MACD</span><span style={{ color: "#f59e0b" }}>● Signal</span>
            </div>
          </>
        )}
      </div>

      <IndCards iv={iv} />
    </div>
  );
}

// ── COND ROW ──────────────────────────────────────────
function CondRow({ cond, idx, onUpdate, onDelete, canDelete }) {
  const def = CONDITIONS.find(d => d.id === cond.id);
  const grouped = CONDITIONS.reduce((acc, d) => {
    if (!acc[d.group]) acc[d.group] = [];
    acc[d.group].push(d);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center", background: "#060d17", borderRadius: 8, padding: "7px 10px" }}>
      <span style={{ color: "#4a5568", fontSize: 11, minWidth: 16 }}>#{idx + 1}</span>
      <select value={cond.id} onChange={e => { const d = CONDITIONS.find(x => x.id === e.target.value); onUpdate("id", e.target.value); onUpdate("val", d?.def ?? null); }}
        style={{ ...inpS, flex: 2, fontSize: 12 }}>
        {Object.entries(grouped).map(([g, ds]) => (
          <optgroup key={g} label={`── ${g} 지표`}>
            {ds.map(d => <option key={d.id} value={d.id}>{d.label} [{d.ind}]</option>)}
          </optgroup>
        ))}
      </select>
      {def?.hasVal && (
        <input type="number" value={cond.val ?? ""} onChange={e => onUpdate("val", +e.target.value)}
          style={{ ...inpS, width: 64, fontSize: 12 }} placeholder="값" />
      )}
      {canDelete && (
        <button onClick={onDelete} style={{ background: "#ff475722", color: red, border: "1px solid #ff475744", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
      )}
    </div>
  );
}

// ── STRATEGY TAB ──────────────────────────────────────
function StrategyTab({ strategies, setStrategies, ivMap }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "새 전략", coin: "BTC", logic: "AND", amount: 100000,
    conditions: [{ id: "stoch_below", val: 20 }, { id: "ema_golden", val: null }],
  });

  const addCond = () => setForm(f => ({ ...f, conditions: [...f.conditions, { id: "rsi_below", val: 30 }] }));
  const delCond = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, ci) => ci !== i) }));
  const updCond = (i, k, v) => setForm(f => ({ ...f, conditions: f.conditions.map((c, ci) => ci === i ? { ...c, [k]: v } : c) }));

  const presets = [
    { name: "스토캐스틱 과매도 + EMA 골든", coin: "BTC", conditions: [{ id: "stoch_below", val: 20 }, { id: "ema_golden", val: null }] },
    { name: "Williams %R + VWAP 돌파", coin: "ETH", conditions: [{ id: "wr_below", val: -80 }, { id: "above_vwap", val: null }] },
    { name: "ATR 확대 + 스토캐스틱 골든", coin: "SOL", conditions: [{ id: "atr_expand", val: null }, { id: "stoch_golden", val: null }] },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#8892a4", fontSize: 13 }}>AND/OR 복합 조건 · {strategies.length}개 전략</span>
        <button onClick={() => setShowForm(!showForm)} style={btnS(green)}>{showForm ? "취소" : "+ 전략 추가"}</button>
      </div>

      {!showForm && strategies.length === 0 && (
        <div style={cardS}>
          <div style={{ color: "#4a5568", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>⚡ 데이트레이딩 프리셋</div>
          {presets.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#060d17", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
              <div>
                <div style={{ color: "#e8edf5", fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: "#4a5568", fontSize: 11, marginTop: 2 }}>{p.coin} · AND · {p.conditions.length}개 조건</div>
              </div>
              <button onClick={() => { setForm({ ...form, name: p.name, coin: p.coin, logic: "AND", conditions: p.conditions }); setShowForm(true); }}
                style={{ ...btnS("#334155"), fontSize: 11, padding: "5px 10px" }}>불러오기</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={cardS}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div><label style={lblS}>이름</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inpS} /></div>
            <div><label style={lblS}>코인</label>
              <select value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))} style={inpS}>
                {COINS.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
              </select>
            </div>
            <div><label style={lblS}>금액</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} style={inpS} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: "#8892a4", fontSize: 12 }}>연산:</span>
            {["AND", "OR"].map(op => (
              <button key={op} onClick={() => setForm(f => ({ ...f, logic: op }))}
                style={{ padding: "5px 14px", borderRadius: 7, border: `1px solid ${form.logic === op ? green : "#1e2a3a"}`, background: form.logic === op ? green + "22" : "transparent", color: form.logic === op ? green : "#4a5568", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                {op} <span style={{ color: "#4a5568", fontWeight: 400, fontSize: 10 }}>{op === "AND" ? "전부 충족" : "하나라도"}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {form.conditions.map((c, i) => (
              <CondRow key={i} cond={c} idx={i}
                onUpdate={(k, v) => updCond(i, k, v)}
                onDelete={() => delCond(i)}
                canDelete={form.conditions.length > 1} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addCond} style={{ ...btnS("#334155"), fontSize: 12 }}>+ 조건 추가</button>
            <button onClick={() => { setStrategies(s => [...s, { id: uid(), ...form, active: true, triggered: false }]); setShowForm(false); }}
              style={btnS(green)}>저장</button>
          </div>
        </div>
      )}

      {strategies.map(s => {
        const coin = COINS.find(c => c.id === s.coin);
        const iv = ivMap[s.coin];
        const metCount = s.conditions.filter(c => evalCond(c, iv)).length;
        const allMet = s.logic === "AND" ? metCount === s.conditions.length : metCount > 0;
        const firstAct = CONDITIONS.find(d => d.id === s.conditions[0]?.id)?.action ?? "buy";

        return (
          <div key={s.id} style={{ ...cardS, opacity: s.active ? 1 : 0.5, borderLeft: `3px solid ${allMet ? (firstAct === "buy" ? green : red) : "#1e2a3a"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ color: coin.color, fontWeight: 800 }}>{s.coin}</span>
                  <span style={{ color: "#e8edf5", fontWeight: 700 }}>{s.name}</span>
                  <span style={{ background: "#1e2a3a", color: "#8892a4", fontSize: 10, padding: "1px 6px", borderRadius: 3 }}>{s.logic}</span>
                  {allMet && (
                    <span style={{ background: firstAct === "buy" ? green + "22" : red + "22", color: firstAct === "buy" ? green : red, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 4 }}>
                      ● 조건 충족
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                  {s.conditions.map((c, i) => {
                    const def = CONDITIONS.find(d => d.id === c.id);
                    const met = def && evalCond(c, iv);
                    return (
                      <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, background: met ? green + "22" : "#1e2a3a", color: met ? green : "#4a5568", border: `1px solid ${met ? green + "44" : "#1e2a3a"}` }}>
                        {def?.label}{c.val != null ? ` ${c.val}` : ""}
                      </span>
                    );
                  })}
                </div>
                <span style={{ color: "#4a5568", fontSize: 12 }}>{fmtW(s.amount)} · {metCount}/{s.conditions.length} 충족</span>
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                <button onClick={() => setStrategies(p => p.map(x => x.id === s.id ? { ...x, active: !x.active } : x))}
                  style={{ ...btnS("#334155"), fontSize: 11, padding: "4px 9px" }}>{s.active ? "정지" : "재개"}</button>
                <button onClick={() => setStrategies(p => p.filter(x => x.id !== s.id))}
                  style={{ ...btnS(red), fontSize: 11, padding: "4px 9px" }}>삭제</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── BACKTEST ──────────────────────────────────────────
function calcMDD(equity) {
  let peak = equity[0]?.v ?? 0, maxDD = 0;
  equity.forEach(e => { if (e.v > peak) peak = e.v; const d = (peak - e.v) / peak * 100; if (d > maxDD) maxDD = d; });
  return maxDD;
}

function genBTCandles(base, vol, count = 600) {
  const out = [];
  let p = base * (0.85 + Math.random() * 0.15);
  for (let i = 0; i < count; i++) {
    const o = p;
    // 트렌드 + 노이즈 섞기
    const trend = Math.sin(i / 40) * vol * 0.3;
    const noise = (Math.random() - 0.5) * vol;
    const mv = (trend + noise) * p;
    const c = Math.max(p + mv, base * 0.3);
    out.push({ o, h: Math.max(o, c) * (1 + Math.random() * vol * 0.5), l: Math.min(o, c) * (1 - Math.random() * vol * 0.5), c });
    p = c;
  }
  return out;
}

function runBacktest(candles, strat) {
  // 백테스트는 더 긴 캔들 데이터로 실행
  const btCandles = genBTCandles(candles[candles.length-1].c, strat.coin === "BTC" ? 0.018 : strat.coin === "ETH" ? 0.022 : strat.coin === "SOL" ? 0.030 : 0.025);
  const closes = btCandles.map(c => c.c);
  const rsiArr = calcRSI(closes);
  const { macd, sig } = calcMACD(closes);
  const bbArr = calcBB(closes);
  const { k: sk, d: sd } = calcStoch(btCandles);
  const wrArr = calcWR(btCandles);
  const atrArr = calcATR(btCandles);
  const ema9 = calcEMA(closes, 9), ema21 = calcEMA(closes, 21);
  const vwapArr = calcVWAP(btCandles);

  const trades = [], equity = [{ v: strat.capital }];
  let capital = strat.capital, pos = null;

  for (let i = 50; i < btCandles.length; i++) {
    const lb = bbArr[i];
    const iv = {
      rsi: rsiArr[i] ?? 50, macd: macd[i] ?? 0, sig: sig[i] ?? 0,
      lastBB: lb, last: closes[i],
      stochK: sk[i] ?? 50, stochD: sd[i] ?? 50, prevStochK: sk[i-1] ?? 50, prevStochD: sd[i-1] ?? 50,
      wr: wrArr[i] ?? -50, atr: atrArr[i] ?? 0, prevATR: atrArr[i-3] ?? 0,
      ema9: ema9[i] ?? 0, ema21: ema21[i] ?? 0, prevEMA9: ema9[i-1] ?? 0, prevEMA21: ema21[i-1] ?? 0,
      vwap: vwapArr[i] ?? closes[i],
    };

    const allMet = strat.logic === "AND"
      ? strat.conditions.every(c => evalCond(c, iv))
      : strat.conditions.some(c => evalCond(c, iv));

    // 진입: 조건 충족 + 포지션 없음
    if (allMet && !pos && capital >= strat.amount) {
      pos = { buyPrice: closes[i], units: strat.amount / closes[i], cost: strat.amount, entryIdx: i };
      capital -= strat.amount;
    } else if (pos) {
      const sl = pos.buyPrice * (1 - strat.sl / 100);
      const tp = pos.buyPrice * (1 + strat.tp / 100);
      const hitSL = closes[i] <= sl;
      const hitTP = closes[i] >= tp;
      // 최소 20캔들 보유 후 조건 해소되면 청산
      const condGone = !allMet && (i - pos.entryIdx) >= 20;

      if (hitSL || hitTP || condGone) {
        const exitPrice = hitSL ? sl : hitTP ? tp : closes[i];
        const pnl = (exitPrice - pos.buyPrice) * pos.units;
        trades.push({
          buyPrice: pos.buyPrice, sellPrice: exitPrice,
          pnl, pct: pnl / pos.cost * 100,
          exit: hitSL ? "SL" : hitTP ? "TP" : "EXIT",
        });
        capital += pos.cost + pnl;
        pos = null;
      }
    }
    equity.push({ v: capital + (pos ? (closes[i] - pos.buyPrice) * pos.units + pos.cost : 0) });
  }

  // 마지막 포지션 정리
  if (pos) {
    const lastPrice = closes[closes.length - 1];
    const pnl = (lastPrice - pos.buyPrice) * pos.units;
    trades.push({ buyPrice: pos.buyPrice, sellPrice: lastPrice, pnl, pct: pnl / pos.cost * 100, exit: "END" });
    capital += pos.cost + pnl;
  }

  const wins = trades.filter(t => t.pnl > 0);
  return {
    trades, equity,
    totalPnL: trades.reduce((s, t) => s + t.pnl, 0),
    winRate: trades.length ? wins.length / trades.length * 100 : 0,
    tradeCount: trades.length,
    maxDD: calcMDD(equity),
  };
}

function EqChart({ equity }) {
  const W = 560, H = 88, PL = 8, PR = 8, PT = 8, PB = 8;
  if (equity.length < 2) return null;
  const cw = W - PL - PR, ch = H - PT - PB;
  const vals = equity.map(e => e.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals), rng = maxV - minV || 1;
  const sx = (i) => PL + i * (cw / (equity.length - 1));
  const sy = (v) => PT + ch * (1 - (v - minV) / rng);
  const pts = equity.map((e, i) => `${sx(i)},${sy(e.v)}`).join("L");
  const fc = vals.at(-1) >= vals[0] ? green : red;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fc} stopOpacity="0.3" />
          <stop offset="100%" stopColor={fc} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={`${pts}L${sx(equity.length - 1)},${H - PB}L${sx(0)},${H - PB}Z`} fill="url(#eqg)" />
      <path d={`M${pts}`} fill="none" stroke={fc} strokeWidth={1.8} />
      <text x={PL} y={PT + 9} fill="#4a5568" fontSize="9">{fmtN(maxV)}</text>
      <text x={PL} y={H - PB} fill="#4a5568" fontSize="9">{fmtN(minV)}</text>
    </svg>
  );
}

function BacktestTab({ allCandles }) {
  const [form, setForm] = useState({
    coin: "BTC", logic: "AND", capital: 1000000, amount: 100000, sl: 3, tp: 6,
    conditions: [{ id: "rsi_below", val: 35 }, { id: "above_vwap", val: null }],
  });
  const [result, setResult] = useState(null);

  // 코인별 고정 백테스트 캔들 (컴포넌트 마운트 시 1회만 생성)
  const [btCandles] = useState(() =>
    Object.fromEntries(COINS.map(c => [c.id, genBTCandles(c.base, c.vol)]))
  );

  const addCond = () => setForm(f => ({ ...f, conditions: [...f.conditions, { id: "rsi_below", val: 30 }] }));
  const delCond = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, ci) => ci !== i) }));
  const updCond = (i, k, v) => setForm(f => ({ ...f, conditions: f.conditions.map((c, ci) => ci === i ? { ...c, [k]: v } : c) }));

  const run = () => {
    setResult(runBacktest(btCandles[form.coin], { ...form, coin: form.coin }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardS}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
          <div><label style={lblS}>코인</label>
            <select value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))} style={inpS}>
              {COINS.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
            </select>
          </div>
          <div><label style={lblS}>시작 자본</label><input type="number" value={form.capital} onChange={e => setForm(f => ({ ...f, capital: +e.target.value }))} style={inpS} /></div>
          <div><label style={lblS}>1회 금액</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} style={inpS} /></div>
          <div><label style={lblS}>손절 %</label><input type="number" value={form.sl} onChange={e => setForm(f => ({ ...f, sl: +e.target.value }))} style={inpS} /></div>
          <div><label style={lblS}>익절 %</label><input type="number" value={form.tp} onChange={e => setForm(f => ({ ...f, tp: +e.target.value }))} style={inpS} /></div>
          <div><label style={lblS}>연산</label>
            <select value={form.logic} onChange={e => setForm(f => ({ ...f, logic: e.target.value }))} style={inpS}>
              <option value="AND">AND — 모두 충족</option>
              <option value="OR">OR — 하나라도</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {form.conditions.map((c, i) => (
            <CondRow key={i} cond={c} idx={i} onUpdate={(k, v) => updCond(i, k, v)} onDelete={() => delCond(i)} canDelete={form.conditions.length > 1} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCond} style={{ ...btnS("#334155"), fontSize: 12 }}>+ 조건</button>
          <button onClick={run} style={btnS("#f59e0b")}>▶ 백테스팅 실행</button>
        </div>
      </div>

      {result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[
              { l: "총 손익", v: fmtW(result.totalPnL), c: clrPnl(result.totalPnL) },
              { l: "승률", v: `${result.winRate.toFixed(1)}%`, c: result.winRate >= 50 ? green : red },
              { l: "거래수", v: `${result.tradeCount}회`, c: "#e8edf5" },
              { l: "MDD", v: `${result.maxDD.toFixed(1)}%`, c: "#f59e0b" },
            ].map(s => (
              <div key={s.l} style={{ ...cardS, textAlign: "center" }}>
                <div style={{ color: "#4a5568", fontSize: 10, marginBottom: 3 }}>{s.l}</div>
                <div style={{ color: s.c, fontFamily: "monospace", fontWeight: 800, fontSize: 15 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={cardS}>
            <div style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>자본 곡선</div>
            <EqChart equity={result.equity} />
          </div>
          {result.trades.length > 0 && (
            <div style={cardS}>
              <div style={{ color: "#4a5568", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>최근 거래 내역</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 50px", gap: 6, color: "#334155", fontSize: 10, paddingBottom: 6, borderBottom: "1px solid #1e2a3a" }}>
                <span>매수가</span><span>매도가</span><span>손익</span><span>수익률</span><span>구분</span>
              </div>
              {result.trades.slice(-10).reverse().map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 50px", gap: 6, padding: "5px 0", borderBottom: "1px solid #0d1520", fontSize: 11 }}>
                  <span style={{ color: "#8892a4", fontFamily: "monospace" }}>{fmtN(t.buyPrice)}</span>
                  <span style={{ color: "#8892a4", fontFamily: "monospace" }}>{fmtN(t.sellPrice)}</span>
                  <span style={{ color: clrPnl(t.pnl), fontWeight: 700, fontFamily: "monospace" }}>{t.pnl >= 0 ? "+" : ""}{fmtN(t.pnl)}</span>
                  <span style={{ color: clrPnl(t.pct), fontFamily: "monospace" }}>{fmtPct(t.pct)}</span>
                  <span style={{ color: t.exit === "SL" ? red : t.exit === "TP" ? green : "#8892a4", fontSize: 10 }}>{t.exit}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── PORTFOLIO TAB ─────────────────────────────────────
function PortfolioTab({ trades }) {
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const wins = trades.filter(t => t.pnl > 0).length;

  const byCoin = trades.reduce((acc, t) => {
    if (!acc[t.coin]) acc[t.coin] = [];
    acc[t.coin].push(t);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardS, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 2 }}>총 실현 손익</div>
          <div style={{ color: clrPnl(totalPnL), fontFamily: "monospace", fontWeight: 900, fontSize: 22 }}>{totalPnL >= 0 ? "+" : ""}{fmtW(totalPnL)}</div>
        </div>
        <div style={{ width: 1, height: 40, background: "#1e2a3a" }} />
        <div>
          <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 2 }}>승률</div>
          <div style={{ color: wins >= trades.length / 2 ? green : red, fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>
            {trades.length ? ((wins / trades.length) * 100).toFixed(0) : 0}%
          </div>
        </div>
        <div>
          <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 2 }}>총 거래</div>
          <div style={{ color: "#e8edf5", fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>{trades.length}건</div>
        </div>
        <div>
          <div style={{ color: "#4a5568", fontSize: 11, marginBottom: 2 }}>투자금</div>
          <div style={{ color: "#e8edf5", fontFamily: "monospace", fontWeight: 700, fontSize: 16 }}>{fmtW(totalCost)}</div>
        </div>
      </div>

      {Object.entries(byCoin).map(([coinId, ts]) => {
        const coin = COINS.find(c => c.id === coinId);
        const pnl = ts.reduce((s, t) => s + t.pnl, 0);
        const cost = ts.reduce((s, t) => s + t.cost, 0);
        return (
          <div key={coinId} style={{ ...cardS, borderLeft: `3px solid ${coin.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: coin.color, fontWeight: 800, fontSize: 15 }}>{coinId}</span>
                <span style={{ color: "#4a5568", fontSize: 12 }}>{ts.length}건</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: clrPnl(pnl), fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>{pnl >= 0 ? "+" : ""}{fmtW(pnl)}</div>
                <div style={{ color: clrPnl(pnl / cost * 100), fontSize: 11 }}>{fmtPct(pnl / cost * 100)}</div>
              </div>
            </div>
            {ts.slice(-4).reverse().map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", background: "#060d17", borderRadius: 5, marginBottom: 3 }}>
                <span style={{ color: "#4a5568" }}>{t.strategy}</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "#8892a4", fontFamily: "monospace" }}>{fmtW(t.cost)}</span>
                  <span style={{ color: clrPnl(t.pnl), fontFamily: "monospace", fontWeight: 700 }}>{t.pnl >= 0 ? "+" : ""}{fmtW(t.pnl)}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {trades.length === 0 && (
        <div style={{ ...cardS, textAlign: "center", padding: 40, color: "#334155" }}>아직 체결된 거래가 없습니다</div>
      )}
    </div>
  );
}

// ── TOAST ─────────────────────────────────────────────
function Toasts({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === "buy" ? green : red, color: "#000", padding: "10px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, boxShadow: "0 4px 20px #0008", maxWidth: 280 }}>
          {t.type === "buy" ? "🟢 매수" : "🔴 매도"} 체결<br />
          <span style={{ fontWeight: 500, fontSize: 12 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────
const cardS = { background: "#0d1520", border: "1px solid #1e2a3a", borderRadius: 12, padding: 16 };
const lblS = { color: "#4a5568", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, display: "block", marginBottom: 5 };
const inpS = { background: "#060d17", border: "1px solid #1e2a3a", borderRadius: 8, color: "#e8edf5", padding: "7px 9px", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
const btnS = (bg) => ({ background: bg, color: ["#334155", "#0d1520"].includes(bg) ? "#8892a4" : "#000", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" });

// ── MAIN APP ──────────────────────────────────────────
// ── 업비트 API 유틸 ───────────────────────────────────
const PROXY = "https://corsproxy.io/?";
const MARKET_MAP = { BTC: "KRW-BTC", ETH: "KRW-ETH", SOL: "KRW-SOL", XRP: "KRW-XRP" };
const TF_URL = { "1m": "minutes/1", "3m": "minutes/3", "5m": "minutes/5", "15m": "minutes/15" };

async function fetchUpbitCandles(coinId, tf, count = 200) {
  const market = MARKET_MAP[coinId];
  const url = PROXY + encodeURIComponent(`https://api.upbit.com/v1/candles/${TF_URL[tf]}?market=${market}&count=${count}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error("API 오류");
  const data = await res.json();
  return data.reverse().map(d => ({
    o: d.opening_price, h: d.high_price, l: d.low_price, c: d.trade_price, t: d.timestamp,
  }));
}

async function fetchUpbitTicker(coinIds) {
  const markets = coinIds.map(id => MARKET_MAP[id]).join(",");
  const url = PROXY + encodeURIComponent(`https://api.upbit.com/v1/ticker?markets=${markets}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error("티커 오류");
  const data = await res.json();
  const result = {};
  data.forEach(d => {
    const id = Object.keys(MARKET_MAP).find(k => MARKET_MAP[k] === d.market);
    if (id) result[id] = { price: d.trade_price, change: parseFloat((d.signed_change_rate * 100).toFixed(2)) };
  });
  return result;
}

export default function App() {
  const [tab, setTab] = useState("chart");
  const [tf, setTf] = useState("5m");
  const [toasts, setToasts] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [strategies, setStrategies] = useState([
    {
      id: uid(), name: "RSI 과매도 + VWAP", coin: "BTC", logic: "AND", amount: 100000, active: true, triggered: false,
      conditions: [{ id: "rsi_below", val: 35 }, { id: "above_vwap", val: null }],
    },
    {
      id: uid(), name: "Williams %R + EMA 골든", coin: "ETH", logic: "AND", amount: 80000, active: true, triggered: false,
      conditions: [{ id: "wr_below", val: -80 }, { id: "ema_golden", val: null }],
    },
  ]);

  const [prices, setPrices] = useState(() =>
    Object.fromEntries(COINS.map(c => [c.id, { price: c.base, change: 0 }]))
  );
  const [allCandles, setAllCandles] = useState(() =>
    Object.fromEntries(COINS.map(c => [c.id, genCandles(c.base, c.vol)]))
  );

  // 최초 캔들 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all(COINS.map(c => fetchUpbitCandles(c.id, tf, 200)))
      .then(results => {
        const next = {};
        COINS.forEach((c, i) => { next[c.id] = results[i]; });
        setAllCandles(next);
        setLoading(false);
      })
      .catch(e => {
        setError("업비트 API 연결 실패 — 시뮬레이션 모드로 실행 중");
        setLoading(false);
      });
  }, [tf]);

  // 실시간 가격 + 최신 캔들 폴링 (15초마다)
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        // 티커 (현재가)
        const newPrices = await fetchUpbitTicker(COINS.map(c => c.id));
        setPrices(prev => ({ ...prev, ...newPrices }));

        // 최신 캔들 1개씩 추가
        const latest = await Promise.all(COINS.map(c => fetchUpbitCandles(c.id, tf, 3)));
        setAllCandles(prev => {
          const next = {};
          COINS.forEach((c, i) => {
            const existing = prev[c.id];
            const newCandles = latest[i];
            // 마지막 캔들 업데이트 or 추가
            const merged = [...existing];
            newCandles.forEach(nc => {
              const lastIdx = merged.length - 1;
              if (merged[lastIdx]?.t === nc.t) {
                merged[lastIdx] = nc; // 현재 캔들 업데이트
              } else if (nc.t > (merged[lastIdx]?.t ?? 0)) {
                merged.push(nc); // 새 캔들 추가
              }
            });
            if (merged.length > 300) merged.splice(0, merged.length - 300);
            next[c.id] = merged;
          });
          return next;
        });
      } catch (e) {
        // 폴링 실패 시 무시 (이전 데이터 유지)
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [tf]);

  const ivMap = Object.fromEntries(COINS.map(c => [c.id, getIndicators(allCandles[c.id])]));

  // 전략 체크
  useEffect(() => {
    const triggered = [];
    setStrategies(prev => prev.map(s => {
      if (!s.active || s.triggered) return s;
      const iv = ivMap[s.coin];
      const met = s.logic === "AND"
        ? s.conditions.every(c => evalCond(c, iv))
        : s.conditions.some(c => evalCond(c, iv));
      if (met) { triggered.push(s); return { ...s, triggered: true }; }
      return s;
    }));
    triggered.forEach(s => {
      const act = CONDITIONS.find(d => d.id === s.conditions[0]?.id)?.action ?? "buy";
      const price = prices[s.coin]?.price ?? 0;
      setTrades(t => [{
        id: uid(), coin: s.coin, strategy: s.name, cost: s.amount,
        pnl: 0, pct: 0, price, time: new Date().toLocaleTimeString("ko-KR"),
      }, ...t].slice(0, 100));
      const toast = { id: uid(), type: act, msg: `[${s.coin}] ${s.name} — ${fmtW(s.amount)}` };
      setToasts(t => [toast, ...t]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== toast.id)), 5000);
    });
  }, [allCandles]);

  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const TABS = [
    { id: "chart",     label: "📊 차트" },
    { id: "strategy",  label: "⚡ 전략" },
    { id: "backtest",  label: "🔬 백테스트" },
    { id: "portfolio", label: "💼 포트폴리오" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#060d17", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", color: "#e8edf5", paddingBottom: 50 }}>
      <Toasts toasts={toasts} />

      {/* 헤더 */}
      <div style={{ background: "#0a1321", borderBottom: "1px solid #1e2a3a", padding: "11px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.5 }}>
            <span style={{ color: green }}>AUTO</span>COIN
          </span>
          <span style={{ background: "#00d4a122", color: green, fontSize: 9, marginLeft: 8, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>
            {loading ? "로딩 중..." : error ? "시뮬레이션" : "업비트 LIVE"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {COINS.map(c => (
            <div key={c.id} style={{ textAlign: "right" }}>
              <div style={{ color: "#4a5568", fontSize: 9 }}>{c.id}</div>
              <div style={{ color: "#e8edf5", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{fmtN(Math.round(prices[c.id]?.price ?? c.base))}</div>
              <div style={{ color: clrPnl(prices[c.id]?.change ?? 0), fontSize: 9 }}>{fmtPct(prices[c.id]?.change ?? 0)}</div>
            </div>
          ))}
          <div style={{ borderLeft: "1px solid #1e2a3a", paddingLeft: 12 }}>
            <div style={{ color: "#4a5568", fontSize: 9 }}>알림 체결</div>
            <div style={{ color: "#e8edf5", fontFamily: "monospace", fontSize: 11, fontWeight: 800 }}>{trades.length}건</div>
          </div>
        </div>
      </div>

      {/* 로딩 / 에러 배너 */}
      {loading && (
        <div style={{ background: "#0d1520", borderBottom: "1px solid #1e2a3a", padding: "10px 18px", textAlign: "center" }}>
          <span style={{ color: green, fontSize: 13 }}>⏳ 업비트에서 실제 캔들 데이터 불러오는 중...</span>
        </div>
      )}
      {error && !loading && (
        <div style={{ background: "#2d1515", borderBottom: "1px solid #ff475744", padding: "8px 18px", textAlign: "center" }}>
          <span style={{ color: "#ff4757", fontSize: 12 }}>⚠️ {error}</span>
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 12px 0" }}>
        {/* 탭 */}
        <div style={{ display: "flex", gap: 3, background: "#0d1520", borderRadius: 10, padding: 3, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: tab === t.id ? green : "transparent", color: tab === t.id ? "#000" : "#4a5568" }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "chart"     && <ChartTab allCandles={allCandles} ivMap={ivMap} prices={prices} tf={tf} setTf={setTf} />}
        {tab === "strategy"  && <StrategyTab strategies={strategies} setStrategies={setStrategies} ivMap={ivMap} />}
        {tab === "backtest"  && <BacktestTab allCandles={allCandles} />}
        {tab === "portfolio" && <PortfolioTab trades={trades} />}

        <div style={{ marginTop: 18, padding: 8, background: "#0d1520", borderRadius: 8, border: "1px solid #1e2a3a", textAlign: "center" }}>
          <span style={{ color: "#334155", fontSize: 10 }}>실제 주문은 업비트 앱에서 직접 — 이 앱은 신호 감지 전용</span>
        </div>
      </div>
    </div>
  );
}
