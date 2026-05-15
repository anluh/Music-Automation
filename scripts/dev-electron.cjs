const { execSync, spawn } = require('node:child_process')
const getPort = require('get-port')

const isWindows = process.platform === 'win32'

const spawnCommand = (command, args, options = {}) => {
    return spawn(command, args, {
        stdio: 'inherit',
        shell: isWindows,
        ...options
    })
}

const waitForServer = async (url) => {
    while (true) {
        try {
            const response = await fetch(url)
            if (response.ok || response.status < 500) return
        } catch (e) {
            // Server is still starting.
        }

        await new Promise(resolve => setTimeout(resolve, 500))
    }
}

const main = async () => {
    console.log(`[Dev] Node ${process.version} ABI ${process.versions.modules}`)
    console.log('[Dev] Rebuilding native modules for the dev server...')
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit' })

    const port = await getPort({ port: 3000 })
    const host = '127.0.0.1'
    const devUrl = `http://${host}:${port}`

    console.log(`[Dev] Starting Nuxt on ${devUrl}`)

    const nuxt = spawnCommand('npx', ['nuxt', 'dev', '--host', host, '--port', String(port)])

    const stop = () => {
        if (!nuxt.killed) nuxt.kill()
    }

    process.on('SIGINT', () => {
        stop()
        process.exit(0)
    })

    process.on('SIGTERM', () => {
        stop()
        process.exit(0)
    })

    await waitForServer(devUrl)

    console.log(`[Dev] Starting Electron with ${devUrl}`)

    const electron = spawnCommand('npx', ['cross-env', `ELECTRON_DEV_URL=${devUrl}`, 'electron', '.'], {
        env: {
            ...process.env,
            ELECTRON_DEV_URL: devUrl
        }
    })

    electron.on('exit', (code) => {
        stop()
        process.exit(code || 0)
    })
}

main().catch((error) => {
    console.error('[Dev] Failed to start:', error)
    process.exit(1)
})
