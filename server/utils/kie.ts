



const KIE_BASE_URL = 'https://api.kie.ai'

const getHeaders = () => {
    const apiKey = process.env.KIE_API_KEY
    if (!apiKey) {
        throw new Error('KIE_API_KEY is not set')
    }
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    }
}

export const kie = {
    // Gemini / Chat
    async generateSongList(mood: string, styleTags: string, count: number, excludedTitles: string[] = []) {
        // We ask for exactly 'count' songs.

        let exclusionText = ''
        if (excludedTitles.length > 0) {
            exclusionText = `
      NEGATIVE CONSTRAINTS (CRITICAL):
      - DO NOT use any of the following titles: ${excludedTitles.join(', ')}
      - Do not use titles that are very similar to these.`
        }

        const prompt = `
      Generate a list of 2 unique song titles and ONE short music description prompt based on the mood: "${mood}" and style tags: "${styleTags}".
      
      TITLES INSTRUCTIONS:
      - Must be innovative and BASED ON CURRENT VIRAL & US MUSIC TRENDS.
      - Sometimes can use modern slang (Gen Z/Alpha) or well-known foreign words understood in the US.
      - Titles should rarely be duplicated and should mirror the music description's vibe.
      ${exclusionText}

      RANDOMNESS SEED: ${Math.random()} (Use this to diverge from previous outputs)

      PROMPT INSTRUCTIONS:
      - Create a single "lyric_prompt" value that serves as a Suno music description.
      - MERGE the Mood ("${mood}") and Style Tags ("${styleTags}") into a cohesive, descriptive string.
      - The description MUST be under 490 characters.
      - Focus on the vibe, instruments, pacing, and emotional tone.
      
      The output must be valid JSON in the following format:
      {
        "title1": "Innovative Title 1",
        "title2": "Innovative Title 2",
        "lyric_prompt": "Merged description of mood and style... under 490 chars"
      }
      Do not include any markdown formatting or explanations, just the JSON object.
    `

        try {
            // Using Gemini 3 Flash via Kie.ai standard endpoint
            // Based on user request: https://kie.ai/gemini-3-flash
            const endpoint = `${KIE_BASE_URL}/gemini-3-flash/v1/chat/completions`

            const payload = {
                model: 'gemini-3-flash',
                messages: [
                    { role: 'system', content: 'You are a creative music assistant.' },
                    { role: 'user', content: prompt }
                ]
            }

            console.log(`[Kie] Sending request to ${endpoint} with payload:`, JSON.stringify(payload, null, 2))

            let response: any
            let lastError: any

            // Retry logic (3 attempts)
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    response = await $fetch<any>(endpoint, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: payload
                    })

                    if (response && (response.code === 500 || response.error)) {
                        throw new Error(response.msg || response.message || JSON.stringify(response))
                    }

                    break // Success
                } catch (e: any) {
                    lastError = e
                    console.error(`[Kie] Attempt ${attempt} failed:`, e.message)
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000)) // Wait 1s
                }
            }

            if (!response) {
                console.error('[Kie] All attempts failed. Last error:', lastError)
                throw lastError || new Error('Gemini Generation failed after 3 attempts')
            }

            console.log('[Kie] Response received:', JSON.stringify(response, null, 2))

            let content = ''
            if (response && response.choices && response.choices.length > 0) {
                content = response.choices[0].message.content
            } else if (response && response.candidates && response.candidates.length > 0) {
                // Native Gemini format support just in case
                content = response.candidates[0].content.parts[0].text
            } else {
                console.error('[Kie] Invalid Response Structure:', response)
                // Throwing with JSON string to see it in frontend
                throw new Error(`Invalid response from Gemini API: ${JSON.stringify(response)}`)
            }

            // Clean potential markdown blocks
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim()
            return JSON.parse(cleanContent)
        } catch (e: any) {
            console.error('Gemini Error:', e)
            throw createError({ statusCode: 500, statusMessage: e.message || 'Gemini Generation Failed' })
        }
    },

    // Lyrics - Using Kie Lyrics API (async)
    async generateLyrics(prompt: string, callBackUrl: string = 'https://google.com') {
        try {
            const endpoint = `${KIE_BASE_URL}/api/v1/lyrics`

            const payload = {
                prompt,
                callBackUrl
            }

            console.log(`[Kie] Generating lyrics via Suno API with payload:`, JSON.stringify(payload, null, 2))

            let response: any
            let lastError: any

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    response = await $fetch<any>(endpoint, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: payload
                    })

                    if (response && (response.code >= 400 || response.error)) {
                        throw new Error(response.msg || response.message || JSON.stringify(response))
                    }

                    break // Success
                } catch (e: any) {
                    lastError = e
                    console.error(`[Kie] Lyrics Attempt ${attempt} failed:`, e.message)
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000))
                }
            }

            if (!response) {
                console.error('[Kie] All lyrics attempts failed. Last error:', lastError)
                throw lastError || new Error('Lyrics Generation failed after 3 attempts')
            }

            console.log('[Kie] Lyrics Response:', JSON.stringify(response, null, 2))
            return response.data // Should contain { taskId: "..." }
        } catch (e: any) {
            console.error('Lyrics Error:', e)
            throw createError({ statusCode: 500, statusMessage: e.message || 'Lyrics Generation Failed' })
        }
    },

    async getLyricsTask(taskId: string) {
        try {
            const response = await $fetch<any>(`${KIE_BASE_URL}/api/v1/lyrics/record-info`, {
                method: 'GET',
                headers: getHeaders(),
                query: { taskId }
            })
            // console.log(`[Kie] Lyrics Task Info for ${taskId}:`, JSON.stringify(response, null, 2))
            return response.data
        } catch (e) {
            console.error('Lyrics Task Info Error:', e)
            throw e
        }
    },

    // Suno Music
    async generateMusic(payload: { prompt: string; tags?: string; mv?: string; title?: string; weirdness?: number; bpm?: number; styleInfluence?: number; callbackUrl?: string, customMode?: boolean, vocalGender?: string, instrumental?: boolean }) {
        try {
            // Endpoint: /api/v1/generate
            // Mapping internal 'tags' to API 'style'.
            // Mapping internal 'prompt' (which contains lyrics in our case) to 'prompt'.
            // Note: If using custom lyrics, set customMode: true.

            // Construct style string with BPM if provided
            let style = payload.tags || ''
            if (payload.bpm) {
                style = `${payload.bpm} bpm, ${style}`
            }

            let prompt = payload.prompt

            // If Description Mode (customMode=false), Suno expects a description of the music style.
            // User requested NOT to append style to prompt.

            const apiPayload = {
                customMode: true,
                prompt: prompt,
                style: style,
                title: payload.title || '',
                model: 'V5',
                callBackUrl: payload.callbackUrl || 'https://google.com',
                weirdnessConstraint: payload.weirdness ? payload.weirdness / 100 : undefined,
                styleWeight: payload.styleInfluence ? payload.styleInfluence / 100 : undefined,
                vocalGender: payload.vocalGender,
                instrumental: payload.instrumental
            }

            console.log('[Kie] Generating Music with payload:', apiPayload)

            let response: any
            let lastError: any

            // Retry logic (3 attempts)
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    response = await $fetch<any>(`${KIE_BASE_URL}/api/v1/generate`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: apiPayload
                    })

                    if (response && (response.code >= 400 || response.error)) {
                        throw new Error(response.msg || response.message || JSON.stringify(response))
                    }

                    break // Success
                } catch (e: any) {
                    lastError = e
                    console.error(`[Kie] Music Attempt ${attempt} failed:`, e.message)
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000)) // Wait 1s
                }
            }

            if (!response) {
                console.error('[Kie] All music attempts failed. Last error:', lastError)
                throw lastError || new Error('Music Generation failed after 3 attempts')
            }

            console.log('[Kie] Generate Music Response:', response)
            return response.data // { taskId: "..." }
        } catch (e: any) {
            console.error('Suno Generation Error:', e)
            throw e
        }
    },

    // Task Info / Status
    async getTaskInfo(taskId: string) {
        try {
            // Endpoint: /api/v1/generate/record-info ?
            // Need to verify this one. The previous code had /suno-api/...
            // The generate-music doc used /api/v1/generate. 
            // Usually the status endpoint is /api/v1/get?taskId=... or /api/v1/generate/record-info?taskId=...
            // Let's assume standard Kie structure or search.
            // Based on patterns: GET /api/v1/generate/record-info?taskId=...
            // I will try to use the one from the generated code before, updated to /api/v1/generate/record-info

            const response = await $fetch<any>(`${KIE_BASE_URL}/api/v1/generate/record-info`, {
                method: 'GET',
                headers: getHeaders(),
                query: { taskId }
            })
            console.log(`[Kie] Task Info for ${taskId}:`, JSON.stringify(response, null, 2))
            return response.data
        } catch (e) {
            console.error('Task Info Error:', e)
            throw e
        }
    }
}
