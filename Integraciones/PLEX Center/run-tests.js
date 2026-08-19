const fs = require('fs');
const path = require('path');

function getApiKey() {
    try {
        const mcpPath = path.join(__dirname, 'mcp.json');
        if (!fs.existsSync(mcpPath)) {
            console.error("mcp.json not found!");
            return null;
        }
        const mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
        const authHeader = mcpData.mcpServers?.postman?.headers?.Authorization;
        if (!authHeader) {
            console.error("Authorization header not found in mcp.json!");
            return null;
        }
        // Extract API key from header value
        const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        return apiKey;
    } catch (e) {
        console.error("Error reading API key:", e.message);
        return null;
    }
}

function loadConfig() {
    const configPath = path.join(__dirname, 'runner-config.json');
    if (!fs.existsSync(configPath)) {
        return { collectionsFilter: [], environmentFile: null };
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error("Error reading runner-config.json, using defaults:", e.message);
        return { collectionsFilter: [], environmentFile: null };
    }
}

const apiKey = getApiKey();
const config = loadConfig();
if (apiKey) {
    console.log("Successfully loaded API key starting with: " + apiKey.substring(0, 8) + "...");
    console.log("Loaded configuration:", config);
    process.exit(0);
} else {
    console.error("Failed to load API key.");
    process.exit(1);
}
