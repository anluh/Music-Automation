// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: [
    '@pinia/nuxt',
  ],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    optimizeDeps: {
      exclude: ['better-sqlite3']
    }
  },
  components: [
    {
      path: '~/components',
      pathPrefix: false, // simpler names
      ignore: ['**/*.ts'], // ignore index.ts re-exports, let nuxt find .vue files directly
    },
  ],
  nitro: {
    esbuild: {
      options: {
        target: 'esnext'
      }
    }
  }
})
