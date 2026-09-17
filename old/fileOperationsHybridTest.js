const {
	FileManagerHybrid,
	FileNotFoundError,
	FileAlreadyExistsError,
	FileManagerError
} = require('./fileOperationsHybrid');

// silent: true — чтобы не засорять вывод логами о создании директории/файлов.
const fm = new FileManagerHybrid('./test-data-hybrid', { silent: true });

async function run() {
	console.log('=== ТЕСТ 1: стиль промисов (как во втором исходнике) ===\n');

	try {
		const filePath = await fm.createFile('promise.txt', 'Привет, промисы!');
		console.log(`✅ Создан: ${filePath}`);

		const content = await fm.readFile('promise.txt');
		console.log(`✅ Прочитано: "${content}"`);

		const stats = await fm.getFileStats('promise.txt');
		console.log(`✅ Размер: ${stats.size} байт, isFile=${stats.isFile}`);
	} catch (err) {
		console.error('❌ Ошибка:', err.message);
	}

	console.log('\n=== ТЕСТ 2: стиль колбэков (как в первом исходнике) ===\n');

	// Оборачиваем в Promise, чтобы дождаться завершения всей цепочки.
	await new Promise((resolve) => {
		fm.createFile('callback.txt', 'Привет, колбэки!', (err, filePath) => {
			if (err) {
				console.error('❌ Ошибка создания:', err.message);
				return resolve();
			}
			console.log(`✅ Создан: ${filePath}`);

			fm.readFile('callback.txt', (err, content) => {
				if (err) {
					console.error('❌ Ошибка чтения:', err.message);
					return resolve();
				}
				console.log(`✅ Прочитано: "${content}"`);

				fm.listFiles((err, files) => {
					if (err) {
						console.error('❌ Ошибка списка:', err.message);
						return resolve();
					}
					console.log(`✅ Файлы: ${files.join(', ')}`);
					resolve();
				});
			});
		});
	});

	console.log('\n=== ТЕСТ 3: обработка ошибок ===\n');

	// 3.1. Файл не найден — промис-стиль.
	try {
		await fm.readFile('не-существует.txt');
	} catch (err) {
		if (err instanceof FileNotFoundError) {
			console.log(`✅ Поймана FileNotFoundError: ${err.message}`);
			console.log(`   code=${err.code}, filename=${err.filename}`);
		} else {
			console.error('❌ Неожиданный тип ошибки:', err);
		}
	}

	// 3.2. Файл не найден — колбэк-стиль.
	await new Promise((resolve) => {
		fm.readFile('тоже-нет.txt', (err) => {
			if (err instanceof FileNotFoundError) {
				console.log(`✅ Колбэк поймал FileNotFoundError: ${err.message}`);
			} else {
				console.error('❌ Неожиданный тип ошибки:', err);
			}
			resolve();
		});
	});

	// 3.3. Удаление несуществующего файла.
	await new Promise((resolve) => {
		fm.deleteFile('фантом.txt', (err) => {
			if (err instanceof FileManagerError) {
				console.log(`✅ FileManagerError при удалении: ${err.message}`);
			}
			resolve();
		});
	});

	console.log('\n=== ТЕСТ 4: пакетные операции (гибрид) ===\n');

	// Создаём пачку — промис-стиль.
	const paths = await fm.createMultipleFiles([
		{ filename: 'batch1.txt', content: 'один' },
		{ filename: 'batch2.txt', content: 'два' },
		{ filename: 'batch3.txt', content: 'три' }
	]);
	console.log(`✅ Создано: ${paths.length} файлов`);

	// Читаем пачку — колбэк-стиль.
	await new Promise((resolve) => {
		fm.readMultipleFiles(['batch1.txt', 'batch2.txt', 'batch3.txt'], (err, data) => {
			if (err) {
				console.error('❌ Ошибка пакетного чтения:', err.message);
				return resolve();
			}
			console.log('✅ Содержимое:');
			for (const [name, content] of Object.entries(data)) {
				console.log(`   - ${name}: "${content}"`);
			}
			resolve();
		});
	});

	console.log('\n=== ОЧИСТКА ===\n');

	const all = await fm.listFiles();
	for (const name of all) {
		await fm.deleteFile(name);
		console.log(`🗑  Удалён: ${name}`);
	}

	console.log('\n✅ Готово.');
}

run().catch(err => {
	console.error('💥 Фатальная ошибка:', err);
	process.exit(1);
});