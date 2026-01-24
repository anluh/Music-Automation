export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { mood, stylePrompt, weirdnessMin, weirdnessMax, bpmMin, bpmMax, styleInfluenceMin, styleInfluenceMax, songCount, outputFolder } = body

    if (!mood) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Mood is required',
        })
    }

    const db = useDB()
    const stmt = db.prepare(`
    INSERT INTO generations (mood, style_prompt, weirdness_min, weirdness_max, bpm_min, bpm_max, style_influence_min, style_influence_max, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_GEMINI')
  `)

    const count = parseInt(songCount) || 1
    const ids: (number | bigint)[] = []

    const insert = db.transaction((generationsToCreate: number) => {
        for (let i = 0; i < generationsToCreate; i++) {
            const info = stmt.run(
                mood,
                stylePrompt || '',
                weirdnessMin || 40, weirdnessMax || 60,
                bpmMin || 100, bpmMax || 130,
                styleInfluenceMin || 40, styleInfluenceMax || 60
            )
            ids.push(info.lastInsertRowid)
        }
    })

    insert(count)

    // Trigger background worker (in a real queue system, we'd push to queue. 
    // Here we can just conceptually know it's ready for processing)

    return {
        code: 200,
        msg: 'success',
        data: {
            ids,
            mood,
            count,
            status: 'PENDING_GEMINI'
        }
    }
})
