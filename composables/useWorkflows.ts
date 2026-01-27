
export const useWorkflows = () => {
    // Shared state for all components
    const workflows = useState<any[]>('globalWorkflows', () => [])
    const isInitialized = useState<boolean>('workflowsInitialized', () => false)

    // Fetch and sync data
    const refreshWorkflows = async () => {
        try {
            const response = await $fetch<{ data: any[] }>('/api/workflows')
            workflows.value = response.data.map(w => ({
                ...w,
                is_active: !!w.is_active // Ensure boolean
            }))
            isInitialized.value = true
        } catch (e) {
            console.error('Failed to fetch workflows', e)
        }
    }

    // Toggle Action
    const toggleWorkflow = async (id: number) => {
        const wf = workflows.value.find(w => w.id === id)
        if (!wf) return

        const newState = !wf.is_active
        // Optimistic Update
        wf.is_active = newState

        try {
            await $fetch('/api/workflows/toggle', {
                method: 'POST',
                body: { id, isActive: newState }
            })
        } catch (e) {
            console.error(`Failed to toggle workflow ${id}`, e)
            wf.is_active = !newState // Revert
        }
    }

    // Helper to get specific workflow state
    const getWorkflowState = (id: number) => {
        const wf = workflows.value.find(w => w.id == id)
        return wf ? wf.is_active : false
    }

    // Initialize if needed (can be called by any component)
    const init = async () => {
        if (!isInitialized.value || workflows.value.length === 0) {
            await refreshWorkflows()
        }
    }

    return {
        workflows,
        isInitialized,
        refreshWorkflows,
        toggleWorkflow,
        getWorkflowState,
        init
    }
}
