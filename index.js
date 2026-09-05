const http = require('http');

const server = http.createServer((req, res) => {
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
res.end('<h1>Привет, мир!</h1>');
});

const PORT = 3000;
server.listen(PORT, () => {
console.log(`Сервер запущен на http://localhost:${PORT}`);
});