import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.resolve(__dirname, '..', 'node_modules', 'pipertts', 'dist', 'native', 'phonemizer.js');

if (fs.existsSync(targetFile)) {
  try {
    let content = fs.readFileSync(targetFile, 'utf8');
    // Ensure comma pause preservation for espeakCliPhonemize
    if (content.includes('.join(" ");') && content.includes('espeak CLI drops punctuation')) {
      content = content.replace(
        'const ipaText = ipa\n                .split("\\n")\n                .map((line) => line.trim())\n                .filter(Boolean)\n                .join(" ");',
        'const ipaText = ipa\n                .split("\\n")\n                .map((line) => line.trim())\n                .filter(Boolean)\n                .join(", ");'
      );
      fs.writeFileSync(targetFile, content, 'utf8');
      console.log('[patch-piper] Successfully patched pipertts phonemizer.js for Vietnamese comma pause preservation.');
    } else {
      console.log('[patch-piper] pipertts phonemizer.js is already patched or up to date.');
    }
  } catch (err) {
    console.warn('[patch-piper] Could not patch pipertts phonemizer.js:', err.message);
  }
} else {
  console.log('[patch-piper] pipertts phonemizer.js not found yet, skipping.');
}
