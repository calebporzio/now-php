"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const child_process_1 = require("child_process");
const path_1 = require("path");
const net_1 = __importDefault(require("net"));
const helpers_1 = require("./helpers");
let server;
async function startServer(filename) {
    const docRoot = path_1.dirname(filename);
    console.log(`🐘 Spawning: PHP Server at ${docRoot}`);
    server = child_process_1.spawn('php', ['-c', 'php.ini', '-S', '127.0.0.1:8000', '-t', docRoot], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: helpers_1.getPhpDir(),
        env: {
            ...process.env,
            PATH: `${helpers_1.getPhpDir()}:${process.env.PATH}`
        }
    });
    server.on('close', function (code, signal) {
        console.log(`🐘 PHP process closed code ${code} and signal ${signal}`);
    });
    server.on('error', function (err) {
        console.error(`🐘 PHP process errored ${err}`);
    });
    await whenPortOpens(8000, 400);
    process.on('exit', () => {
        server.kill();
    });
    return server;
}
async function query({ filename, uri, headers, method, body }) {
    if (!server) {
        await startServer(filename);
    }
    return new Promise(resolve => {
        const options = {
            hostname: '127.0.0.1',
            port: 8000,
            path: `${uri}`,
            method,
            headers,
        };
        const req = http_1.default.request(options, (res) => {
            const chunks = [];
            res.on('data', (data) => {
                chunks.push(data);
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode || 200,
                    headers: res.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });
        req.on('error', (error) => {
            console.error('🐘 HTTP errored', error);
            resolve({
                body: Buffer.from(`HTTP error: ${error}`),
                headers: {},
                statusCode: 500
            });
        });
        if (body) {
            req.write(body);
        }
        req.end();
    });
}
function whenPortOpensCallback(port, attempts, cb) {
    const client = net_1.default.connect(port, '127.0.0.1');
    client.on('error', (error) => {
        if (!attempts)
            return cb(error);
        setTimeout(() => {
            whenPortOpensCallback(port, attempts - 1, cb);
        }, 50);
    });
    client.on('connect', () => {
        client.destroy();
        cb();
    });
}
function whenPortOpens(port, attempts) {
    return new Promise((resolve, reject) => {
        whenPortOpensCallback(port, attempts, (error) => {
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
async function launcher(event) {
    const awsRequest = helpers_1.normalizeEvent(event);
    const input = await helpers_1.transformFromAwsRequest(awsRequest);
    const output = await query(input);
    return helpers_1.transformToAwsResponse(output);
}
exports.launcher = launcher;
// (async function () {
//   const response = await launcher({
//       Action: "test",
//       httpMethod: "GET",
//       body: "",
//       path: "/",
//       host: "https://zeit.co",
//       headers: {
//           'HOST': 'zeit.co'
//       },
//       encoding: null,
//   });
//   console.log(response);
// })();
