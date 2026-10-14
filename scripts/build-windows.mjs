// Runs on Windows, or cross-publishes the Windows host from macOS/Linux.
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { root, stageWeb } from './stage-web.mjs';

const output = path.join(root, 'dist', 'windows');
await mkdir(output, { recursive: true });
const result = spawnSync(process.env.DOTNET || 'dotnet', [
  'publish', path.join(root, 'native/windows/ASTRALIS.csproj'),
  '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
  '-p:PublishSingleFile=true', '-o', output,
], { stdio: 'inherit', env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1' } });
if (result.error) {
  console.error('Install the .NET 8 SDK, or set DOTNET to the dotnet executable.');
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
await rm(path.join(output, 'www'), { recursive: true, force: true });
await stageWeb(path.join(output, 'www'));
console.log(`Built ${path.join(output, 'ASTRALIS.exe')}`);
