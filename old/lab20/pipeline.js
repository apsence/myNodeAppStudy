'use strict';
// Middleware-система: массив функций (req, res, next); next(err) передаёт ошибку обработчику

function compose(middlewares) {
  return function run(req, res, done) {
    let index = -1;
    req.trail = [];

    function next(err) {
      if (err) return done(err); // ошибка пропускает остальные middleware
      index++;
      if (index >= middlewares.length) return done();

      const fn = middlewares[index];
      const name = fn.name || `middleware#${index}`;
      req.trail.push(name);
      // Цепочка выполненных middleware видна клиенту (curl -I)
      if (!res.headersSent) res.setHeader('X-Middleware-Chain', req.trail.join(' > '));
      if (process.env.DEBUG_MW) console.log(`[MW] ${req.method} ${req.url} -> ${name}`);

      try {
        const result = fn(req, res, next);
        // async-middleware: отклонённый промис превращаем в next(err)
        if (result && typeof result.catch === 'function') result.catch(next);
      } catch (error) {
        next(error);
      }
    }

    next();
  };
}

module.exports = { compose };
