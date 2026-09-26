'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'my-cli.js');

function run(args, options = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    ...options,
  });
  return { stdout: result.stdout, stderr: result.stderr, code: result.status };
}

describe('CLI интеграционные тесты (spawn реального процесса)', () => {
  test('--help выводит справку и возвращает код 0', () => {
    const { stdout, code } = run(['--help']);
    expect(stdout).toMatch(/Usage: my-cli/);
    expect(code).toBe(0);
  });

  test('--version выводит версию в формате semver', () => {
    const { stdout, code } = run(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(code).toBe(0);
  });

  test('вызов без аргументов печатает справку и возвращает код 0', () => {
    const { stdout, code } = run([]);
    expect(stdout).toMatch(/Usage: my-cli/);
    expect(code).toBe(0);
  });

  test('неизвестная команда возвращает код 1 с понятным сообщением', () => {
    const { stderr, code } = run(['unknown']);
    expect(stderr).toMatch(/неизвестная команда/);
    expect(code).toBe(1);
  });

  test('greet выводит приветствие в stdout', () => {
    const { stdout, code } = run(['greet', 'Иван']);
    expect(stdout).toMatch(/Привет, Иван!/);
    expect(code).toBe(0);
  });

  test('generate --dry-run не создаёт файл и возвращает код 0', () => {
    const { stdout, code } = run(['generate', '--type', 'html', '--dry-run']);
    expect(stdout).toMatch(/DRY-RUN/);
    expect(code).toBe(0);
  });

  test('generate с недопустимым типом возвращает код 1', () => {
    const { code, stderr } = run(['generate', '--type', 'unknown']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/недопустимый тип отчёта/);
  });

  test('init --no-interactive без данных возвращает код 1', () => {
    const { stderr, code } = run(['init', '--no-interactive']);
    expect(stderr).toMatch(/необходимо указать --name и --type/);
    expect(code).toBe(1);
  });

  test('init с флагами (неинтерактивный режим) завершается успешно', () => {
    const { stdout, code } = run([
      'init',
      '--name',
      'my-project',
      '--type',
      'cli',
      '--typescript',
      '--prettier',
      '--git',
      '--no-interactive',
    ]);
    expect(stdout).toMatch(/успешно инициализирован/);
    expect(stdout).toMatch(/TypeScript, Prettier/);
    expect(code).toBe(0);
  });
});
