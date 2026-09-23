const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Transform } = require('stream');

class FirstTask {
    VARIANT = 4;
    STUDENT_NAME = 'Грицкевич Александр';
    GROUP_NUMBER = '401';

    FAVORITE_ITEMS = [
        'Интерстеллар',
        'Матрица',
        '1984',
        'Преступление и наказание',
        'Бойцовский клуб'
    ];

    run() {

        const fileName = `student_${this.VARIANT}.txt`;
        const filePath = path.join(__dirname, fileName);

        const currentDate = new Date().toLocaleString('ru-RU');
        const initialContent = [
            `Студент: ${this.STUDENT_NAME}`,
            `Группа: ${this.GROUP_NUMBER}`,
            `Вариант: ${this.VARIANT}`,
            `Дата и время: ${currentDate}`,
            ...this.FAVORITE_ITEMS
        ].join('\n');

        fs.writeFileSync(filePath, initialContent, 'utf-8');

        const savedContent = fs.readFileSync(filePath, 'utf-8');
        const linesArray = savedContent.trim().split('\n');
        const lineCount = linesArray.length;

        fs.appendFileSync(filePath, `\nКоличество записей: ${lineCount}`, 'utf-8');

        const finalContent = fs.readFileSync(filePath, 'utf-8');

        console.log('='.repeat(50));
        console.log(`📄 СОДЕРЖИМОЕ ФАЙЛА "${fileName}":`);
        console.log('='.repeat(50));

        finalContent.split('\n').forEach((line, index) => {
            console.log(`[Строка ${index + 1}]`.padEnd(12) + `| ${line}`);
        });

        console.log('='.repeat(50));
        console.log(`✅ Файл успешно создан и обновлен: ${filePath}`);
    }
}

class SecondTask {
    VARIANT = 4;

    constructor() {
        this.projectName = `project_${this.VARIANT}`;
        this.projectPath = path.join(__dirname, this.projectName);

        this.folderDescriptions = {
            '': 'Корневой каталог проекта',
            'src': 'Исходный код приложения',
            'src/modules': 'Модули системы',
            'src/components': 'Компоненты приложения',
            'src/utils': 'Вспомогательные утилиты и функции',
            'data': 'Хранение данных приложения',
            'data/input': 'Входные данные для обработки',
            'data/output': 'Выходные данные и результаты',
            'temp': 'Временные файлы и кэш'
        };
    }

    run() {
        console.log(`🚀 Старт выполнения задачи для варианта ${this.VARIANT}\n`);

        this.createStructure();

        console.log('='.repeat(50));
        console.log(`📁 ДЕРЕВО СТРУКТУРЫ (${this.projectName}):`);
        console.log('='.repeat(50));
        console.log(this.projectName);
        this.printTree(this.projectPath);

        const oldTemp = path.join(this.projectPath, 'temp');
        const newTemp = path.join(this.projectPath, 'data', 'temp');
        fs.renameSync(oldTemp, newTemp);
        console.log('\n🔄 1. Папка "temp" перемещена в "data/temp"');

        const oldOutput = path.join(this.projectPath, 'data', 'output');
        const newResults = path.join(this.projectPath, 'data', 'results');
        fs.renameSync(oldOutput, newResults);
        console.log('✏️ 2. Папка "data/output" переименована в "data/results"');

        fs.rmSync(newTemp, { recursive: true, force: true });
        console.log('🗑️ 3. Папка "data/temp" и все её содержимое удалены');

        console.log('\n' + '='.repeat(50));
        console.log(`📁 ОБНОВЛЕННОЕ ДЕРЕВО СТРУКТУРЫ (${this.projectName}):`);
        console.log('='.repeat(50));
        console.log(this.projectName);
        this.printTree(this.projectPath);
    }

    createStructure() {
        const isEvenVariant = this.VARIANT % 2 === 0;
        const currentDate = new Date().toLocaleString('ru-RU');

        Object.entries(this.folderDescriptions).forEach(([relPath, description]) => {
            const dirPath = path.join(this.projectPath, relPath);

            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            fs.writeFileSync(
                path.join(dirPath, 'info.txt'),
                `Назначение папки: ${description}`,
                'utf-8'
            );

            if (isEvenVariant) {
                fs.writeFileSync(
                    path.join(dirPath, 'README.md'),
                    `# ${relPath || this.projectName}\nДата создания: ${currentDate}`,
                    'utf-8'
                );
            }
        });
    }

    printTree(dirPath, indent = '') {
        if (!fs.existsSync(dirPath)) return;

        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        items.forEach((item, index) => {
            const isLast = index === items.length - 1;
            const pointer = isLast ? '└── ' : '├── ';

            console.log(`${indent}${pointer}${item.name}`);

            if (item.isDirectory()) {
                const newIndent = indent + (isLast ? '    ' : '│   ');
                this.printTree(path.join(dirPath, item.name), newIndent);
            }
        });
    }
}

class ThirdTask {
    VARIANT = 4;
    MAX_FILE_SIZE = 10 * 1024 * 1024;

    constructor(targetDir) {
        this.targetDir = path.resolve(targetDir || process.argv[2] || '.');
        this.reportFileName = `report_${this.VARIANT}.json`;

        this.stats = {
            totalFiles: 0,
            totalFolders: 0,
            totalSize: 0,
            groupedByExtension: {},
            filesList: []
        };
    }

    run() {
        if (!fs.existsSync(this.targetDir)) {
            console.error(`❌ Ошибка: Указанный путь "${this.targetDir}" не существует.`);
            return;
        }

        console.log(`🔍 Сканирование директории: ${this.targetDir}\n`);

        this.scanDirectory(this.targetDir);

        const sortedFiles = [...this.stats.filesList].sort((a, b) => b.size - a.size);
        const top5Largest = sortedFiles.slice(0, 5);
        const top5Smallest = [...sortedFiles].reverse().slice(0, 5);

        const sizeInfo = {
            bytes: this.stats.totalSize,
            kb: (this.stats.totalSize / 1024).toFixed(2) + ' КБ',
            mb: (this.stats.totalSize / (1024 * 1024)).toFixed(2) + ' МБ'
        };

        const reportData = {
            scannedDirectory: this.targetDir,
            totalFiles: this.stats.totalFiles,
            totalFolders: this.stats.totalFolders,
            totalSize: sizeInfo,
            groupedByExtension: this.stats.groupedByExtension,
            top5LargestFiles: top5Largest.map(f => ({ path: f.relativePath, size: `${f.size} байт (${(f.size / 1024 / 1024).toFixed(2)} МБ)` })),
            top5SmallestFiles: top5Smallest.map(f => ({ path: f.relativePath, size: `${f.size} байт` }))
        };

        const reportPath = path.join(process.cwd(), this.reportFileName);
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');

        this.printConsoleReport(reportData, reportPath);
    }

    scanDirectory(dirPath) {
        let items;
        try {
            items = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch (err) {
            return;
        }

        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                this.stats.totalFolders++;
                this.scanDirectory(fullPath);
            } else if (item.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);

                    if (stat.size > this.MAX_FILE_SIZE) {
                        continue;
                    }

                    this.stats.totalFiles++;
                    this.stats.totalSize += stat.size;

                    const ext = path.extname(item.name).toLowerCase() || '[без расширения]';
                    const relativePath = path.relative(this.targetDir, fullPath);

                    if (!this.stats.groupedByExtension[ext]) {
                        this.stats.groupedByExtension[ext] = [];
                    }
                    this.stats.groupedByExtension[ext].push(relativePath);

                    this.stats.filesList.push({
                        relativePath,
                        size: stat.size
                    });
                } catch (err) {

                }
            }
        }
    }

    printConsoleReport(report, reportPath) {
        console.log('='.repeat(60));
        console.log('📊 СТАТИСТИКА ДИРЕКТОРИИ');
        console.log('='.repeat(60));
        console.log(`📁 Всего папок:           ${report.totalFolders}`);
        console.log(`📄 Всего файлов (< 10 МБ): ${report.totalFiles}`);
        console.log(`💾 Общий размер:         ${report.totalSize.bytes} байт | ${report.totalSize.kb} | ${report.totalSize.mb}`);
        
        console.log('\n📂 Файлы по типам:');
        Object.entries(report.groupedByExtension).forEach(([ext, files]) => {
            console.log(`  • ${ext}: ${files.length} файл(ов)`);
        });

        console.log('\n🔝 Топ-5 самых больших файлов:');
        report.top5LargestFiles.forEach((file, i) => {
            console.log(`  ${i + 1}. ${file.path} — ${file.size}`);
        });

        console.log('\n🔻 Топ-5 самых маленьких файлов:');
        report.top5SmallestFiles.forEach((file, i) => {
            console.log(`  ${i + 1}. ${file.path} — ${file.size}`);
        });

        console.log('='.repeat(60));
        console.log(`✅ Отчет сохранен в файл: ${reportPath}`);
    }
}

class FourthTask {
    VARIANT = 4;
    TOTAL_LINES = 100000;
    BUFFER_SIZE = 64 * 1024;

    constructor() {
        this.dataFile = path.join(__dirname, `data_${this.VARIANT}.txt`);
        this.resultFile = path.join(__dirname, `processed_${this.VARIANT}.txt`);
    }

    async run() {
        console.log(`🚀 Вариант ${this.VARIANT}: Обработка файла через потоки\n`);

        await this.generateFileIfNeeded();
        await this.processFileWithStreams();
    }

    async generateFileIfNeeded() {
        if (fs.existsSync(this.dataFile)) {
            console.log(`ℹ️ Файл ${path.basename(this.dataFile)} уже существует, генерация пропущена.`);
            return;
        }

        console.log(`📝 Генерация файла ${path.basename(this.dataFile)} (${this.TOTAL_LINES.toLocaleString('ru-RU')} строк)...`);
        
        const writeStream = fs.createWriteStream(this.dataFile, { encoding: 'utf-8' });

        for (let i = 1; i <= this.TOTAL_LINES; i++) {
            const randomNum = Math.floor(Math.random() * 1000) + 1;
            const line = `${i}, ${randomNum}, Вариант ${this.VARIANT}\n`;
            
            if (!writeStream.write(line)) {
                await new Promise(resolve => writeStream.once('drain', resolve));
            }
        }

        writeStream.end();
        await new Promise(resolve => writeStream.on('finish', resolve));

        const fileSizeMB = (fs.statSync(this.dataFile).size / (1024 * 1024)).toFixed(2);
        console.log(`✅ Файл успешно сгенерирован! Размер: ${fileSizeMB} МБ\n`);
    }

    async processFileWithStreams() {
        console.log(`⚡ Начат процесс потоковой обработки...`);

        const totalBytes = fs.statSync(this.dataFile).size;

        const readStream = fs.createReadStream(this.dataFile, {
            highWaterMark: this.BUFFER_SIZE,
            encoding: 'utf-8'
        });

        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });

        let lineCount = 0;
        let sum = 0;
        let min = Infinity;
        let max = -Infinity;
        let evenCount = 0;
        let oddCount = 0;

        let processedBytes = 0;
        let lastReportedPercent = 0;

        readStream.on('data', (chunk) => {
            processedBytes += Buffer.byteLength(chunk, 'utf-8');
            const currentPercent = Math.floor((processedBytes / totalBytes) * 100);
            
            if (currentPercent >= lastReportedPercent + 10 && currentPercent <= 100) {
                lastReportedPercent = Math.floor(currentPercent / 10) * 10;
                console.log(`⏳ Прогресс обработки: ${lastReportedPercent}%`);
            }
        });

        for await (const line of rl) {
            if (!line.trim()) continue;

            const parts = line.split(',');
            if (parts.length >= 2) {
                const num = parseInt(parts[1].trim(), 10);

                if (!isNaN(num)) {
                    lineCount++;
                    sum += num;
                    if (num < min) min = num;
                    if (num > max) max = num;

                    if (num % 2 === 0) {
                        evenCount++;
                    } else {
                        oddCount++;
                    }
                }
            }
        }

        const average = lineCount > 0 ? (sum / lineCount).toFixed(2) : 0;

        const reportContent = [
            `=== РЕЗУЛЬТАТЫ ОБРАБОТКИ ФАЙЛА data_${this.VARIANT}.txt ===`,
            `Количество строк: ${lineCount.toLocaleString('ru-RU')}`,
            `Сумма всех чисел: ${sum.toLocaleString('ru-RU')}`,
            `Среднее арифметическое: ${average}`,
            `Минимальное число: ${min}`,
            `Максимальное число: ${max}`,
            `Количество четных чисел: ${evenCount.toLocaleString('ru-RU')}`,
            `Количество нечетных чисел: ${oddCount.toLocaleString('ru-RU')}`
        ].join('\n');

        fs.writeFileSync(this.resultFile, reportContent, 'utf-8');

        console.log('\n' + '='.repeat(50));
        console.log(reportContent);
        console.log('='.repeat(50));
        console.log(`✅ Результаты сохранены в файл: ${path.basename(this.resultFile)}`);
    }
}

// Поток для удаления лишних пробелов и пустых строк из текстовых файлов
class SpaceCompressor extends Transform {
    _transform(chunk, encoding, callback) {
        const text = chunk.toString('utf-8');
        const compressed = text
            .split('\n')
            .map(line => line.trim().replace(/[ \t]+/g, ' '))
            .filter(line => line.length > 0)
            .join('\n');

        this.push(compressed);
        callback();
    }
}

class FifthTask {
    VARIANT = 4;
    ONE_MB = 1024 * 1024;
    CHUNK_SIZE = 512 * 1024;

    constructor() {
        this.sourceDir = path.join(__dirname, `source_${this.VARIANT}`);
        this.backupDir = path.join(__dirname, `backup_${this.VARIANT}`);
        this.syncReportPath = path.join(__dirname, `sync_report_${this.VARIANT}.txt`);
    }

    async run() {
        console.log(`🚀 Вариант ${this.VARIANT}: Резервное копирование и синхронизация\n`);

        this.createTestData();
        await this.backupWithFiltering();
        this.synchronizeAndReport();
    }

    createTestData() {
        console.log(`📁 1. Создание тестовой структуры в ${path.basename(this.sourceDir)}...`);

        if (fs.existsSync(this.sourceDir)) {
            fs.rmSync(this.sourceDir, { recursive: true, force: true });
        }

        const subfolders = ['dir1', 'dir2', 'dir3'];
        subfolders.forEach(sub => fs.mkdirSync(path.join(this.sourceDir, sub), { recursive: true }));

        const extensions = ['.txt', '.js', '.json', '.jpg', '.png', '.gif', '.dat'];
        const manifest = { files: [] };

        for (let i = 1; i <= 19; i++) {
            const ext = extensions[i % extensions.length];
            const sub = subfolders[i % subfolders.length];
            const relPath = i % 2 === 0 ? `file_${i}${ext}` : path.join(sub, `file_${i}${ext}`);
            const fullPath = path.join(this.sourceDir, relPath);

            let content = `Содержимое   файла   #${i}    с    лишними   пробелами.\n\n Вторая   строка.`;
            if (ext === '.json') content = `{\n  "id": ${i},\n  "name": "test ${i}"\n}`;

            fs.writeFileSync(fullPath, content, 'utf-8');
            manifest.files.push({ path: relPath, size: fs.statSync(fullPath).size, type: ext });
        }

        const largeFilePath = path.join(this.sourceDir, 'dir1', 'large_file.txt');
        const largeText = 'Строка с   лишними   пробелами  для   большого  файла.\n'.repeat(30000); // ~1.2 МБ
        fs.writeFileSync(largeFilePath, largeText, 'utf-8');
        manifest.files.push({ path: 'dir1/large_file.txt', size: fs.statSync(largeFilePath).size, type: '.txt' });

        fs.writeFileSync(
            path.join(this.sourceDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2),
            'utf-8'
        );

        console.log(`✅ Создано 20 файлов, 3 подпапки и manifest.json\n`);
    }

    async backupWithFiltering() {
        console.log(`📦 2. Старт резервного копирования в ${path.basename(this.backupDir)}...`);

        if (fs.existsSync(this.backupDir)) {
            fs.rmSync(this.backupDir, { recursive: true, force: true });
        }

        const files = this.getAllFiles(this.sourceDir);
        let processedCount = 0;

        for (const relativePath of files) {
            const srcPath = path.join(this.sourceDir, relativePath);
            const destPath = path.join(this.backupDir, relativePath);

            fs.mkdirSync(path.dirname(destPath), { recursive: true });

            const stat = fs.statSync(srcPath);
            const ext = path.extname(srcPath).toLowerCase();
            const isTextFile = ['.txt', '.js', '.json'].includes(ext);
            const isImageFile = ['.jpg', '.png', '.gif'].includes(ext);

            if (stat.size > this.ONE_MB) {
                await this.copyInChunks(srcPath, destPath, isTextFile);
            } else if (isTextFile) {

                await this.copyWithStream(srcPath, destPath, true);
            } else if (isImageFile) {

                fs.copyFileSync(srcPath, destPath);
            } else {

                await this.copyWithStream(srcPath, destPath, false);
            }

            processedCount++;
            const percent = Math.round((processedCount / files.length) * 100);
            console.log(`⏳ Прогресс: ${percent}% (${processedCount}/${files.length}) — ${relativePath}`);
        }

        console.log(`✅ Копирование завершено.\n`);
    }

    copyWithStream(srcPath, destPath, compress) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(srcPath, { encoding: 'utf-8' });
            const writeStream = fs.createWriteStream(destPath, { encoding: 'utf-8' });

            if (compress) {
                const compressor = new SpaceCompressor();
                readStream.pipe(compressor).pipe(writeStream);
            } else {
                readStream.pipe(writeStream);
            }

            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            readStream.on('error', reject);
        });
    }

    async copyInChunks(srcPath, destPath, compress) {
        let content = fs.readFileSync(srcPath, 'utf-8');

        if (compress) {
            content = content
                .split('\n')
                .map(line => line.trim().replace(/[ \t]+/g, ' '))
                .filter(line => line.length > 0)
                .join('\n');
        }

        const buffer = Buffer.from(content, 'utf-8');
        let chunkIndex = 1;

        for (let offset = 0; offset < buffer.length; offset += this.CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, offset + this.CHUNK_SIZE);
            const chunkPath = `${destPath}.part${chunkIndex}`;
            fs.writeFileSync(chunkPath, chunk);
            chunkIndex++;
        }
    }

    synchronizeAndReport() {
        console.log(`📊 3. Сравнение папок и создание отчета...`);

        const sourceFiles = new Set(this.getAllFiles(this.sourceDir));
        const backupRawFiles = this.getAllFiles(this.backupDir);

        const backupFiles = new Set(
            backupRawFiles.map(f => f.replace(/\.part\d+$/, ''))
        );

        const added = [];
        const deleted = [];
        const modified = [];

        for (const file of sourceFiles) {
            if (!backupFiles.has(file)) {
                added.push(file);
            } else {
                const srcPath = path.join(this.sourceDir, file);
                const destPath = path.join(this.backupDir, file);

                const actualDestPath = fs.existsSync(destPath) ? destPath : `${destPath}.part1`;

                if (fs.existsSync(actualDestPath)) {
                    const srcStat = fs.statSync(srcPath);
                    const destStat = fs.statSync(actualDestPath);
                    const ext = path.extname(file).toLowerCase();

                    if (!['.txt', '.js', '.json'].includes(ext) && srcStat.size !== destStat.size) {
                        modified.push(file);
                    }
                }
            }
        }

        for (const file of backupFiles) {
            if (!sourceFiles.has(file)) {
                deleted.push(file);
            }
        }

        const reportLines = [
            `=== ОТЧЕТ СИНХРОНИЗАЦИИ (${new Date().toLocaleString('ru-RU')}) ===`,
            `Источник: ${this.sourceDir}`,
            `Резервная копия: ${this.backupDir}\n`,
            `➕ Добавленные файлы (${added.length}):`,
            ...(added.length ? added.map(f => `  - ${f}`) : ['  (нет)']),
            `\n➖ Удаленные файлы (${deleted.length}):`,
            ...(deleted.length ? deleted.map(f => `  - ${f}`) : ['  (нет)']),
            `\n📝 Измененные файлы (${modified.length}):`,
            ...(modified.length ? modified.map(f => `  - ${f}`) : ['  (нет)'])
        ];

        const reportText = reportLines.join('\n');
        fs.writeFileSync(this.syncReportPath, reportText, 'utf-8');

        console.log('='.repeat(50));
        console.log(reportText);
        console.log('='.repeat(50));
        console.log(`✅ Отчет успешно сохранен в: ${this.syncReportPath}`);
    }

    getAllFiles(dirPath, arrayOfFiles = [], basePath = dirPath) {
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                this.getAllFiles(fullPath, arrayOfFiles, basePath);
            } else {
                arrayOfFiles.push(path.relative(basePath, fullPath));
            }
        });

        return arrayOfFiles;
    }
}

const tsk = new FourthTask();
tsk.run();