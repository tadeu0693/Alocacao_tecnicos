// Fila de avisos de WhatsApp. O servidor só enfileira; o robô local (WhatsApp conectado por
// QR code) busca a fila em GET /api/allocations?whatsapp=fila e confirma em POST ?whatsapp=ok.
import crypto from 'crypto';
import { hset, hgetall, hdel } from './db.js';

const FILA = 'whatsapp_fila';
const MAX_TENTATIVAS = 5;

export function normalizarTelefone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : '';
}

const fmtData = iso => iso ? iso.split('-').reverse().join('/') : '—';
const quando = (data, hora) => fmtData(data) + (hora ? ' às ' + hora : '');

function mapaLink(a) {
  if (a.latitude && a.longitude) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(a.latitude).replace(',', '.') + ',' + String(a.longitude).replace(',', '.'))}`;
  if (a.endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.endereco)}`;
  return '';
}

function corpo(a) {
  const linhas = [
    `*Atividade:* ${a.obra || a.tipo}`,
    `*Tipo:* ${a.tipo || '—'}`,
    a.local ? `*Local:* ${a.local}` : null,
    a.endereco ? `*Endereço:* ${a.endereco}` : null,
    mapaLink(a) ? `📍 ${mapaLink(a)}` : null,
    `*Início:* ${quando(a.inicio, a.horaInicio)}`,
    `*Fim:* ${quando(a.fim, a.horaFim)}`,
    a.notas ? `*Descrição:* ${a.notas}` : null,
    a.emergencial ? '🚨 *EMERGÊNCIA*' : null
  ];
  return linhas.filter(Boolean).join('\n');
}

const CAMPOS = { obra: 'Atividade', tipo: 'Tipo', local: 'Local', endereco: 'Endereço', inicio: 'Início', fim: 'Fim', horaInicio: 'Horário início', horaFim: 'Horário fim', notas: 'Descrição' };
export function diferencas(antes, depois) {
  return Object.keys(CAMPOS).filter(k => (antes[k] || '') !== (depois[k] || '')).map(k => {
    const f = v => (k === 'inicio' || k === 'fim') ? fmtData(v) : (v || '—');
    return `• ${CAMPOS[k]}: ${f(antes[k])} → *${f(depois[k])}*`;
  });
}

// tipo: 'nova' | 'alterada' | 'cancelada'
export function montarMensagem(tipo, a, tec, mudancas) {
  const nome = (tec && tec.nome ? tec.nome.split(' ')[0] : '');
  const ola = `Olá${nome ? ', ' + nome.charAt(0) + nome.slice(1).toLowerCase() : ''}!`;
  if (tipo === 'nova') return `📋 *Nova atividade — Central de Alocação*\n${ola} Você foi alocado(a):\n\n${corpo(a)}`;
  if (tipo === 'alterada') return `✏️ *Atividade alterada — Central de Alocação*\n${ola} Houve alteração na sua atividade:\n\n${(mudancas || []).join('\n')}\n\n*Como ficou:*\n${corpo(a)}`;
  return `❌ *Atividade cancelada — Central de Alocação*\n${ola} A atividade abaixo foi cancelada:\n\n*Atividade:* ${a.obra || a.tipo}\n*Período:* ${quando(a.inicio, a.horaInicio)} a ${quando(a.fim, a.horaFim)}`;
}

// itens: [{tipo, alloc, mudancas?}] ; tecnicos: lista completa (para achar telefone)
export async function avisar(itens, tecnicos) {
  const novos = {};
  for (const it of itens) {
    if (!it || !it.alloc || it.alloc.ferias) continue;
    if (it.tipo === 'alterada' && !(it.mudancas || []).length) continue;
    const tec = tecnicos.find(t => t.id === it.alloc.tecnicoId);
    const telefone = normalizarTelefone(tec && tec.telefone);
    if (!telefone) continue;
    const id = crypto.randomUUID();
    novos[id] = { id, telefone, tecnico: tec.nome, texto: montarMensagem(it.tipo, it.alloc, tec, it.mudancas), allocId: it.alloc.id, tipo: it.tipo, criadoEm: new Date().toISOString(), tentativas: 0 };
  }
  if (Object.keys(novos).length) {
    try { await hset(FILA, novos); } catch (e) { console.error('Falha ao enfileirar WhatsApp', e); }
  }
  return Object.keys(novos).length;
}

function chaveOk(req) {
  const chave = process.env.WHATSAPP_ROBO_KEY || '';
  return !!chave && req.headers['x-robo-key'] === chave;
}

// Trata as rotas do robô. Retorna true se respondeu.
export async function rotaRobo(req, res) {
  const modo = req.query.whatsapp;
  if (!modo) return false;
  if (!chaveOk(req)) { res.status(401).json({ error: 'Chave do robô inválida.' }); return true; }
  if (req.method === 'GET' && modo === 'fila') {
    const todos = Object.values(await hgetall(FILA)).map(v => typeof v === 'string' ? JSON.parse(v) : v);
    todos.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
    res.status(200).json({ mensagens: todos.slice(0, 20) });
    return true;
  }
  if (req.method === 'POST' && modo === 'ok') {
    const { enviados = [], falhas = [] } = req.body || {};
    await hdel(FILA, ...enviados.map(String));
    if (falhas.length) {
      const atual = await hgetall(FILA);
      const upd = {}, remover = [];
      for (const f of falhas) {
        const m = atual[f.id] && (typeof atual[f.id] === 'string' ? JSON.parse(atual[f.id]) : atual[f.id]);
        if (!m) continue;
        m.tentativas = (m.tentativas || 0) + 1; m.ultimoErro = String(f.erro || '').slice(0, 300);
        if (m.tentativas >= MAX_TENTATIVAS) remover.push(m.id); else upd[m.id] = m;
      }
      if (Object.keys(upd).length) await hset(FILA, upd);
      if (remover.length) await hdel(FILA, ...remover);
    }
    res.status(200).json({ ok: true });
    return true;
  }
  res.status(400).json({ error: 'Rota do robô inválida.' });
  return true;
}
