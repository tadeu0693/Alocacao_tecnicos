import { hgetall, hset, hdel } from './_lib/db.js';
import { getUserFromReq, sendDbError } from './_lib/auth.js';
import { getJSON, setJSON } from './_lib/db.js';

// Fichas de documentação (Anexo 3.2 Gerdau) por técnico.
// Leitura: todos os papéis de gestão + RH. Escrita: admin, editor e RH.
const LEITURA = ['admin', 'editor', 'planejador', 'supervisor', 'visualizador', 'rh'];
const ESCRITA = ['admin', 'editor', 'rh'];
const KEY = 'documentacao';

const str = (v, max) => String(v ?? '').slice(0, max);

const KEY_UNI = 'doc_unidades';
// Unidades iniciais (editáveis na aba). Palavras-chave puxam as regras específicas citadas no Anexo 3.2.
const UNIDADES_SEED = [
  { id: 'charqueadas', nome: 'Gerdau Charqueadas', uf: 'RS', chaves: ['Charqueadas'], exigencias: [] },
  { id: 'riograndense', nome: 'Gerdau Riograndense (Sapucaia do Sul)', uf: 'RS', chaves: ['Riograndense', 'Sapucaia'], exigencias: [] },
  { id: 'cosigua', nome: 'Gerdau Cosigua', uf: 'RJ', chaves: ['Cosigua'], exigencias: [] },
  { id: 'ourobranco', nome: 'Gerdau Ouro Branco', uf: 'MG', chaves: ['Ouro Branco'], exigencias: [] },
  { id: 'mineracao', nome: 'Gerdau Mineração', uf: 'MG', chaves: ['Mineração', 'mineração'], exigencias: [] },
  { id: 'florestal', nome: 'Gerdau Florestal', uf: 'MG', chaves: ['Florestal', 'Florestais'], exigencias: [] },
  { id: 'pinda', nome: 'Gerdau Pindamonhangaba', uf: 'SP', chaves: ['Pindamonhangaba', 'Pinda'], exigencias: [] },
  { id: 'cearense', nome: 'Gerdau Cearense', uf: 'CE', chaves: ['Cearense'], exigencias: [] }
];

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

function limparUnidades(list) {
  if (!Array.isArray(list)) return null;
  const ids = new Set();
  return list.slice(0, 60).map(u => {
    let id = str(u && u.id, 40).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || Math.random().toString(36).slice(2, 10);
    while (ids.has(id)) id += 'x';
    ids.add(id);
    return {
      id,
      nome: str(u.nome, 120).trim() || 'Unidade sem nome',
      uf: str(u.uf, 4).toUpperCase(),
      chaves: (Array.isArray(u.chaves) ? u.chaves : []).map(c => str(c, 40).trim()).filter(Boolean).slice(0, 10),
      exigencias: (Array.isArray(u.exigencias) ? u.exigencias : []).map(c => str(c, 300).trim()).filter(Boolean).slice(0, 40)
    };
  });
}

function limpar(f) {
  if (!f || typeof f !== 'object') return null;
  const ans = limparAns(f.ans);
  const unidades = (Array.isArray(f.unidades) ? f.unidades : []).slice(0, 20)
    .filter(u => u && u.uid)
    .map(u => ({ uid: str(u.uid, 40), ans: limparAns(u.ans) }));
  const recebidos = {};
  if (f.recebidos && typeof f.recebidos === 'object') {
    for (const [k, v] of Object.entries(f.recebidos).slice(0, 400)) if (v) recebidos[str(k, 300)] = true;
  }
  return {
    tipo: str(f.tipo || 'Colaborador CLT', 80),
    vpn: !!f.vpn,
    ans,
    unidades,
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
      const [raw, unidades] = await Promise.all([hgetall(KEY), getJSON(KEY_UNI, null)]);
      const fichas = {};
      for (const [k, v] of Object.entries(raw)) { const f = parse(v); if (f) fichas[k] = f; }
      return res.status(200).json({ fichas, unidades: unidades || UNIDADES_SEED });
    }

    if (!ESCRITA.includes(user.papel)) return res.status(403).json({ error: 'Só RH, administrador ou equipe podem alterar a documentação.' });

    // Cadastro de unidades e suas exigências próprias
    if (req.query.recurso === 'unidades') {
      if (req.method !== 'PUT') return res.status(405).json({ error: 'Método não permitido.' });
      const unidades = limparUnidades((req.body || {}).unidades);
      if (!unidades) return res.status(400).json({ error: 'Lista de unidades inválida.' });
      await setJSON(KEY_UNI, unidades);
      return res.status(200).json({ unidades });
    }

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
