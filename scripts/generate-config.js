const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const CONFIG_PATH = path.join(ROOT_DIR, "js", "config.js");

function parseEnvValue(key, content) {
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const [k, ...rest] = line.split("=");
        if (k?.trim() === key) {
            return rest.join("=").trim();
        }
    }
    return undefined;
}

function ensureEnvFile() {
    if (!fs.existsSync(ENV_PATH)) {
        throw new Error(
            ".env file not found. Create it from .env.example before running this script."
        );
    }
}

function writeConfigFile(value) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const payload = `window.__EMAILJS_PUBLIC_KEY__ = ${JSON.stringify(value)};\n`;
    fs.writeFileSync(CONFIG_PATH, payload, "utf8");
}

function main() {
    ensureEnvFile();
    const envContent = fs.readFileSync(ENV_PATH, "utf8");
    const key = parseEnvValue("EMAILJS_PUBLIC_KEY", envContent);
    if (!key) {
        throw new Error("EMAILJS_PUBLIC_KEY is missing in .env");
    }
    writeConfigFile(key);
    console.log("Generated js/config.js from .env");
}

main();
