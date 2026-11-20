// Módulo para o robô local de WhatsApp: busca a fila de avisos da Central de Alocação e envia.
// Funciona com whatsapp-web.js (Client) ou Baileys (sock). Requer Node 18+ (fetch nativo).
//
// Uso (depois que o WhatsApp estiver conectado / "ready"):
//   const { iniciarAvisosCentral } = require('./central-whatsapp');
//   client.on('ready', () => iniciarAvisosCentral(client));        // whatsapp-web.js
//   // Baileys: quando connection === 'open' -> iniciarAvisosCentral(sock)
//
// Configuração (variáveis de ambiente ou parâmetros):
//   CENTRAL_URL       padrão https://central-alocacao.vercel.app
//   CENTRAL_ROBO_KEY  mesma chave do robô Fracttal (INTEGRACAO_ROBO_KEY na Vercel)

const INTERVALO_MS = 20000;

function ehWWebJs(c) { return typeof c.getNumberId === 'function'; }

async function resolverDestino(c, telefone) {
  if (ehWWebJs(c)) {
    const id = await c.getNumberId(telefone); // resolve o 9º dígito automaticamente
    if (!id) throw new Error('Número não tem WhatsApp: ' + telefone);
    return id._serialized;
  }
  if (typeof c.onWhatsApp === 'function') { // Baileys
    const [r] = await c.onWhatsApp(telefone);
    if (!r || !r.exists) throw new Error('Número não tem WhatsApp: ' + telefone);
    return r.jid;
  }
  return telefone + '@c.us';
}

async function enviar(c, destino, texto) {
  if (ehWWebJs(c)) return c.sendMessage(destino, texto);
  return c.sendMessage(destino, { text: texto }); // Baileys
}

function iniciarAvisosCentral(clienteWhatsApp, opcoes = {}) {
  const url = (opcoes.url || process.env.CENTRAL_URL || 'https://central-alocacao.vercel.app').replace(/\/$/, '');
  const chave = opcoes.chave || process.env.CENTRAL_ROBO_KEY;
  if (!chave) { console.error('[Central] Defina CENTRAL_ROBO_KEY.'); return; }
  const headers = { 'x-robo-key': chave, 'Content-Type': 'application/json' };
  let rodando = false;

  async function ciclo() {
    if (rodando) return; rodando = true;
    try {
      const r = await fetch(url + '/api/allocations?whatsapp=fila', { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const { mensagens = [] } = await r.json();
      const enviados = [], falhas = [];
      for (const m of mensagens) {
        try {
          await enviar(clienteWhatsApp, await resolverDestino(clienteWhatsApp, m.telefone), m.texto);
          enviados.push(m.id);
          console.log(`[Central] ✔ ${m.tipo} → ${m.tecnico} (${m.telefone})`);
          await new Promise(res => setTimeout(res, 1500 + Math.random() * 1500)); // intervalo anti-bloqueio
        } catch (e) {
          falhas.push({ id: m.id, erro: e.message });
          console.error(`[Central] ✖ ${m.tecnico}: ${e.message}`);
        }
      }
      if (enviados.length || falhas.length) {
        await fetch(url + '/api/allocations?whatsapp=ok', { method: 'POST', headers, body: JSON.stringify({ enviados, falhas }) });
      }
    } catch (e) {
      console.error('[Central] Erro ao buscar fila:', e.message);
    } finally { rodando = false; }
  }

  ciclo();
  const t = setInterval(ciclo, opcoes.intervaloMs || INTERVALO_MS);
  console.log('[Central] Avisos de alocação ativos.');
  return () => clearInterval(t);
}

module.exports = { iniciarAvisosCentral };
