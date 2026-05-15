import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve('d:/Projects D/auto-playlist/.env') });

async function getTaskInfo() {
    const KIE_BASE_URL = 'https://api.kie.ai';
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
        console.error('No API key found!');
        return;
    }

    const taskId = 'f0ee86c83aa72a4867df962459f1a85a';
    try {
        const res = await fetch(`${KIE_BASE_URL}/api/v1/generate/record-info?taskId=${taskId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error fetching task info:', e);
    }
}

getTaskInfo();
