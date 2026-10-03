'use strict';
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, CACHE_TTL_MS } = require('./config');
const { sendText } = require('./utils');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

async function statOrNull(file) {
  try {
    return await fs.promises.stat(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

// rawRelative — часть пути после /static/ в "сыром" виде (без нормализации URL)
async function serveStatic(req, res, rawRelative) {
  let relative;
  try {
    relative = decodeURIComponent(rawRelative);
  } catch {
    return sendText(res, 400, '400 Bad Request');
  }
  if (relative.includes('\0')) return sendText(res, 400, '400 Bad Request');

  // Защита от path traversal: итоговый путь обязан остаться внутри public/
  let target = path.resolve(PUBLIC_DIR, relative);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, '403 Forbidden');
  }

  let stat = await statOrNull(target);
  if (stat && stat.isDirectory()) {
    target = path.join(target, 'index.html');
    stat = await statOrNull(target);
  }
  if (!stat || !stat.isFile()) return sendText(res, 404, '404 Not Found');

  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Cache-Control', `max-age=${CACHE_TTL_MS / 1000}`);

  // Условные запросы: If-None-Match имеет приоритет над If-Modified-Since
  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  let notModified = false;
  if (ifNoneMatch) {
    notModified = ifNoneMatch
      .split(',')
      .map((tag) => tag.trim().replace(/^W\//, ''))
      .some((tag) => tag === '*' || tag === etag);
  } else if (ifModifiedSince) {
    const since = Date.parse(ifModifiedSince);
    notModified = !Number.isNaN(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since;
  }
  if (notModified) {
    res.statusCode = 304;
    return res.end();
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') return res.end();

  const stream = fs.createReadStream(target);
  stream.on('error', (err) => {
    console.error(`[ERROR] чтение файла: ${err.message}`);
    res.destroy(err);
  });
  stream.pipe(res);
}

module.exports = { serveStatic };
