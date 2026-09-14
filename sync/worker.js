// 母音ドリルの同期。KV に「同期コード → { 端末ID: その端末の持ち分 }」を 1 件置くだけ。
// 各端末は自分のスロットにだけ書き、読むときは全スロットを受け取って合算する。
// サーバー側にマージはなく、衝突も起きない。
const MAX_BYTES = 4_000_000;          // 1 コードあたりの上限（端末 3〜4 台分に十分）
const TTL = 60 * 60 * 24 * 365;       // 1 年触られなければ消える
const CODE = /^[a-z0-9]{16,64}$/;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const code = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
    if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
    const key = `v1:${code}`;

    if (req.method === 'GET') return json(await env.SYNC.get(key, 'json') || {});

    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const { device, slot } = body || {};
      if (typeof device !== 'string' || !/^[\w-]{4,64}$/.test(device)) return json({ error: 'bad device' }, 400);
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return json({ error: 'bad slot' }, 400);
      const all = await env.SYNC.get(key, 'json') || {};
      all[device] = slot;
      const body2 = JSON.stringify(all);
      if (body2.length > MAX_BYTES) return json({ error: 'too big' }, 413);
      await env.SYNC.put(key, body2, { expirationTtl: TTL });
      return json(all);
    }

    if (req.method === 'DELETE') { await env.SYNC.delete(key); return json({}); }
    return json({ error: 'method' }, 405);
  },
};
