const { app, BrowserWindow, dialog } = require('electron')
const path = require('node:path')
const { spawn } = require('node:child_process')
const getPort = require('get-port')
const fs = require('node:fs')
const dotenv = require('dotenv')

// Load environment variables
// In production, .env should be next to the executable or in resources
const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../.env')

dotenv.config({ path: envPath })

console.log('DEBUG: Electron main.cjs loaded')
console.log('DEBUG: Env Path:', envPath)
console.log('DEBUG: KIE_API_KEY present:', !!process.env.KIE_API_KEY)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

let mainWindow
let nuxtProcess
let serverUrl

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false, // Security: Keep Node integration off for the renderer
            contextIsolation: true
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, '../public/logo.png') // Assuming favicon exists
    })

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
            mainWindow.webContents.toggleDevTools()
            event.preventDefault()
        }
    })

    // Load the waiting screen initially
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURI(`
    <html>
      <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #e2e8f0; color: #334155;">
        <div style="text-align: center;">
          <h2>Starting Auto-Playlist Engine...</h2>
          <p>Please wait while the server initializes.</p>
        </div>
      </body>
    </html>
  `))

    mainWindow.webContents.openDevTools()
}

async function startServer() {
    // Check for Dev Mode
    if (process.env.ELECTRON_DEV_URL) {
        console.log(`Running in Dev Mode. Connecting to ${process.env.ELECTRON_DEV_URL}`)
        mainWindow.loadURL(process.env.ELECTRON_DEV_URL)
        return
    }

    const port = await getPort({ port: 3000 })
    serverUrl = `http://localhost:${port}`

    let scriptPath = path.join(__dirname, '../.output/server/index.mjs')

    // Production: The server files are copied to 'resources/.output' via extraResources
    if (app.isPackaged) {
        scriptPath = path.join(process.resourcesPath, '.output/server/index.mjs')
    }

    // Verify build exists
    if (!fs.existsSync(scriptPath)) {
        dialog.showErrorBox('Error', 'Nuxt build not found at: ' + scriptPath)
        console.error('Nuxt build not found! Run "npm run build" first.')
        app.quit()
        return
    }

    console.log(`Starting Nuxt server on port ${port}...`)

    const logPath = path.join(path.dirname(app.getPath('exe')), 'debug_server.log')
    const logStream = fs.createWriteStream(logPath, { flags: 'a' })
    logStream.write(`\\n--- New Session ${new Date().toISOString()} ---\\n`)
    logStream.write(`Exe Path: ${app.getPath('exe')}\\n`)
    logStream.write(`Script Path: ${scriptPath}\\n`)
    logStream.write(`PATH: ${process.env.PATH}\\n`)

    // Spawn the Nuxt server
    // Use the Electron binary as the Node runtime (works even if Node is not installed)
    const nodeExecutable = process.execPath
    const extraEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: port,
        HOST: '0.0.0.0',
        NUXT_PORT: port,
        IS_ELECTRON: 'true',
        USER_DATA_PATH: app.getPath('userData'),
        KIE_API_KEY: process.env.KIE_API_KEY,
        KIE_FOLDER: process.env.KIE_FOLDER
    }

    // Fix for native modules (like better-sqlite3) in production
    // They are externalized to app.asar.unpacked/node_modules, but the child process
    // won't find them by default because it's running from a different location.
    if (app.isPackaged) {
        const unpackedModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')

        // Append to existing NODE_PATH or create it
        extraEnv.NODE_PATH = extraEnv.NODE_PATH
            ? `${extraEnv.NODE_PATH}${path.delimiter}${unpackedModulesPath}`
            : unpackedModulesPath

        console.log(`DEBUG: Production Mode - NODE_PATH set to: ${extraEnv.NODE_PATH}`)
    }

    console.log(`Spawning server with: ${nodeExecutable} ${scriptPath}`)

    // We cannot use 'node' as the executable because the user might not have it installed.
    // Instead, we run the Electron executable with ELECTRON_RUN_AS_NODE=1
    nuxtProcess = spawn(nodeExecutable, [scriptPath], {
        env: extraEnv,
        stdio: ['ignore', 'pipe', 'pipe'] // Capture stdio
    })

    nuxtProcess.stdout.pipe(logStream)
    nuxtProcess.stderr.pipe(logStream)

    nuxtProcess.on('error', (err) => {
        logStream.write(`Spawn Error: ${err.message}\\n`)
        dialog.showErrorBox('Server Error', 'Failed to start server process: ' + err.message)
        console.error('Failed to start server process:', err)
    })


    nuxtProcess.on('exit', (code, signal) => {
        // Ignore SIGTERM/SIGINT exits (app closing)
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
            dialog.showErrorBox('Server Exited', `Nuxt server exited with code ${code} and signal ${signal}`)
        }
    })

    // Wait for server to be ready
    const checkServer = async () => {
        try {
            const response = await fetch(serverUrl)
            if (response.ok) {
                console.log('Server is ready! Loading window...')
                mainWindow.loadURL(serverUrl)
            } else {
                setTimeout(checkServer, 500)
            }
        } catch (e) {
            setTimeout(checkServer, 500)
        }
    }

    checkServer()
}

app.whenReady().then(async () => {
    await createWindow()
    await startServer()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    if (nuxtProcess) {
        nuxtProcess.kill()
    }
})
