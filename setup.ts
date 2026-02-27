import { intro, outro, text, select, confirm, spinner, isCancel, cancel } from '@clack/prompts';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  intro('Welcome to FTC Dashboard Setup');

  const port = await text({
    message: 'Which port should the server run on?',
    placeholder: '3000',
    initialValue: '3000',
    validate(value) {
      if (isNaN(Number(value))) return 'Please enter a valid number';
    },
  });

  if (isCancel(port)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  const ollamaInstalled = await checkOllama();
  
  if (!ollamaInstalled) {
    const installOllama = await confirm({
      message: 'Ollama is not installed. Would you like to install it now?',
    });

    if (isCancel(installOllama)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    if (installOllama) {
      const s = spinner();
      s.start('Installing Ollama...');
      try {
        execSync('curl -fsSL https://ollama.com/install.sh | sh', { stdio: 'inherit' });
        s.stop('Ollama installed successfully');
      } catch (error) {
        s.stop('Failed to install Ollama');
        outro('Please install Ollama manually: https://ollama.com');
        process.exit(1);
      }
    } else {
      outro('Setup requires Ollama. Please install it and try again.');
      process.exit(1);
    }
  }

  const model = await text({
    message: 'Enter the Ollama model you would like to use:',
    placeholder: 'gemma:2b',
    initialValue: 'gemma:2b',
  });

  if (isCancel(model)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  const s = spinner();
  s.start(`Pulling model ${model}...`);
  try {
    // Stop spinner before running inherit process
    s.stop(`Pulling model ${model}...`);
    execSync(`ollama pull ${model}`, { stdio: 'inherit' });
    console.log(`\nModel ${model} pulled successfully`);
  } catch (error) {
    console.error(`\nFailed to pull model ${model}`);
    outro('Make sure Ollama is running and try again.');
    process.exit(1);
  }

  const exaApiKey = await text({
    message: 'Enter your Exa API Key (optional):',
    placeholder: 'Leave empty to skip',
  });

  if (isCancel(exaApiKey)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  const envContent = `PORT=${port}
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=${model}
EXA_API_KEY=${exaApiKey || ''}
APP_URL=http://localhost:${port}
`;

  fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);

  outro('Setup complete! You can now run the app with "npm run dev"');
}

async function checkOllama(): Promise<boolean> {
  try {
    execSync('which ollama', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

setup().catch(console.error);
