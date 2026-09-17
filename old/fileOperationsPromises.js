const fs = require('fs');
const path = require('path');
const util = require('util');

// Преобразуем методы fs в промисы
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const mkdir = util.promisify(fs.mkdir);

class FileManagerPromises {
	constructor(baseDir = './data-promises') {
		this.baseDir = baseDir;
		this.initDir();
	}

	/**
	 * Инициализация директории (синхронно для простоты)
	 */
	initDir() {
		if (!fs.existsSync(this.baseDir)) {
			fs.mkdirSync(this.baseDir, { recursive: true });
			console.log(`Создана директория: ${this.baseDir}`);
		}
	}

	/**
	 * Создание файла (промис)
	 * @param {string} filename - имя файла
	 * @param {string} content - содержимое
	 * @returns {Promise<string>} - путь к созданному файлу
	 */
	async createFile(filename, content) {
		const filePath = path.join(this.baseDir, filename);
		await writeFile(filePath, content, 'utf8');
		return filePath;
	}

	/**
	 * Чтение файла (промис)
	 * @param {string} filename - имя файла
	 * @returns {Promise<string>} - содержимое файла
	 */
	async readFile(filename) {
		const filePath = path.join(this.baseDir, filename);
		return await readFile(filePath, 'utf8');
	}

	/**
	 * Получение информации о файле (промис)
	 * @param {string} filename - имя файла
	 * @returns {Promise<Object>} - статистика файла
	 */
	async getFileStats(filename) {
		const filePath = path.join(this.baseDir, filename);
		const stats = await stat(filePath);
		return {
			size: stats.size,
			created: stats.birthtime,
			modified: stats.mtime,
			isFile: stats.isFile()
		};
	}

	/**
	 * Удаление файла (промис)
	 * @param {string} filename - имя файла
	 * @returns {Promise<void>}
	 */
	async deleteFile(filename) {
		const filePath = path.join(this.baseDir, filename);
		await unlink(filePath);
	}

	/**
	 * Список файлов (промис)
	 * @returns {Promise<string[]>} - массив имён файлов
	 */
	async listFiles() {
		const files = await readdir(this.baseDir);
		const fileStats = await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(this.baseDir, file);
				const stats = await stat(filePath);
				return { name: file, isFile: stats.isFile() };
			})
		);
		return fileStats.filter(f => f.isFile).map(f => f.name);
	}

	/**
	 * Создание нескольких файлов параллельно
	 * @param {Array<{filename: string, content: string}>} files
	 * @returns {Promise<string[]>} - массив путей
	 */
	async createMultipleFiles(files) {
		const promises = files.map(({ filename, content }) =>
			this.createFile(filename, content)
		);
		return await Promise.all(promises);
	}

	/**
	 * Чтение нескольких файлов параллельно
	 * @param {string[]} filenames
	 * @returns {Promise<Object>} - объект { filename: content }
	 */
	async readMultipleFiles(filenames) {
		const promises = filenames.map(async (filename) => {
			const content = await this.readFile(filename);
			return { [filename]: content };
		});
		const results = await Promise.all(promises);
		return Object.assign({}, ...results);
	}
}

module.exports = FileManagerPromises;