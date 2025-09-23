const path = require('path');
const { spawn } = require('child_process');

describe('budgetService.getBudgetOverview with Postgres', () => {
    it('keeps camelCase monthStart alias queryable for budget overview', async () => {
        const scriptPath = path.resolve(__dirname, 'budgetService.postgres.runner.js');

        await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit' });
            child.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Postgres budget overview runner exited with code ${code}`));
                }
            });
            child.on('error', reject);
        });
    });
});
