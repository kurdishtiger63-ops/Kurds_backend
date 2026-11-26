"use strict";
const zlib = require("zlib");

const UA = "Mozilla/5.0 (KurdsStudio)";

function lz4(src, outLen) {
  const out = Buffer.alloc(outLen);
  let ip = 0;
  let op = 0;
  while (ip < src.length) {
    const token = src[ip++];
    let lit = token >> 4;
    if (lit === 15) {
      let b;
      do {
        b = src[ip++];
        lit += b;
      } while (b === 255);
    }
    src.copy(out, op, ip, ip + lit);
    ip += lit;
    op += lit;
    if (ip >= src.length) break;
    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    let mlen = token & 15;
    if (mlen === 15) {
      let b;
      do {
        b = src[ip++];
        mlen += b;
      } while (b === 255);
    }
    mlen += 4;
    let from = op - offset;
    for (let i = 0; i < mlen; i++) out[op++] = out[from++];
  }
  return out;
}

class Rd {
  constructor(b) {
    this.b = b;
    this.p = 0;
  }
  u8() {
    return this.b[this.p++];
  }
  u32() {
    const v = this.b.readUInt32LE(this.p);
    this.p += 4;
    return v;
  }
  i32() {
    const v = this.b.readInt32LE(this.p);
    this.p += 4;
    return v;
  }
  str() {
    const n = this.u32();
    const s = this.b.toString("utf8", this.p, this.p + n);
    this.p += n;
    return s;
  }
}

function inter(r, n, k) {
  const out = new Array(n);
  const base = r.p;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j < k; j++) v = v * 256 + r.b[base + j * n + i];
    out[i] = v;
  }
  r.p = base + n * k;
  return out;
}
const zig = (u) => (u >>> 1) ^ -(u & 1);
const fbuf = Buffer.alloc(4);
function f32(u) {
  const bits = ((u >>> 1) | (u << 31)) >>> 0;
  fbuf.writeUInt32LE(bits, 0);
  return fbuf.readFloatLE(0);
}
const readInts = (r, n) => inter(r, n, 4).map(zig);
const readFloats = (r, n) => inter(r, n, 4).map(f32);
function readRefs(r, n) {
  const a = readInts(r, n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += a[i];
    a[i] = acc;
  }
  return a;
}

const ROT = {
  0x02: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  0x03: [1, 0, 0, 0, 0, -1, 0, 1, 0],
  0x05: [1, 0, 0, 0, -1, 0, 0, 0, -1],
  0x06: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  0x07: [0, 1, 0, 1, 0, 0, 0, 0, -1],
  0x09: [0, 0, 1, 1, 0, 0, 0, 1, 0],
  0x0a: [0, -1, 0, 1, 0, 0, 0, 0, 1],
  0x0c: [0, 0, -1, 1, 0, 0, 0, -1, 0],
  0x0d: [0, 1, 0, 0, 0, 1, 1, 0, 0],
  0x0e: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  0x10: [0, -1, 0, 0, 0, -1, 1, 0, 0],
  0x11: [0, 0, 1, 0, -1, 0, 1, 0, 0],
  0x14: [-1, 0, 0, 0, 1, 0, 0, 0, -1],
  0x15: [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  0x17: [-1, 0, 0, 0, -1, 0, 0, 0, 1],
  0x18: [-1, 0, 0, 0, 0, -1, 0, -1, 0],
  0x19: [0, 1, 0, -1, 0, 0, 0, 0, 1],
  0x1b: [0, 0, -1, -1, 0, 0, 0, 1, 0],
  0x1c: [0, -1, 0, -1, 0, 0, 0, 0, -1],
  0x1e: [0, 0, 1, -1, 0, 0, 0, -1, 0],
  0x1f: [0, 1, 0, 0, 0, -1, -1, 0, 0],
  0x20: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  0x22: [0, -1, 0, 0, 0, 1, -1, 0, 0],
  0x23: [0, 0, -1, 0, -1, 0, -1, 0, 0],
};

function readProp(type, r, n, data) {
  switch (type) {
    case 0x1: {
      const a = [];
      for (let i = 0; i < n; i++) a.push(r.str());
      return a;
    }
    case 0x2: {
      const a = [];
      for (let i = 0; i < n; i++) a.push(r.u8() !== 0);
      return a;
    }
    case 0x3:
      return readInts(r, n);
    case 0x4:
      return readFloats(r, n);
    case 0x5: {
      const a = [];
      for (let i = 0; i < n; i++) {
        a.push(data.readDoubleLE(r.p));
        r.p += 8;
      }
      return a;
    }
    case 0xb:
      return inter(r, n, 4);
    case 0xc: {
      const R = readFloats(r, n);
      const G = readFloats(r, n);
      const B = readFloats(r, n);
      return R.map((_, i) => [R[i], G[i], B[i]]);
    }
    case 0xd: {
      const X = readFloats(r, n);
      const Y = readFloats(r, n);
      return X.map((_, i) => [X[i], Y[i]]);
    }
    case 0xe: {
      const X = readFloats(r, n);
      const Y = readFloats(r, n);
      const Z = readFloats(r, n);
      return X.map((_, i) => [X[i], Y[i], Z[i]]);
    }
    case 0x10: {
      const rots = [];
      for (let i = 0; i < n; i++) {
        const id = r.u8();
        if (id === 0) {
          const m = [];
          for (let k = 0; k < 9; k++) {
            m.push(data.readFloatLE(r.p));
            r.p += 4;
          }
          rots.push(m);
        } else {
          rots.push(ROT[id] || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        }
      }
      const X = readFloats(r, n);
      const Y = readFloats(r, n);
      const Z = readFloats(r, n);
      return rots.map((m, i) => [X[i], Y[i], Z[i], ...m]);
    }
    case 0x12:
      return inter(r, n, 4);
    case 0x13:
      return readRefs(r, n);
    case 0x1a: {
      const R = [];
      const G = [];
      const B = [];
      for (let i = 0; i < n; i++) R.push(r.u8());
      for (let i = 0; i < n; i++) G.push(r.u8());
      for (let i = 0; i < n; i++) B.push(r.u8());
      return R.map((_, i) => [R[i], G[i], B[i]]);
    }
    default:
      return null;
  }
}

function parseBinary(buf) {
  const classes = {};
  const insts = {};
  let p = 32;
  while (p + 16 <= buf.length) {
    const name = buf.toString("ascii", p, p + 4);
    const clen = buf.readUInt32LE(p + 4);
    const ulen = buf.readUInt32LE(p + 8);
    p += 16;
    let data;
    if (clen === 0) {
      data = buf.subarray(p, p + ulen);
      p += ulen;
    } else {
      data = lz4(buf.subarray(p, p + clen), ulen);
      p += clen;
    }
    if (name.startsWith("END")) break;
    const r = new Rd(data);
    if (name === "INST") {
      const cid = r.u32();
      const cname = r.str();
      const hasSvc = r.u8();
      const n = r.i32();
      const refs = readRefs(r, n);
      void hasSvc;
      classes[cid] = { name: cname, refs };
      for (const ref of refs) insts[ref] = { id: ref, c: cname, p: {}, parent: -1, ch: [] };
    } else if (name === "PROP") {
      const cid = r.u32();
      const cls = classes[cid];
      if (!cls) continue;
      const pname = r.str();
      const type = r.u8();
      const n = cls.refs.length;
      let vals = null;
      try {
        vals = readProp(type, r, n, data);
      } catch (e) {
        vals = null;
      }
      if (!vals && type !== 0x1) {
        const txt = data.toString("latin1", r.p);
        const found = txt.match(/rbxassetid:\/\/\d+|[?&]id=\d+|rbxasset:\/\/[^\x00-\x1f"]+/g) || [];
        if (found.length === n) vals = found;
      }
      if (vals) for (let i = 0; i < n; i++) insts[cls.refs[i]].p[pname] = vals[i];
    } else if (name === "PRNT") {
      r.u8();
      const n = r.i32();
      const kids = readRefs(r, n);
      const pars = readRefs(r, n);
      for (let i = 0; i < n; i++) {
        const k = insts[kids[i]];
        if (!k) continue;
        k.parent = pars[i];
      }
    }
  }
  const roots = [];
  for (const k of Object.values(insts)) {
    const par = insts[k.parent];
    if (par) par.ch.push(k);
    else roots.push(k);
  }
  return roots;
}

function unent(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function parseXml(text) {
  const re = /<(\/?)([A-Za-z0-9_]+)((?:\s+[A-Za-z0-9_:]+="[^"]*")*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  const root = { tag: "root", at: {}, ch: [], text: "" };
  const st = [root];
  let m;
  while ((m = re.exec(text))) {
    if (m[2]) {
      if (m[1]) {
        if (st.length > 1) st.pop();
      } else {
        const at = {};
        (m[3] || "").replace(/([A-Za-z0-9_:]+)="([^"]*)"/g, (_, k, v) => {
          at[k] = unent(v);
          return "";
        });
        const el = { tag: m[2], at, ch: [], text: "" };
        st[st.length - 1].ch.push(el);
        if (!m[4]) st.push(el);
      }
    } else if (m[5] !== undefined) {
      st[st.length - 1].text += m[5];
    } else if (m[6] !== undefined) {
      st[st.length - 1].text += unent(m[6]);
    }
  }
  const sub = (e, t) => {
    const x = e.ch.find((c) => c.tag === t);
    return x ? Number(x.text) : 0;
  };
  function prop(e) {
    const t = e.tag;
    const v = e.text.trim();
    switch (t) {
      case "string":
      case "ProtectedString":
        return e.text;
      case "Content": {
        const u = e.ch.find((c) => c.tag === "url");
        return u ? u.text.trim() : v;
      }
      case "bool":
        return v === "true";
      case "float":
      case "double":
      case "int":
      case "int64":
      case "token":
      case "BrickColor":
        return Number(v);
      case "Color3uint8": {
        const n = Number(v) >>> 0;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      case "Color3":
        return e.ch.length ? [sub(e, "R"), sub(e, "G"), sub(e, "B")] : null;
      case "Vector3":
        return [sub(e, "X"), sub(e, "Y"), sub(e, "Z")];
      case "CoordinateFrame":
        return ["X", "Y", "Z", "R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"].map((k) => sub(e, k));
      default:
        return null;
    }
  }
  function item(e) {
    const node = { c: e.at.class, p: {}, ch: [] };
    for (const c of e.ch) {
      if (c.tag === "Properties") {
        for (const pe of c.ch) {
          const val = prop(pe);
          if (val !== null && pe.at.name) node.p[pe.at.name] = val;
        }
      } else if (c.tag === "Item") node.ch.push(item(c));
    }
    return node;
  }
  const roblox = root.ch.find((c) => c.tag === "roblox");
  return roblox ? roblox.ch.filter((c) => c.tag === "Item").map(item) : [];
}

function decodeFile(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const head = buf.toString("latin1", 0, 8);
  if (head === "<roblox!") return parseBinary(buf);
  const t = buf.toString("utf8", 0, 200);
  if (t.includes("<roblox")) return parseXml(buf.toString("utf8"));
  throw new Error("Unknown file format");
}

const KEEP = new Set([
  "Name", "CFrame", "Size", "size", "Color3uint8", "Color", "Material", "Transparency", "Reflectance", "Anchored", "CanCollide",
  "Shape", "MeshId", "TextureID", "TextureId", "InitialSize", "Scale", "Offset", "MeshType", "Texture", "Face", "StudsPerTileU",
  "StudsPerTileV", "Source", "Value", "SoundId", "Volume", "Looped", "Brightness", "Range", "Enabled", "Color3", "Angle",
  "Image", "Text", "Position", "Visible", "Archivable", "CanTouch", "CastShadow",
]);

function toTree(roots, limit) {
  let count = 0;
  let truncated = false;
  function conv(k) {
    if (count >= limit) {
      truncated = true;
      return null;
    }
    count++;
    const p = {};
    for (const [key, v] of Object.entries(k.p)) {
      if (!KEEP.has(key)) continue;
      p[key] = v;
    }
    if (p.size && !p.Size) p.Size = p.size;
    delete p.size;
    if (p.Color && !p.Color3uint8 && Array.isArray(p.Color)) {
      p.Color3uint8 = p.Color.map((x) => Math.max(0, Math.min(255, Math.round(x * 255))));
    }
    delete p.Color;
    if (p.TextureId && !p.TextureID) p.TextureID = p.TextureId;
    delete p.TextureId;
    const node = { c: k.c, n: p.Name || k.c, p, ch: [] };
    delete p.Name;
    for (const c of k.ch) {
      const x = conv(c);
      if (x) node.ch.push(x);
    }
    return node;
  }
  const out = [];
  for (const r of roots) {
    const x = conv(r);
    if (x) out.push(x);
  }
  return { tree: out, count, truncated };
}

async function fetchAsset(id) {
  const meta = await fetch(`https://assetdelivery.roblox.com/v2/assetId/${Number(id)}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const j = await meta.json().catch(() => ({}));
  const loc = j && j.locations && j.locations[0] && j.locations[0].location;
  if (!loc) {
    const msg = j && j.errors && j.errors[0] && j.errors[0].message;
    throw new Error(msg ? `Roblox: ${msg}` : `Roblox answered ${meta.status}`);
  }
  const r = await fetch(loc, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Download failed ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { decodeFile, toTree, fetchAsset, parseBinary, parseXml, lz4 };
