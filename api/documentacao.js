import crypto from 'crypto';
import { hgetall, hset, hdel, getJSON, delKey } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';

// Fichas de documentação (Anexo 3.2 Gerdau): uma ficha por técnico + unidade.
// Leitura: todos os papéis de gestão + RH. Escrita: admin, editor e RH.
const LEITURA = ['admin', 'editor', 'planejador', 'supervisor', 'visualizador', 'rh'];
const ESCRITA = ['admin', 'editor', 'rh'];
const KEY = 'doc_fichas';          // hash: fichaId -> ficha
const KEY_LEGADO = 'documentacao'; // versão anterior (por técnico) — migrada no primeiro GET
const NOMES_LEGADO = { charqueadas: 'Gerdau Charqueadas', riograndense: 'Gerdau Riograndense (Sapucaia do Sul)', cosigua: 'Gerdau Cosigua', ourobranco: 'Gerdau Ouro Branco', mineracao: 'Gerdau Mineração', florestal: 'Gerdau Florestal', pinda: 'Gerdau Pindamonhangaba', cearense: 'Gerdau Cearense' };

const str = (v, max) => String(v ?? '').slice(0, max);
function parse(v) { if (v && typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }

function limparAns(src) {
  const ans = {};
  if (src && typeof src === 'object') {
    for (const [qid, a] of Object.entries(src).slice(0, 60)) {
      if (!a || typeof a !== 'object') continue;
      ans[str(qid, 20)] = {
        yes: a.yes === true ? true : a.yes === false ? false : undefined,
        sel: Array.isArray(a.sel) ? a.sel.slice(0, 60).map(s => str(s, 300)) : []
      };
    }
  }
  return ans;
}

function limpar(f) {
  if (!f || typeof f !== 'object') return null;
  const recebidos = {};
  if (f.recebidos && typeof f.recebidos === 'object') {
    for (const [k, v] of Object.entries(f.recebidos).slice(0, 400)) if (v) recebidos[str(k, 300)] = true;
  }
  return {
    tecnicoId: str(f.tecnicoId, 80),
    unidade: str(f.unidade, 120).trim(),
    tipo: str(f.tipo || 'Colaborador CLT', 80),
    vpn: !!f.vpn,
    ans: limparAns(f.ans),
    recebidos,
    obs: str(f.obs, 2000)
  };
}

async function migrarLegado() {
  const raw = await hgetall(KEY_LEGADO);
  const entradas = Object.entries(raw);
  if (!entradas.length) return;
  const novas = {};
  for (const [tecnicoId, v] of entradas) {
    const f = parse(v); if (!f) continue;
    const base = { tecnicoId, tipo: f.tipo, vpn: !!f.vpn, recebidos: f.recebidos || {}, obs: f.obs || '', atualizadoEm: f.atualizadoEm, atualizadoPor: f.atualizadoPor };
    const unis = Array.isArray(f.unidades) && f.unidades.length ? f.unidades : [{ uid: '', ans: f.ans || {} }];
    for (const u of unis) {
      const id = crypto.randomUUID();
      novas[id] = JSON.stringify({ ...base, id, unidade: NOMES_LEGADO[u.uid] || '', ans: u.ans || {} });
    }
  }
  if (Object.keys(novas).length) await hset(KEY, novas);
  await delKey(KEY_LEGADO);
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!LEITURA.includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'GET') {
      await migrarLegado();
      const raw = await hgetall(KEY);
      const fichas = Object.entries(raw).map(([id, v]) => { const f = parse(v); return f ? { ...f, id } : null; }).filter(Boolean);
      return res.status(200).json({ fichas });
    }

    if (!ESCRITA.includes(user.papel)) return res.status(403).json({ error: 'Só RH, administrador ou equipe podem alterar a documentação.' });
    const id = str(req.query.id, 80).replace(/[^a-zA-Z0-9-]/g, '');
    if (!id) return res.status(400).json({ error: 'Ficha não informada.' });

    if (req.method === 'DELETE') {
      await hdel(KEY, id);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const ficha = limpar((req.body || {}).ficha);
      if (!ficha) return res.status(400).json({ error: 'Ficha inválida.' });
      if (!ficha.unidade) return res.status(400).json({ error: 'Informe a unidade desta ficha.' });
      const tecnicos = await getJSON('tecnicos', []);
      if (!tecnicos.some(t => t.id === ficha.tecnicoId)) return res.status(404).json({ error: 'Técnico não encontrado.' });
      ficha.id = id;
      ficha.atualizadoEm = new Date().toISOString();
      ficha.atualizadoPor = user.email;
      await hset(KEY, { [id]: JSON.stringify(ficha) });
      return res.status(200).json({ ficha });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
