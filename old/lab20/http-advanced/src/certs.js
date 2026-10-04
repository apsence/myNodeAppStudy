'use strict';
// Самоподписанный сертификат без внешних зависимостей и без openssl:
// X.509 собирается вручную в DER, подписывается через модуль crypto (RSA-2048 + SHA-256).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CERT_DIR } = require('./config');

// ---- минимальный DER-кодировщик ----
function derLength(n) {
  if (n < 128) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const oid = (hex) => tlv(0x06, Buffer.from(hex, 'hex'));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const integer = (buf) => {
  let b = buf;
  while (b.length > 1 && b[0] === 0 && b[1] < 0x80) b = b.subarray(1);
  if (b[0] >= 0x80) b = Buffer.concat([Buffer.from([0]), b]); // положительное число
  return tlv(0x02, b);
};
const utcTime = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  const s =
    p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  return tlv(0x17, Buffer.from(s, 'ascii'));
};
const pem = (label, der) =>
  `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

const OID_SHA256_RSA = '2a864886f70d01010b';
const OID_CN = '550403';
const OID_SAN = '551d11';
const OID_BASIC_CONSTRAINTS = '551d13';

function generateSelfSigned(commonName = 'localhost', days = 365) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

  const algorithm = seq(oid(OID_SHA256_RSA), tlv(0x05));
  const name = seq(set(seq(oid(OID_CN), utf8(commonName))));
  const now = new Date();
  const validity = seq(
    utcTime(new Date(now.getTime() - 24 * 3600 * 1000)),
    utcTime(new Date(now.getTime() + days * 24 * 3600 * 1000))
  );
  const serial = crypto.randomBytes(8);
  serial[0] &= 0x7f;

  const san = seq(oid(OID_SAN), tlv(0x04, seq(tlv(0x82, Buffer.from('localhost')), tlv(0x87, Buffer.from([127, 0, 0, 1])))));
  const basic = seq(oid(OID_BASIC_CONSTRAINTS), bool(true), tlv(0x04, seq(bool(true))));

  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))), // версия v3
    integer(serial),
    algorithm,
    name, // издатель
    validity,
    name, // субъект (самоподписанный = издатель)
    publicKey.export({ type: 'spki', format: 'der' }),
    tlv(0xa3, seq(san, basic))
  );

  const signature = crypto.sign('sha256', tbs, privateKey);
  const certificate = seq(tbs, algorithm, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));

  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: pem('CERTIFICATE', certificate),
  };
}

// Возвращает { key, cert, generated }; при повторном запуске переиспользует файлы из certs/
function ensureCertificate() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), generated: false };
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const { key, cert } = generateSelfSigned();
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  fs.writeFileSync(certPath, cert);
  return { key, cert, generated: true };
}

module.exports = { ensureCertificate, generateSelfSigned };
