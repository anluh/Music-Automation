
import { useDB } from './db'

export const createGenerations = (workflowId: number, count: number, settings: any) => {
    const { mood, stylePrompt, tags, weirdnessMin, weirdnessMax, bpmMin, bpmMax, styleInfluenceMin, styleInfluenceMax, vocalGender, isInstrumental } = settings

    if (!mood) {
        throw new Error('Mood is required')
    }

    const db = useDB()
    const stmt = db.prepare(`
    INSERT INTO generations (workflow_id, mood, style_prompt, weirdness_min, weirdness_max, bpm_min, bpm_max, style_influence_min, style_influence_max, vocal_gender_probability, is_instrumental, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_GEMINI')
  `)

    const ids: (number | bigint)[] = []

    const insert = db.transaction((generationsToCreate: number) => {
        for (let i = 0; i < generationsToCreate; i++) {
            let currentStyle = stylePrompt || ''
            if (tags && Array.isArray(tags) && tags.length > 0) {
                currentStyle = tags[i % tags.length]
            }

            const info = stmt.run(
                workflowId,
                mood,
                currentStyle,
                weirdnessMin || 40, weirdnessMax || 60,
                bpmMin || 100, bpmMax || 130,
                styleInfluenceMin || 40, styleInfluenceMax || 60,
                vocalGender !== undefined ? vocalGender : 50,
                isInstrumental ? 1 : 0
            )
            ids.push(info.lastInsertRowid)
        }
    })

    insert(count)
    return ids
}
