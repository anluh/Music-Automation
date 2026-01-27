
export default defineNuxtPlugin((nuxtApp) => {
    // Only run on client
    if (process.server) return

    let timer: NodeJS.Timeout | null = null

    const poll = async () => {
        try {
            // console.log('[Poller] Pinging...')
            await $fetch('/api/automation/poll_pending', { method: 'POST' })
        } catch (e) {
            console.error('[Poller] Failed:', e)
        } finally {
            // Schedule next poll only after current one finishes (prevent overlap)
            timer = setTimeout(poll, 5000)
        }
    }

    // Start polling
    poll()

    // Cleanup (though plugins usually persist for app life)
    // We don't really need to clear it unless the app unmounts completely
})
