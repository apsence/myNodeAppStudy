const http = require('http');

function calculatePi() {
    let pi = 0;
    
    for (let i = 0; i < 10000; i++) {
        pi += (i % 2 === 0 ? 1 : -1) / (2 * i + 1);
    }
    return (pi * 4).toFixed(4); 
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    
    const fio = 'Грицкевич Александр Романович';
    const group = '401 группа';
    const piValue = calculatePi();

    
    res.end(fio + "<br>" + group + "<br>Число ПИ:" + piValue);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log("Сервер запущен на http://localhost:${PORT}");
});