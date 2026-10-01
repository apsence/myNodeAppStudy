# my-cli

Учебное CLI-приложение к лабораторной работе №17 «Исследование методов создания
CLI-приложений» (группа ББМО-01-23). Проект реализует все пять заданий работы
как единое приложение с архитектурой уровня «Задание 5», в которое встроена
функциональность заданий 1–4.

## Структура проекта

```
my-cli/
├── bin/
│   └── my-cli.js        # точка входа (#!/usr/bin/env node), commander, обработка ошибок
├── commands/             # каждая подкоманда — отдельный файл, "тонкий" слой над services/
│   ├── greet.js
│   ├── info.js
│   ├── generate.js
│   ├── convert.js
│   ├── init.js
│   ├── build.js
│   ├── test.js
│   ├── deploy.js
│   └── process.js
├── services/              # бизнес-логика, изолированная от ввода-вывода и CLI
│   ├── reportService.js
│   ├── projectService.js
│   ├── buildService.js
│   ├── testService.js
│   ├── deployService.js
│   └── fileProcessService.js
├── utils/
│   ├── logger.js          # chalk + разделение stdout/stderr
│   ├── errors.js           # AppError с "дружелюбными" сообщениями
│   └── config.js           # константы (группа, студент)
├── tests/
│   ├── services/           # юнит-тесты (Jest), без обращения к stdin/stdout
│   └── integration/         # интеграционные тесты через spawnSync (реальный процесс)
├── package.json
├── jest.config.js
└── .gitignore
```

## Установка

```bash
npm install
npm link          # делает команду `my-cli` доступной глобально для локального теста
```

Проверка:

```bash
my-cli --version
```

## Задание 1 — базовый CLI

```bash
my-cli                      # справка (аналог "вывод без аргументов")
my-cli greet "Иван"         # приветствие
my-cli info                 # информация о группе
my-cli unknown              # ошибка "неизвестная команда", код возврата 1
echo $?                     # проверка кода возврата (Linux/macOS)
```

## Задание 2 — опции и флаги (commander)

```bash
my-cli --help
my-cli generate --help
my-cli generate --type pdf --output report.pdf --verbose
my-cli generate --type html --dry-run
my-cli generate --type unknown     # ошибка валидации, код возврата 1
my-cli --version
```

## Задание 3 — интерактивный режим (inquirer)

```bash
my-cli init                                          # интерактивный диалог
my-cli init --name my-project --type cli \
  --typescript --prettier --git                      # неинтерактивно через флаги
my-cli init --no-interactive                         # ошибка: нужны --name и --type
echo "my-project" | my-cli init --no-interactive      # ошибка: нужен --type
```

## Задание 4 — цвета, спиннеры, прогресс-бар

```bash
my-cli process --files a.txt b.txt c.txt
my-cli process --files a.txt missing.txt    # цветные ✔/✖/⚠, код возврата 1
my-cli process --files a.txt > result.json  # "Silence is Golden" + разделение потоков
cat result.json
```

Логи (✔/✖/⚠) всегда пишутся в **stderr**, а фактический результат работы —
в **stdout**, поэтому при перенаправлении `> result.json` в терминале
по-прежнему видны статусы обработки, а в файле оказываются только данные.

## Задание 5 — архитектура, ошибки, упаковка, тесты

```bash
my-cli init --name my-app --type cli --git
my-cli build                      # завершится ошибкой, если нет config.json
echo '{}' > config.json && my-cli build
my-cli test
my-cli deploy --env production    # запросит подтверждение (или используйте --force)
```

Обработка ошибок:

```bash
my-cli build                          # config.json отсутствует → дружелюбная ошибка, код 1
NODE_ENV=development my-cli build     # тот же сценарий, но с полным стектрейсом
```

### Тестирование

```bash
npm test
```

Юнит-тесты (`tests/services`) проверяют сервисы напрямую, без CLI-обвязки.
Интеграционные тесты (`tests/integration`) запускают реальный процесс `node
bin/my-cli.js` через `spawnSync` и проверяют вывод, `--help`, `--version` и
коды возврата.

### Упаковка в автономный бинарник

```bash
npm install -g pkg    # или использовать локальный devDependency
npm run package        # соберёт бинарники в ./dist по конфигурации из package.json ("pkg")
./dist/my-cli-linux --version
```

## Фиксация изменений в Git

```bash
git init
git add .
git commit -m "feat: реализовать CLI-приложение для лабораторной работы №17"
git remote add origin <URL вашего репозитория>
git push -u origin main
```

После этого создайте Pull Request в веб-интерфейсе GitHub/GitLab из вашей
рабочей ветки в основную ветку репозитория.

## Что вложено в архитектуру

- **Жизненный цикл**: инициализация (`commander` + опции) → бизнес-логика
  (`services/`) → корректный код возврата (`process.exitCode`).
- **Обработка ошибок**: `process.on('uncaughtException')` и
  `process.on('unhandledRejection')` в `bin/my-cli.js`; поведение зависит от
  `NODE_ENV` (development — стектрейс, production — краткое сообщение).
- **Разделение потоков**: `utils/logger.js` явно разводит "результат" (stdout)
  и "логи/ошибки" (stderr), а также отключает цвет, если соответствующий поток
  не является TTY (`process.stdout.isTTY` / `process.stderr.isTTY`).
- **Silence is Golden**: команда `process` ничего не печатает в stdout при
  полностью успешной обработке единственного файла — об успехе сообщает
  только код возврата 0.
