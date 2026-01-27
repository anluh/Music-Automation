
import { join } from 'node:path'
import { downloadManager } from './downloader'
// @ts-ignore
import { kie } from './kie'
import { useDB } from './db'

export const processGeneration = async (id: number) => {
    const db = useDB()
    const row = db.prepare('SELECT * FROM generations WHERE id = ?').get(id) as any

    if (!row) {
        throw new Error('Generation not found')
    }

    console.log(`[Processor] Processing ID ${id} (Workflow ${row.workflow_id}) - Status: ${row.status}`)

    // Fetch Settings (needed for most steps)
    const settingsRows = db.prepare('SELECT key, value FROM settings WHERE workflow_id = ?').all(row.workflow_id) as { key: string, value: string }[]
    const settings: Record<string, string> = {}
    settingsRows.forEach(r => settings[r.key] = r.value)

    const outputFolder = settings.outputFolder || 'C:\\MusicOutput' // Default
    const maxSongs = settings.playlistSize ? parseInt(settings.playlistSize) : 20

    // --- STEP 1: GEMINI ---
    if (row.status === 'PENDING_GEMINI') {
        console.log('[Processor] Starting Gemini Generation...')

        // 1. Fetch recent song names to avoid duplicates
        const previousTitles: string[] = []
        try {
            const rows = db.prepare(`
                SELECT song_name_1, song_name_2 
                FROM generations 
                WHERE workflow_id = ? AND id != ? 
                AND (song_name_1 IS NOT NULL OR song_name_2 IS NOT NULL)
                ORDER BY created_at DESC 
                LIMIT 20
            `).all(row.workflow_id, id) as any[]

            rows.forEach(r => {
                if (r.song_name_1) previousTitles.push(r.song_name_1)
                if (r.song_name_2) previousTitles.push(r.song_name_2)
            })
        } catch (e) {
            console.warn('[Processor] Failed to fetch previous titles for exclusion:', e)
        }

        // 2. Call Gemini to get 2 songs
        // Ensure kie is available
        if (!kie || !kie.generateSongList) throw new Error('Kie utility not found')

        const songs = await kie.generateSongList(row.mood, 2, previousTitles)
        console.log('[Processor] Gemini Response:', songs)

        // Update DB
        db.prepare(`
      UPDATE generations 
      SET song_name_1 = ?, lyric_prompt = ?, 
          song_name_2 = ?, 
          status = 'PENDING_LYRICS'
      WHERE id = ?
    `).run(
            songs.title1,
            JSON.stringify({ p1: songs.lyric_prompt }),
            songs.title2,
            id
        )

        return { status: 'PENDING_LYRICS', msg: 'Gemini generation complete' }
    }

    // --- STEP 2: LYRICS ---
    if (row.status === 'PENDING_LYRICS') {
        if (!row.lyrics_task_id) {
            // Parse the prompt from Gemini
            const prompts = JSON.parse(row.lyric_prompt || '{}')
            const descriptionPrompt = (prompts.p1 || row.mood || '').substring(0, 200)

            const lyricsTask = await kie.generateLyrics(descriptionPrompt)
            console.log('[Processor] Lyrics Task Response:', lyricsTask)

            if (lyricsTask && lyricsTask.taskId) {
                db.prepare("UPDATE generations SET lyrics_task_id = ? WHERE id = ?").run(lyricsTask.taskId, id)
                return { status: 'PENDING_LYRICS', msg: 'Lyrics generation started' }
            } else {
                console.error('[Processor] Lyrics Task Missing ID:', lyricsTask)
                return { status: 'PENDING_LYRICS', msg: 'Failed to start lyrics (Kie returned no Task ID)' }
            }
        } else {
            // If we have a task ID, we just wait (Poll Pending handles this)
            return { status: 'PENDING_LYRICS', msg: 'Waiting for lyrics...' }
        }
    }

    // --- STEP 3: MUSIC ---
    // This step initiates the Suno Task.
    if (row.status === 'PENDING_MUSIC') {
        if (!row.suno_task_id) {
            const getRandom = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

            const wVal = getRandom(row.weirdness_min || 40, row.weirdness_max || 60)
            const sVal = getRandom(row.style_influence_min || 40, row.style_influence_max || 60)
            const bpmVal = getRandom(row.bpm_min || 100, row.bpm_max || 130)

            // Parse the prompt from Gemini
            const prompts = JSON.parse(row.lyric_prompt || '{}')
            const descriptionPrompt = prompts.p1 || row.mood
            // Check if we have generated lyrics
            const lyrics = prompts.lyrics
            const finalPrompt = lyrics ? lyrics : descriptionPrompt
            const isCustomMode = !!lyrics

            // Vocal Gender
            const vocalProb = row.vocal_gender_probability !== null ? row.vocal_gender_probability : 50
            const vocalGender = Math.random() * 100 < vocalProb ? 'f' : 'm'

            const taskPayload = {
                prompt: finalPrompt,
                tags: row.style_prompt,
                title: row.song_name_1,
                weirdness: wVal,
                bpm: bpmVal,
                styleInfluence: sVal,
                customMode: isCustomMode, // Use Custom Mode if we have lyrics
                vocalGender: vocalGender,
                instrumental: !!row.is_instrumental
            }

            const task = await kie.generateMusic(taskPayload)
            console.log('[Processor] Suno Task Response:', task)

            if (task && task.taskId) {
                db.prepare("UPDATE generations SET suno_task_id = ? WHERE id = ?").run(task.taskId, id)
                return { status: 'PENDING_MUSIC', msg: 'Music generation started' }
            } else {
                console.error('[Processor] Suno Task Missing ID:', task)
                return { status: 'PENDING_MUSIC', msg: 'Failed to start music (Kie returned no Task ID)' }
            }

        } else {
            // If we have a task ID, we just wait (Poll Pending handles this)
            return { status: 'PENDING_MUSIC', msg: 'Waiting for music...' }
        }
    }

    // --- STEP 4: DOWNLOAD ---
    if (row.status === 'DOWNLOADING') {
        console.log(`[Processor] Downloading with max songs: ${maxSongs}`)

        // 1. Download Song 1
        const res1 = await downloadManager.process({
            url: row.audio_url_1,
            filename: row.song_name_1,
            outputFolder,
            maxSongsPerPlaylist: maxSongs
        })

        if (!res1.success) throw new Error(`Failed to download song 1: ${res1.error}`)

        // 2. Download Song 2
        const avoid = res1.folderUsed ? [res1.folderUsed] : []

        const res2 = await downloadManager.process({
            url: row.audio_url_2,
            filename: row.song_name_2 || (row.song_name_1 + ' v2'),
            outputFolder,
            maxSongsPerPlaylist: maxSongs,
            avoidFolders: avoid
        })

        if (!res2.success) throw new Error(`Failed to download song 2: ${res2.error}`)

        db.prepare(`
              UPDATE generations 
              SET local_path_1 = ?, local_path_2 = ?, status = 'COMPLETED' 
              WHERE id = ?
            `).run(res1.path, res2.path, id)

        return { status: 'COMPLETED', msg: 'Files downloaded' }
    }

    return { status: row.status, msg: 'No action taken' }
}
