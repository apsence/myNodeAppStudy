import fs from 'fs';

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function logToFile(message) {
    const logLine = `[${getTimestamp()}] ${message}\n`;
    
    fs.appendFile('logs.txt', logLine, 'utf8', (err) => {
        if (err) {
            console.error('Ошибка записи в лог-файл:', err);
        }
    });
}

export function setupLogger(app) {

    app.on('server:started', (port) => {
        const msg = `[Событие] Сервер запущен на порту ${port}`;
        console.log(msg);
        logToFile(msg);
    });

    app.on('request:received', (data) => {
        const msg = `[Событие] Получен запрос: ${data.method} на адрес ${data.url}`;
        console.log(msg);
        logToFile(msg);
    });

    app.on('server:stopped', () => {
        const msg = `🛑 Сервер остановлен`;
        console.log(msg);
        logToFile(msg);
    });
}
