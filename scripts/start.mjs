import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const port = process.env.PORT ?? '3306'
process.env.GAMMA_DATA_DIR ??= '.gamma-reader'

if (process.env.GAMMA_READER_DIR) {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: port,
    GAMMA_SOURCE_NAME: 'Brain',
    GAMMA_SOURCE_WORKTREE: process.cwd(),
  })
  delete process.env.GAMMA_SOURCE_REPO
  delete process.env.GAMMA_SOURCE_URL
  const server = resolve(process.env.GAMMA_READER_DIR, 'web-packages/server/dist/main.js')
  await import(pathToFileURL(server).href)
} else {
  const child = spawn('npx', ['--yes', 'gamma-reader@latest', '--name', 'Brain', '--port', port], {
    stdio: 'inherit',
  })
  child.on('error', error => {
    console.error('Unable to start Gamma Reader:', error)
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exitCode = code ?? 1
  })
}
