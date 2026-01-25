
import { downloadManager } from './server/utils/downloader'
import { join } from 'path'

// Mock fetch if needed, or rely on global fetch (Node 18+)
// We will try to download a small image or text file as a test, since we don't have a valid Suno URL handy that won't expire.
// Let's use a placeholder placeholder image/audio.

const TEST_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" // Public domain MP3
const TEST_FOLDER = "C:\\MusicOutput\\Test_Debug"

const run = async () => {
    console.log("Starting Download Manager Test...")
    console.log(`Target: ${TEST_FOLDER}`)

    try {
        const res = await downloadManager.process({
            url: TEST_URL,
            filename: "Debug-Track-Test",
            outputFolder: TEST_FOLDER,
            maxSongsPerPlaylist: 2
        })

        console.log("Result:", res)

        if (res.success) {
            console.log("SUCCESS: File downloaded.")
        } else {
            console.error("FAILURE:", res.error)
        }

    } catch (e) {
        console.error("CRITICAL ERROR:", e)
    }
}

run()
