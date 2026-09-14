const fs = require('fs');
const path = require('path');
const util = require('util');

// Промис-обёртки над fs.
// Префикс fs* — чтобы не путать с методами класса (иначе this.readFile затрёт внешний readFile).
const fsReadFile = util.promisify(fs.readFile);
const fsWriteFile = util.promisify(fs.writeFile);
const fsUnlink = util.promisify(fs.unlink);
const fsReaddir = util.promisify(fs.readdir);
const fsStat = util.promisify(fs.stat);
const fsMkdir = util.promisify(fs.mkdir);

// ---------- Пользовательские ошибки ----------

/**
 * Базовая ошибка файлового менеджера.
 */
class FileManagerError extends Error {
	constructor(message, code, cause) {
		super(message);
		this.name = 'FileManagerError';
		this.code = code;
		this.cause = cause;
	}
}

/** Файл не найден. */
class FileNotFoundError extends FileManagerError {
	constructor(filename, cause) {
		super(`Файл не найден: ${filename}`, 'ENOENT', cause);
		this.name = 'FileNotFoundError';
		this.filename = filename;
	}
}

/** Файл уже существует. */
class FileAlreadyExistsError extends FileManagerError {
	constructor(filename, cause) {
		super(`Файл уже существует: ${filename}`, 'EEXIST', cause);
		this.name = 'FileAlreadyExistsError';
		this.filename = filename;
	}
}

// ---------- Гибридный менеджер ----------

/**
 * Файловый менеджер, поддерживающий оба стиля вызова.
 *
 * Правило: если последний аргумент — функция, работаем в стиле колбэка.
 * Иначе метод возвращает Promise.
 *
 * Примеры:
 *   await fm.readFile('a.txt')                          // промис
 *   fm.readFile('a.txt', (err, data) => { ... })        // колбэк
 */
class FileManagerHybrid {
	/**
	 * @param {string} baseDir - базовая директория
	 * @param {Object} [options]
	 * @param {boolean} [options.silent=false] - отключить логи
	 */
	constructor(baseDir = './data-hybrid', options = {}) {
		this.baseDir = baseDir;
		this.silent = options.silent === true;

		// Синхронно — как в обоих исходниках.
		if (!fs.existsSync(this.baseDir)) {
			fs.mkdirSync(this.baseDir, { recursive: true });
			this.#log(`Создана директория: ${this.baseDir}`);
		}
	}

	// ---------- Публичные методы ----------

	/**
	 * Создание файла.
	 * @param {string} filename
	 * @param {string} content
	 * @param {Function} [callback] - (err, filePath) => void
	 * @returns {Promise<string>|void}
	 */
	createFile(filename, content, callback) {
		return this.#execute(callback, async () => {
			const filePath = path.join(this.baseDir, filename);
			try {
				await fsWriteFile(filePath, content, 'utf8');
			} catch (err) {
				throw this.#wrapError(err, filename);
			}
			this.#log(`Создан файл: ${filePath}`);
			return filePath;
		});
	}

	/**
	 * Чтение файла.
	 * @param {string} filename
	 * @param {Function} [callback] - (err, content) => void
	 * @returns {Promise<string>|void}
	 */
	readFile(filename, callback) {
		return this.#execute(callback, async () => {
			const filePath = path.join(this.baseDir, filename);
			try {
				return await fsReadFile(filePath, 'utf8');
			} catch (err) {
				throw this.#wrapError(err, filename);
			}
		});
	}

	/**
	 * Статистика по файлу.
	 * @param {string} filename
	 * @param {Function} [callback] - (err, stats) => void
	 * @returns {Promise<Object>|void}
	 */
	getFileStats(filename, callback) {
		return this.#execute(callback, async () => {
			const filePath = path.join(this.baseDir, filename);
			try {
				const stats = await fsStat(filePath);
				return {
					size: stats.size,
					created: stats.birthtime,
					modified: stats.mtime,
					isFile: stats.isFile()
				};
			} catch (err) {
				throw this.#wrapError(err, filename);
			}
		});
	}

	/**
	 * Удаление файла.
	 * @param {string} filename
	 * @param {Function} [callback] - (err) => void
	 * @returns {Promise<void>|void}
	 */
	deleteFile(filename, callback) {
		return this.#execute(callback, async () => {
			const filePath = path.join(this.baseDir, filename);
			try {
				await fsUnlink(filePath);
			} catch (err) {
				throw this.#wrapError(err, filename);
			}
			this.#log(`Удалён файл: ${filePath}`);
		});
	}

	/**
	 * Список файлов (без директорий).
	 * @param {Function} [callback] - (err, files) => void
	 * @returns {Promise<string[]>|void}
	 */
	listFiles(callback) {
		return this.#execute(callback, async () => {
			let entries;
			try {
				entries = await fsReaddir(this.baseDir);
			} catch (err) {
				throw this.#wrapError(err, this.baseDir);
			}

			const results = await Promise.all(
				entries.map(async (file) => {
					const filePath = path.join(this.baseDir, file);
					try {
						const stats = await fsStat(filePath);
						return { name: file, isFile: stats.isFile() };
					} catch {
						// файл могли удалить между readdir и stat — просто пропускаем
						return { name: file, isFile: false };
					}
				})
			);

			return results
				.filter(r => r.isFile)
				.map(r => r.name);
		});
	}

	/**
	 * Пакетное создание файлов параллельно.
	 * @param {Array<{filename: string, content: string}>} files
	 * @param {Function} [callback] - (err, paths) => void
	 * @returns {Promise<string[]>|void}
	 */
	createMultipleFiles(files, callback) {
		return this.#execute(callback, async () => {
			const promises = files.map(({ filename, content }) =>
				this.createFile(filename, content)
			);
			return await Promise.all(promises);
		});
	}

	/**
	 * Пакетное чтение файлов параллельно.
	 * @param {string[]} filenames
	 * @param {Function} [callback] - (err, contents) => void
	 * @returns {Promise<Object>|void}
	 */
	readMultipleFiles(filenames, callback) {
		return this.#execute(callback, async () => {
			const pairs = await Promise.all(
				filenames.map(async (filename) => {
					const content = await this.readFile(filename);
					return [filename, content];
				})
			);
			return Object.fromEntries(pairs);
		});
	}

	// ---------- Приватные хелперы ----------

	/**
	 * Мост между колбэком и промисом.
	 * Если callback — функция, промис не возвращается наружу.
	 * @private
	 */
	#execute(callback, task) {
		if (typeof callback === 'function') {
			task()
				.then(result => callback(null, result))
				.catch(err => callback(err));
			return;
		}
		return task();
	}

	/**
	 * Оборачивает «сырую» ошибку fs в наш класс.
	 * @private
	 */
	#wrapError(err, filename) {
		if (err.code === 'ENOENT') return new FileNotFoundError(filename, err);
		if (err.code === 'EEXIST') return new FileAlreadyExistsError(filename, err);
		return new FileManagerError(err.message, err.code, err);
	}

	/**
	 * Логирование.
	 * @private
	 */
	#log(message) {
		if (!this.silent) console.log(`[FileManagerHybrid] ${message}`);
	}
}

module.exports = {
	FileManagerHybrid,
	FileManagerError,
	FileNotFoundError,
	FileAlreadyExistsError
};