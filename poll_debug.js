
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
const taskId = 'd83f40b8de4ddbee9a86fb1cee225d89' // The one I just created

async function run() {
    console.log('Polling Task:', taskId)
    while (true) {
        const res = await fetch(`${KIE_BASE_URL}/api/v1/lyrics/record-info?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        const json = await res.json()
        const status = json.data?.status
        console.log('Status:', status)

        if (status === 'SUCCESS') {
            console.log('Final Response:', JSON.stringify(json, null, 2))
            break
        }
        if (status === 'FAILED') {
            console.log('Failed:', json)
            break
        }
        await new Promise(r => setTimeout(r, 2000))
    }
}

run()
