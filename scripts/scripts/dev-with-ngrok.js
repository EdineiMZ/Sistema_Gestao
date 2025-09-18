require('dotenv').config();

const { spawn } = require('child_process');
const { connect } = require('@ngrok/ngrok');

const requiredEnv = {
  SESSION_SECRET: 'Defina SESSION_SECRET com um valor secreto forte para iniciar o servidor com segurança.',
  NGROK_AUTHTOKEN: 'Defina NGROK_AUTHTOKEN com o token da sua conta Ngrok.'
};

for (const [key, message] of Object.entries(requiredEnv)) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    console.error(`\n[dev-with-ngrok] Variável de ambiente ausente: ${key}. ${message}`);
    process.exit(1);
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const devProcess = spawn(npmCommand, ['run', 'dev'], {
  stdio: 'inherit',
  env: process.env
});

let tunnel;
let shuttingDown = false;

const buildConnectOptions = () => {
  const options = {
    authtoken: process.env.NGROK_AUTHTOKEN,
    addr: process.env.PORT || 3000,
    proto: 'http',
    hostHeader: 'localhost'
  };

  if (process.env.NGROK_DOMAIN) {
    options.domain = process.env.NGROK_DOMAIN;
  }

  if (process.env.NGROK_REGION) {
    options.region = process.env.NGROK_REGION;
  }

  return options;
};

const cleanup = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  process.off('SIGINT', handleSigint);
  process.off('SIGTERM', handleSigterm);

  if (tunnel) {
    try {
      await tunnel.close();
      console.log('[dev-with-ngrok] Túnel Ngrok encerrado.');
    } catch (error) {
      console.error('[dev-with-ngrok] Falha ao encerrar túnel Ngrok:', error);
    }
  }

  if (devProcess && devProcess.exitCode === null) {
    devProcess.kill('SIGTERM');
  }

  if (exitCode !== null) {
    process.exit(exitCode);
  }
};

const handleSigint = () => cleanup(0);
const handleSigterm = () => cleanup(0);

process.once('SIGINT', handleSigint);
process.once('SIGTERM', handleSigterm);

devProcess.on('exit', (code) => {
  const exitCode = typeof code === 'number' ? code : 0;
  console.log(`[dev-with-ngrok] Processo de desenvolvimento encerrado com código ${exitCode}.`);
  cleanup(exitCode);
});

devProcess.on('error', (error) => {
  console.error('[dev-with-ngrok] Falha ao iniciar npm run dev:', error);
  cleanup(1);
});

(async () => {
  try {
    tunnel = await connect(buildConnectOptions());
    if (tunnel && tunnel.url()) {
      console.log(`\n[dev-with-ngrok] Túnel ativo: ${tunnel.url()}`);
    } else {
      console.log('\n[dev-with-ngrok] Túnel Ngrok estabelecido.');
    }
  } catch (error) {
    console.error('[dev-with-ngrok] Falha ao abrir túnel Ngrok:', error);
    await cleanup(1);
  }
})();
