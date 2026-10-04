// Отправляет заведомо некорректный HTTP-запрос — для демонстрации события clientError
const net = require('net');
const port = Number(process.argv[2]) || 3000;

const socket = net.connect(port, 'localhost', () => socket.write('ЭТО НЕ HTTP\r\n\r\n'));
socket.on('data', (data) => {
  console.log(data.toString('utf8'));
  socket.end();
});
socket.on('error', (err) => console.error('Ошибка соединения:', err.message));