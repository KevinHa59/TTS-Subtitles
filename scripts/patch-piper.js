import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetFile = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "pipertts",
  "dist",
  "native",
  "phonemizer.js",
);

if (!fs.existsSync(targetFile)) {
  throw new Error(`[patch-piper] Required pipertts file not found: ${targetFile}`);
}

const original = fs.readFileSync(targetFile, "utf8");
let content = original;

const importPattern = /import \{ (?:execFile|spawn) \} from "node:child_process";/;
if (!importPattern.test(content)) {
  throw new Error("[patch-piper] Unsupported pipertts phonemizer import.");
}
content = content.replace(
  importPattern,
  'import { spawn } from "node:child_process";',
);

const runnerPattern =
  /function runEspeakIpa\([\s\S]*?(?=\r?\n\/\*\*\r?\n \* POC espeak phonemizer)/;
const patchedRunner = `function runEspeakIpa(voice, text, espeakBinary = "espeak-ng", timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(espeakBinary, ["-b", "1", "-v", voice, "--ipa", "-q", "--stdin"], { windowsHide: true });
        const stdout = [];
        const stderr = [];
        let outputBytes = 0;
        let settled = false;
        const finish = (callback, value) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            callback(value);
        };
        const timer = setTimeout(() => {
            child.kill();
            finish(reject, new Error(\`PiperNative: espeak-ng timed out for voice "\${voice}" after \${timeoutMs}ms.\`));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            outputBytes += chunk.length;
            if (outputBytes > 4 * 1024 * 1024) {
                child.kill();
                finish(reject, new Error("PiperNative: espeak-ng output exceeded 4 MiB."));
                return;
            }
            stdout.push(chunk);
        });
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", (error) => finish(reject, error));
        child.on("close", (code) => {
            if (code !== 0) {
                const errorText = Buffer.concat(stderr).toString("utf8").trim();
                finish(reject, new Error(\`PiperNative: espeak-ng failed for voice "\${voice}": \${errorText || \`exit code \${code}\`}\`));
                return;
            }
            const output = Buffer.concat(stdout).toString("utf8");
            finish(resolve, text.includes(String.fromCharCode(0xe000)) ? output.replace(/ɹ (?=ˈ)/g, "ɹ") : output);
        });
        child.stdin.on("error", (error) => finish(reject, error));
        child.stdin.end(text.replace(/\\uE000/g, "[[r]]"), "utf8");
    });
}`;
const cliCallPattern =
  /runEspeakIpa\(espeakVoice, body, options\?\.espeakBinary \?\? "espeak-ng", options\?\.timeoutMs \?\? 15_000\)/;
if (runnerPattern.test(content)) {
  content = content.replace(runnerPattern, patchedRunner);
} else if (!content.includes('["-b", "1", "-v", voice, "--ipa", "-q", "--stdin"]')) {
  throw new Error("[patch-piper] Unsupported pipertts espeak CLI implementation.");
}

if (cliCallPattern.test(content)) {
  content = content.replace(
    cliCallPattern,
    'runEspeakIpa(espeakVoice, `${body}.`, options?.espeakBinary ?? "espeak-ng", options?.timeoutMs ?? 15_000)',
  );
} else if (!content.includes('runEspeakIpa(espeakVoice, `${body}.`,')) {
  throw new Error("[patch-piper] Could not preserve sentence-final context for espeak.");
}

const oldJoin = '.join(" ");';
if (content.includes(oldJoin) && content.includes("espeak CLI drops punctuation")) {
  content = content.replace(oldJoin, '.join(", ");');
}

if (content === original) {
  console.log("[patch-piper] pipertts phonemizer is already patched.");
} else {
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("[patch-piper] Patched pipertts to send UTF-8 text to espeak-ng via stdin.");
}
