import { hgetall, hset, hdel } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';
import { getJSON } from './_lib/db.js';

// Fichas de documentação (Anexo 3.2 Gerdau) por técnico.
// Leitura: todos os papéis de gestão + RH. Escrita: admin, editor e RH.
const LEITURA = ['admin', 'editor', 'planejador', 'supervisor', 'visualizador', 'rh'];
const ESCRITA = ['admin', 'editor', 'rh'];
const KEY = 'documentacao';

const str = (v, max) => String(v ?? '').slice(0, max);

function limpar(f) {
  if (!f || typeof f !== 'object') return null;
  const ans = {};
  if (f.ans && typeof f.ans === 'object') {
    for (const [qid, a] of Object.entries(f.ans).slice(0, 60)) {
      if (!a || typeof a !== 'object') continue;
      ans[str(qid, 20)] = {
        yes: a.yes === true ? true : a.yes === false ? false : undefined,
        sel: Array.isArray(a.sel) ? a.sel.slice(0, 60).map(s => str(s, 300)) : []
      };
    }
  }
  const recebidos = {};
  if (f.recebidos && typeof f.recebidos === 'object') {
    for (const [k, v] of Object.entries(f.recebidos).slice(0, 400)) if (v) recebidos[str(k, 300)] = true;
  }
  return {
    tipo: str(f.tipo || 'Colaborador CLT', 80),
    vpn: !!f.vpn,
    ans,
    recebidos,
    obs: str(f.obs, 2000)
  };
}

function parse(v) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
}

export default async function handler(req, res) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!LEITURA.includes(user.papel)) return res.status(403).json({ error: 'Sem permissão.' });

    if (req.method === 'GET') {
      const raw = await hgetall(KEY);
      const fichas = {};
      for (const [k, v] of Object.entries(raw)) { const f = parse(v); if (f) fichas[k] = f; }
      return res.status(200).json({ fichas });
    }

    if (!ESCRITA.includes(user.papel)) return res.status(403).json({ error: 'Só RH, administrador ou equipe podem alterar a documentação.' });
    const tecnicoId = String(req.query.tecnicoId || '');
    if (!tecnicoId) return res.status(400).json({ error: 'Técnico é obrigatório.' });

    if (req.method === 'DELETE') {
      await hdel(KEY, tecnicoId);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const tecnicos = await getJSON('tecnicos', []);
      if (!tecnicos.some(t => t.id === tecnicoId)) return res.status(404).json({ error: 'Técnico não encontrado.' });
      const ficha = limpar((req.body || {}).ficha);
      if (!ficha) return res.status(400).json({ error: 'Ficha inválida.' });
      ficha.atualizadoEm = new Date().toISOString();
      ficha.atualizadoPor = user.email;
      await hset(KEY, { [tecnicoId]: JSON.stringify(ficha) });
      return res.status(200).json({ ficha });
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    if (sendDbError(res, e)) return;
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
