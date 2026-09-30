import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {excludeCatSourceArtPlugin} from './scripts/exclude-cat-source-art.js';
export default defineConfig({plugins:[react(),excludeCatSourceArtPlugin()],base:'./',server:{port:5188,strictPort:true}});
