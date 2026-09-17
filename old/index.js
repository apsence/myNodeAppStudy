const http = require('http');
const EventEmitter = require('events');
const logger = require('./logger');

class OrderHandler extends EventEmitter {
    processOrder(orderId) {
        this.emit('order:start', orderId);

        setTimeout(() => {
            this.emit('order:processing', orderId, "Идёт обработка...");
        }, 2000);

        setTimeout(() => {
            const randomSum = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
            this.emit('order:complete', orderId, randomSum);
        }, 4000);
    }
}

const orderHandler = new OrderHandler();

orderHandler.on('order:start', (orderId) => {
    console.log(`→ [order:start] Заказ #${orderId} начат`);
});

orderHandler.on('order:processing', (orderId, text) => {
    console.log(`→ Через 2 сек: [order:processing] Заказ #${orderId}: ${text}`);
});

orderHandler.on('order:complete', (orderId, sum) => {
    console.log(`→ Через 4 сек: [order:complete] 💰 Заказ #${orderId} завершён на сумму ${sum} руб.`);
});


class AppServer extends EventEmitter {
    constructor() {
        super();
        this.server = null;
    }

    start(port = 3000) {
        this.server = http.createServer((req, res) => {
            this.emit('request:received', { url: req.url, method: req.method });

            if (req.method === 'GET' && req.url.startsWith('/order/')) {
                const orderId = req.url.substring(7);

                if (orderId) {
                    orderHandler.processOrder(orderId);

                    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(`Заказ #${orderId} принят в обработку.`);
                    return;
                }
            }

            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Hello from Event-Driven server!');
        });

        this.server.listen(port, () => {
            this.emit('server:started', port);
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                this.emit('server:stopped');
            });
        }
    }
}

const app = new AppServer();

logger.setupLogger(app);

app.start(3000);

setTimeout(() => {
    console.log('Останавливаем сервер...');
    app.stop();
}, 15000);
