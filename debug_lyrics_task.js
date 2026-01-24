
import { readFileSync } from 'fs'

let apiKey = ''
try {
    const env = readFileSync('.env', 'utf-8')
    const match = env.match(/KIE_API_KEY=(.*)/)
    if (match) apiKey = match[1].trim()
} catch (e) {
    console.error('Could not read .env')
    process.exit(1)
}

const KIE_BASE_URL = 'https://api.kie.ai'
const taskId = '630aa6749ba11c23d2120cc8e08ca32a' // Reusing the one from previous run if valid, or creates new if needed?
// Since I can't guarantee previous ID is still valid/useful (it might be too fast to expire? no, 14 days).
// But for safety, I'll create a new one to be fresh.

async function tryGet(url, query = {}) {
    const qs = new URLSearchParams(query).toString()
    const fullUrl = qs ? `${url}?${qs}` : url
    console.log(`Trying GET ${fullUrl}...`)
    try {
        const res = await fetch(fullUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        const text = await res.text()
        console.log(`Status: ${res.status}`)
        try {
            const json = JSON.parse(text)
            if (res.status === 200) console.log('Response:', JSON.stringify(json, null, 2))
            return json
        } catch (e) { return text }
    } catch (e) {
        console.error('Fetch error:', e.message)
    }
}

async function run() {
    console.log('--- Creating New Task ---')
    const res = await fetch(`${KIE_BASE_URL}/api/v1/lyrics`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: "Testing endpoints",
            callBackUrl: "https://google.com"
        })
    })
    const data = await res.json()
    const taskId = data.data?.taskId
    console.log('Task ID:', taskId)

    if (!taskId) return

    await new Promise(r => setTimeout(r, 2000))

    await tryGet(`${KIE_BASE_URL}/api/v1/lyrics/record-info`, { taskId })
    await tryGet(`${KIE_BASE_URL}/api/v1/lyrics/status`, { taskId })
    await tryGet(`${KIE_BASE_URL}/api/v1/lyrics/get`, { taskId })
    await tryGet(`${KIE_BASE_URL}/api/v1/lyrics/info`, { taskId })
    // Maybe it's singular 'lyric'?
    await tryGet(`${KIE_BASE_URL}/api/v1/lyric/info`, { taskId })
}

run()
