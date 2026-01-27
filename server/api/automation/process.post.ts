import { processGeneration } from '../../utils/processor'

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        const { id } = body
        // Output folder is now fetched inside processGeneration from settings

        const result = await processGeneration(id)
        return result

    } catch (e: any) {
        console.error('[Process Error]', e)
        throw createError({ statusCode: 500, statusMessage: e.message || 'Internal Server Error' })
    }
})
