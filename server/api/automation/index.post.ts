import { createGenerations } from '../../utils/generator'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { mood, songCount, workflowId } = body

    // Explicit import if needed, though Nuxt auto-imports. 
    // Just ensuring variables are defined.
    // const db = useDB() // removed as it is used inside createGenerations

    // We need to validate mood here or let createGenerations do it.
    // createGenerations throws, so we catch it? No, global handler catches it.

    const count = parseInt(songCount) || 1


    const wId = workflowId || 1

    // Use the utility
    const ids = createGenerations(wId, count, body)


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
