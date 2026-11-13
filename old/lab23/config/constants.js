'use strict';

// Константы без внешних зависимостей (их можно безопасно подключать в тестах)
module.exports = {
  GROUP: 'ББМО-01-23',
  DEFAULT_DB: 'bbmo_01_23',
  DEFAULT_URI: 'mongodb://localhost:27017/bbmo_01_23',
  COLLECTIONS: {
    students: 'students',        // задания 2 и 5
    big: 'students_big',         // задание 3: 1 000 000 документов
    groups: 'groups',            // задание 3: для $lookup
    search: 'students_search',   // задание 3: текстовый поиск
    tx: 'students_tx',           // задание 4: транзакции
  },
};
