'use strict';

const pad = (n) => String(n).padStart(2, '0');

function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// Node не принимает символы вне Latin-1 в заголовках: кириллицу отправляем сырыми UTF-8 байтами
const encodeHeader = (s) => Buffer.from(String(s), 'utf8').toString('latin1');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, type) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
const sendText = (res, status, text) => send(res, status, text, 'text/plain; charset=utf-8');

// Чтение тела запроса с ограничением размера
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > limit) {
      req.resume();
      return reject(new HttpError(413, 'Payload Too Large'));
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        return reject(new HttpError(413, 'Payload Too Large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)));
    req.on('error', (err) => !failed && reject(err));
  });
}

module.exports = { timestamp, encodeHeader, HttpError, send, sendJson, sendText, readBody };
