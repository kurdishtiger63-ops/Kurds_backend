"use strict";
const { decodeFile, toTree, fetchAsset } = require("../lib/rbxm");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const id = Number(new URL(req.url, "http://x").searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) throw new Error("Bad id");
    const buf = await fetchAsset(id);
    const roots = decodeFile(buf);
    const out = toTree(roots, 2500);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, tree: out.tree, count: out.count, truncated: out.truncated }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
  }
};
