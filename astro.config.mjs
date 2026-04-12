import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://mazethis.com',
  output: 'static',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  vite: {
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    resolve: {
      // Allow .js imports to resolve to .ts/.tsx files
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
      },
    },
  },
});
