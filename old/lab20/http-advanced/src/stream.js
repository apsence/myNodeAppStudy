'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { STREAM_FILE, DATA_DIR, STREAM_SIZE_MB } = require('./config');
const { sendText } = require('./utils');

const MB = 1024 * 1024;

// Создаёт большой тестовый файл при первом запуске (в .gitignore)
function ensureStreamFile() {
  if (fs.existsSync(STREAM_FILE)) return false;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fd = fs.openSync(STREAM_FILE, 'w');
  for (let i = 0; i < STREAM_SIZE_MB; i++) fs.writeSync(fd, crypto.randomBytes(MB));
  fs.closeSync(fd);
  return true;
}

// GET /stream — потоковая отдача файла: createReadStream().pipe(res) + прогресс
async function streamFile(req, res) {
  let stat;
  try {
    stat = await fs.promises.stat(STREAM_FILE);
  } catch {
    return sendText(res, 404, '404 Not Found (нет файла для стриминга)');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', 'attachment; filename="big-file.bin"');
  if (req.method === 'HEAD') return res.end();

  const total = stat.size;
  const startedAt = Date.now();
  let sent = 0;
  let nextMark = 10;

  const readStream = fs.createReadStream(STREAM_FILE);

  readStream.on('data', (chunk) => {
    sent += chunk.length;
    const percent = Math.floor((sent / total) * 100);
    while (percent >= nextMark) {
      console.log(`[STREAM] ${nextMark}% (${(sent / MB).toFixed(1)} / ${(total / MB).toFixed(1)} МБ)`);
      nextMark += 10;
    }
  });
  // Итог передачи логируется ровно один раз (по 'end' потока или по закрытию соединения)
  let reported = false;
  const reportDone = () => {
    if (reported) return;
    reported = true;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`[STREAM] передача завершена: ${(total / MB).toFixed(1)} МБ за ${seconds} с`);
  };
  readStream.on('end', reportDone);
  readStream.on('error', (err) => {
    console.error(`[ERROR] стриминг: ${err.message}`);
    res.destroy(err);
  });

  // Клиент оборвал загрузку — освобождаем дескриптор файла
  res.on('close', () => {
    readStream.destroy();
    if (sent >= total) return reportDone(); // клиент получил всё и закрыл соединение раньше 'end'
    if (!reported) {
      reported = true;
      console.log(`[STREAM] прервано клиентом на ${(sent / MB).toFixed(1)} МБ из ${(total / MB).toFixed(1)} МБ`);
    }
  });

  readStream.pipe(res);
}

module.exports = { ensureStreamFile, streamFile };
