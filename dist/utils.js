"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const build_utils_1 = require("@now/build-utils");
const PHP_BIN_DIR = path_1.default.join(__dirname, "..", "lib", "php");
const PHP_MODULES_DIR = path_1.default.join(PHP_BIN_DIR, "modules");
const PHP_LIB_DIR = path_1.default.join(__dirname, "..", "lib", "lib");
const COMPOSER_BIN = path_1.default.join(PHP_BIN_DIR, "composer");
async function getIncludedFiles({ files, entrypoint, workPath, config, meta }) {
    // Download all files to workPath
    const downloadedFiles = await build_utils_1.download(files, workPath, meta);
    let includedFiles = {};
    if (config && config.includeFiles) {
        // Find files for each glob
        for (const pattern of config.includeFiles) {
            const matchedFiles = await build_utils_1.glob(pattern, workPath);
            Object.assign(includedFiles, matchedFiles);
        }
        // explicit and always include the entrypoint
        Object.assign(includedFiles, {
            [entrypoint]: files[entrypoint],
        });
    }
    else {
        // Backwards compatibility
        includedFiles = downloadedFiles;
    }
    return includedFiles;
}
exports.getIncludedFiles = getIncludedFiles;
async function getPhpFiles({ meta }) {
    const files = await getPhpLibFiles();
    if (meta && meta.isDev) {
        delete files['php/php'];
        delete files['php/php-fpm'];
        delete files['php/php-fpm.ini'];
    }
    else {
        delete files['php/php-cgi'];
        delete files['php/php-fpm'];
        delete files['php/php-fpm.ini'];
    }
    return files;
}
exports.getPhpFiles = getPhpFiles;
async function getPhpLibFiles() {
    // Lookup for PHP bins, modules and shared objects
    const files = {
        ...await build_utils_1.glob('php/**', { cwd: path_1.default.join(__dirname, '..', 'lib') }),
        ...await build_utils_1.glob('lib/**', { cwd: path_1.default.join(__dirname, '..', 'lib') }),
    };
    // Replace paths in php.ini file
    const phpini = await build_utils_1.FileBlob.fromStream({
        stream: files['php/php.ini'].toStream(),
    });
    phpini.data = phpini.data
        .toString()
        .replace(/\/opt\/now\/modules/g, '/var/task/php/modules');
    files['php/php.ini'] = phpini;
    return files;
}
exports.getPhpLibFiles = getPhpLibFiles;
function getLauncherFiles({ meta }) {
    const files = {
        'helpers.js': new build_utils_1.FileFsRef({
            fsPath: path_1.default.join(__dirname, 'launchers/helpers.js'),
        })
    };
    if (meta && meta.isDev) {
        files['launcher.js'] = new build_utils_1.FileFsRef({
            fsPath: path_1.default.join(__dirname, 'launchers/cgi.js'),
        });
    }
    else {
        files['launcher.js'] = new build_utils_1.FileFsRef({
            fsPath: path_1.default.join(__dirname, 'launchers/server.js'),
        });
    }
    return files;
}
exports.getLauncherFiles = getLauncherFiles;
async function getComposerFiles(workPath) {
    console.log('🐘 Installing Composer deps.');
    // Install composer dependencies
    await runComposerInstall(workPath);
    console.log('🐘 Installing Composer deps OK.');
    return await build_utils_1.glob('vendor/**', workPath);
}
exports.getComposerFiles = getComposerFiles;
async function runComposerInstall(cwd) {
    // @todo think about allow to pass custom commands here
    await runPhp(cwd, [
        COMPOSER_BIN,
        'install',
        '--profile',
        '--no-dev',
        '--no-interaction',
        '--no-scripts',
        '--ignore-platform-reqs',
        '--no-progress'
    ], { stdio: 'inherit' });
}
async function runPhp(cwd, args, opts = {}) {
    try {
        await spawnAsync('php', [`-dextension_dir=${PHP_MODULES_DIR}`, ...args], cwd, {
            ...opts,
            ...{
                env: {
                    ...process.env,
                    ...{
                        COMPOSER_HOME: '/tmp',
                        PATH: `${PHP_BIN_DIR}:${process.env.PATH}`,
                        LD_LIBRARY_PATH: `${PHP_LIB_DIR}:/usr/lib64:/lib64:${process.env.LD_LIBRARY_PATH}`
                    }
                }
            }
        });
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
}
async function ensureLocalPhp() {
    try {
        await spawnAsync('which', ['php'], undefined, { stdio: 'pipe' });
        return true;
    }
    catch (e) {
        return false;
    }
}
exports.ensureLocalPhp = ensureLocalPhp;
function spawnAsync(command, args, cwd, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = child_process_1.spawn(command, args, {
            stdio: "ignore",
            cwd,
            ...opts
        });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Exited with ${code || signal}`));
            }
        });
    });
}
