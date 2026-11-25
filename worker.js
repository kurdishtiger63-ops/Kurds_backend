const MATERIALS = {
  Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Basalt: 788, Slate: 800,
  CrackedLava: 804, Concrete: 816, Limestone: 820, Granite: 832, Pavement: 838, Brick: 848, Pebble: 864,
  Cobblestone: 880, Rock: 896, Sandstone: 912, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Metal: 1088,
  Grass: 1280, LeafyGrass: 1284, Sand: 1296, Fabric: 1312, Snow: 1328, Mud: 1344, Ground: 1360, Asphalt: 1376,
  Salt: 1392, Ice: 1536, Glacier: 1552, Glass: 1568, ForceField: 1584, Cardboard: 1792, Carpet: 1808,
  CeramicTiles: 1824, ClayRoofTiles: 1840, RoofShingles: 1856, Leather: 1872, Plaster: 1888, Rubber: 1904,
};
const SHAPES = { Ball: 0, Block: 1, Cylinder: 2 };
const SERVICES = {
  Workspace: "Workspace", Lighting: "Lighting", MaterialService: "MaterialService", ReplicatedFirst: "ReplicatedFirst", ReplicatedStorage: "ReplicatedStorage",
  StarterPack: "StarterPack", StarterGui: "StarterGui", StarterPlayer: "StarterPlayer", Teams: "Teams",
  ServerStorage: "ServerStorage", ServerScriptService: "ServerScriptService", SoundService: "SoundService",
};
const PARTS = ["Part", "WedgePart", "CornerWedgePart", "SpawnLocation"];

let counter = 0;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function props(d, cls) {
  let p = `<string name="Name">${esc(d.n)}</string>`;
  if (PARTS.includes(cls) && d.cf && d.s) {
    const c = d.cf.map(num);
    const names = ["X", "Y", "Z", "R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"];
    p += `<CoordinateFrame name="CFrame">${names.map((n, i) => `<${n}>${c[i]}</${n}>`).join("")}</CoordinateFrame>`;
    p += `<Vector3 name="size"><X>${num(d.s[0])}</X><Y>${num(d.s[1])}</Y><Z>${num(d.s[2])}</Z></Vector3>`;
    const col = d.col || [163, 162, 165];
    p += `<Color3uint8 name="Color3uint8">${(255 << 24 | col[0] << 16 | col[1] << 8 | col[2]) >>> 0}</Color3uint8>`;
    p += `<token name="Material">${MATERIALS[d.m] || 256}</token>`;
    p += `<bool name="Anchored">${d.a !== false}</bool><bool name="CanCollide">${d.cc !== false}</bool>`;
    p += `<float name="Transparency">${num(d.t)}</float><float name="Reflectance">${num(d.r)}</float>`;
    if (cls === "Part") p += `<token name="shape">${SHAPES[d.sh] ?? 1}</token>`;
    if (cls === "SpawnLocation") p += `<bool name="Neutral">true</bool>`;
  }
  if (cls === "StringValue") p += `<string name="Value">${esc(d.val ?? "")}</string>`;
  if (cls === "BoolValue") p += `<bool name="Value">${d.val === true}</bool>`;
  if (cls === "IntValue") p += `<int64 name="Value">${Math.trunc(num(d.val))}</int64>`;
  if (cls === "NumberValue") p += `<double name="Value">${num(d.val)}</double>`;
  return p;
}

function item(d, ctx) {
  if (d.rig) { ctx.skipped++; return ""; }
  let cls = d.c;
  let extra = "";
  if (cls === "StringValue" && ["Script", "LocalScript", "ModuleScript"].includes(d.k)) {
    cls = d.k;
    extra = `<ProtectedString name="Source"><![CDATA[${String(d.val ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]></ProtectedString>`;
  }
  ctx.count++;
  if (ctx.count % 500 === 0) ctx.log(`Uploading objects ${ctx.count}`);
  let p = cls === d.c ? props(d, cls) : `<string name="Name">${esc(d.n)}</string>` + extra;
  const kids = (d.ch || []).map((k) => item(k, ctx)).join("");
  return `<Item class="${esc(cls)}" referent="RBX${++counter}"><Properties>${p}</Properties>${kids}</Item>`;
}

function buildPlace(project, log) {
  counter = 0;
  const ctx = { count: 0, skipped: 0, log };
  let body = "";
  for (const [root, cls] of Object.entries(SERVICES)) {
    const kids = (project.roots[root] || []).map((d) => {
      if (root === "StarterPlayer" && (d.n === "StarterPlayerScripts" || d.n === "StarterCharacterScripts")) {
        const inner = (d.ch || []).map((k) => item(k, ctx)).join("");
        return `<Item class="${d.n}" referent="RBX${++counter}"><Properties><string name="Name">${d.n}</string></Properties>${inner}</Item>`;
      }
      return item(d, ctx);
    }).join("");
    body += `<Item class="${cls}" referent="RBX${++counter}"><Properties><string name="Name">${cls}</string></Properties>${kids}</Item>`;
  }
  return { xml: `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4"><Meta name="ExplicitAutoJoints">true</Meta>${body}</roblox>`, count: ctx.count, skipped: ctx.skipped };
}

const J = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const send = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: J });

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 KurdsStudio", Accept: "application/json" } });
  if (!r.ok) throw new Error(`Roblox answered ${r.status} for ${url.split("?")[0]}`);
  return r.json();
}

export default {
  async fetch(req) {
    const u = new URL(req.url);
    try {
      if (req.method === "GET" && u.pathname === "/games") {
        const id = Number(u.searchParams.get("userId"));
        const j = await getJson(`https://games.roblox.com/v2/users/${id}/games?limit=50&sortOrder=Asc`);
        return send(200, { games: (j.data || []).filter((g) => g.rootPlace && g.rootPlace.id).map((g) => ({ name: g.name, universeId: g.id, placeId: g.rootPlace.id })) });
      }
      if (req.method === "GET" && u.pathname === "/search") {
        const q = encodeURIComponent(u.searchParams.get("q") || "");
        const cat = [10, 13, 3, 38, 4].includes(Number(u.searchParams.get("cat"))) ? Number(u.searchParams.get("cat")) : 10;
        const j = await getJson(`https://apis.roblox.com/toolbox-service/v1/marketplace/${cat}?limit=30&keyword=${q}`);
        const ids = (j.data || []).map((x) => x.id).slice(0, 30);
        let names = {};
        if (ids.length) {
          try {
            const dj = await getJson(`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(",")}`);
            for (const it of dj.data || []) names[it.asset.id] = it.asset.name;
          } catch (e) {}
        }
        return send(200, { items: ids.map((id) => ({ id, name: names[id] || String(id) })) });
      }
      if (req.method === "POST" && u.pathname === "/publish") {
        const d = JSON.parse(await req.text());
        const lines = [];
        const place = buildPlace(d.project, (m) => lines.push(m));
        lines.push(`Built ${place.count} objects` + (place.skipped ? ` (${place.skipped} rigs skipped)` : ""));
        const url = `https://apis.roblox.com/universes/v1/${Number(d.universeId)}/places/${Number(d.placeId)}/versions?versionType=Published`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "x-api-key": String(d.apiKey), "Content-Type": "application/xml" },
          body: place.xml,
        });
        const text = await res.text();
        if (!res.ok) return send(200, { job: "x", done: false, error: `Roblox said ${res.status}: ${text.slice(0, 160)}`, lines });
        lines.push("Published");
        return send(200, { job: "x", done: true, error: null, lines });
      }
      if (req.method === "GET" && u.pathname === "/status") {
        return send(200, { lines: [], done: true, error: null });
      }
      return send(404, { error: "not found" });
    } catch (e) {
      return send(500, { error: String(e.message || e) });
    }
  },
};
