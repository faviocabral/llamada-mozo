const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

// Parser de .env mínimo (KEY=VALUE, líneas con # se ignoran).
// Las variables ya definidas en el entorno tienen prioridad.
function loadEnvFile() {
    if (!fs.existsSync(ENV_FILE)) return;
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (key && !process.env[key]) process.env[key] = value;
    }
}

// Persiste un valor generado en .env para que sobreviva reinicios.
function ensureEnv(key, value) {
    if (process.env[key]) return;
    process.env[key] = value;
    fs.appendFileSync(ENV_FILE, `${key}=${value}\n`);
    console.log(`🔑 ${key} generado y guardado en .env`);
}

loadEnvFile();

// Las llaves VAPID y la clave de mozo se autogeneran la primera vez.
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    const keys = webpush.generateVAPIDKeys();
    ensureEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    ensureEnv('VAPID_PRIVATE_KEY', keys.privateKey);
    console.warn('⚠️  VAPID generadas al vuelo: en hosts con filesystem efímero (Render) ' +
        'estas llaves cambian en cada restart y todas las suscripciones push quedan ' +
        'inválidas (403). Definí VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el entorno.');
}
if (!process.env.MOZO_KEY) {
    ensureEnv('MOZO_KEY', crypto.randomBytes(9).toString('hex'));
}

module.exports = {
    port: parseInt(process.env.PORT, 10) || 3010,
    mozoKey: process.env.MOZO_KEY,
    vapid: {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT || 'mailto:admin@restaurante.local'
    },
    ssl: {
        key: process.env.SSL_KEY,
        cert: process.env.SSL_CERT
    },
    dataDir: path.join(ROOT, 'data'),
    publicDir: path.join(ROOT, 'public'),
    // Minutos que un llamado atendido queda visible en el historial del mozo
    atendidosTtlMin: parseInt(process.env.ATENDIDOS_TTL_MIN, 10) || 30
};
