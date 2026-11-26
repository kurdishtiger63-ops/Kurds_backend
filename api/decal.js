"use strict";
const { decodeFile, fetchAsset } = require("../lib/rbxm");

function pick(nodes) {
  for (const n of nodes) {
    if ((n.c === "Decal" || n.c === "Texture") && n.p && typeof n.p.Texture === "string") {
      const m = n.p.Texture.match(/(\d{3,})/);
      if (m) return Number(m[1]);
    }
    const x = pick(n.ch || []);
    if (x) return x;
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const id = Number(new URL(req.url, "http://x").searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) throw new Error("Bad id");
    const buf = await fetchAsset(id);
    const isImg = (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0xff && buf[1] === 0xd8);
    let image = isImg ? id : null;
    if (!image) image = pick(decodeFile(buf));
    res.statusCode = 200;
    res.end(JSON.stringify(image ? { ok: true, image } : { ok: false, error: "No image inside this asset" }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
  }
};
