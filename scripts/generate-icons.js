// Genera public/icons/icon-192.png e icon-512.png sin dependencias externas.
// PNG RGB escrito a mano: fondo naranja (#ff5722) con un disco blanco al centro.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const name = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([len, name, data, crc]);
}

function generatePNG(size) {
    const r = size / 2;
    const radio = size * 0.32;
    const raw = Buffer.alloc((size * 3 + 1) * size);
    let i = 0;
    for (let y = 0; y < size; y++) {
        raw[i++] = 0; // filtro: none
        for (let x = 0; x < size; x++) {
            const dx = x - r + 0.5;
            const dy = y - r + 0.5;
            const inside = Math.sqrt(dx * dx + dy * dy) < radio;
            raw[i++] = 255;                       // R
            raw[i++] = inside ? 255 : 87;         // G
            raw[i++] = inside ? 255 : 34;         // B
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // color type: RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [192, 512]) {
    const file = path.join(dir, `icon-${size}.png`);
    fs.writeFileSync(file, generatePNG(size));
    console.log('Generado:', file);
}
