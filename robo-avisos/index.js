// Robô de avisos da Central de Alocação — independente do robô PPM/Fracttal.
// Usa uma sessão de WhatsApp própria (pasta .sessao-central). Não lê grupos nem conversas:
// só busca a fila de avisos na Central e envia para os técnicos.
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const URL_CENTRAL = (process.env.CENTRAL_URL || 'https://central-alocacao.vercel.app').replace(/\/$/, '');
const CHAVE = process.env.CENTRAL_ROBO_KEY;
const INTERVALO = Math.max(10, parseInt(process.env.INTERVALO_SEGUNDOS, 10) || 20) * 1000;
if (!CHAVE) { console.error('Defina CENTRAL_ROBO_KEY no arquivo .env'); process.exit(1); }

const headers = { 'x-robo-key': CHAVE, 'Content-Type': 'application/json' };
const hora = () => new Date().toLocaleTimeString('pt-BR');
const log = (...a) => console.log(`[${hora()}]`, ...a);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'central-alocacao', dataPath: './.sessao-central' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  console.log('\nEscaneie com o WhatsApp do número de avisos (Aparelhos conectados → Conectar aparelho):\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => log('Autenticado.'));
client.on('auth_failure', m => log('Falha na autenticação:', m, '— apague a pasta .sessao-central e rode de novo.'));
client.on('disconnected', motivo => { log('Desconectado:', motivo, '— reiniciando em 10s'); setTimeout(() => process.exit(1), 10000); });

let rodando = false;
async function ciclo() {
  if (rodando) return; rodando = true;
  try {
    const r = await fetch(URL_CENTRAL + '/api/allocations?whatsapp=fila', { headers });
    if (r.status === 401) throw new Error('Chave inválida (confira CENTRAL_ROBO_KEY).');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { mensagens = [] } = await r.json();
    const enviados = [], falhas = [];
    for (const m of mensagens) {
      try {
        const id = await client.getNumberId(m.telefone); // resolve o 9º dígito
        if (!id) throw new Error('número sem WhatsApp');
        await client.sendMessage(id._serialized, m.texto);
        enviados.push(m.id);
        log(`✔ ${m.tipo} → ${m.tecnico} (${m.telefone})`);
        await new Promise(res => setTimeout(res, 2000 + Math.random() * 2000)); // intervalo anti-bloqueio
      } catch (e) {
        falhas.push({ id: m.id, erro: e.message });
        log(`✖ ${m.tecnico} (${m.telefone}): ${e.message}`);
      }
    }
    if (enviados.length || falhas.length) {
      await fetch(URL_CENTRAL + '/api/allocations?whatsapp=ok', { method: 'POST', headers, body: JSON.stringify({ enviados, falhas }) });
    }
  } catch (e) {
    log('Erro ao consultar a Central:', e.message);
  } finally { rodando = false; }
}

client.on('ready', () => {
  log(`WhatsApp conectado (${client.info.pushname || client.info.wid.user}). Consultando a Central a cada ${INTERVALO / 1000}s.`);
  ciclo();
  setInterval(ciclo, INTERVALO);
});

log('Iniciando robô de avisos da Central de Alocação...');
client.initialize();
