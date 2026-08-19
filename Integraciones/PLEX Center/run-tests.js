const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

async function fetchCollections(apiKey) {
    try {
        const response = await axios.get('https://api.getpostman.com/collections', {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data.collections;
    } catch (e) {
        console.error("Error fetching collections:", e.response?.data || e.message);
        throw e;
    }
}

async function fetchCollectionDetail(apiKey, collectionUid) {
    try {
        const response = await axios.get(`https://api.getpostman.com/collections/${collectionUid}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        return response.data.collection;
    } catch (e) {
        console.error(`Error fetching collection detail for ${collectionUid}:`, e.response?.data || e.message);
        throw e;
    }
}

async function main() {
    const apiKey = getApiKey();
    if (!apiKey) {
        process.exit(1);
    }
    const config = loadConfig();
    console.log("Fetching collections from Postman API...");
    try {
        const collections = await fetchCollections(apiKey);
        console.log(`Found ${collections.length} collections:`);
        collections.forEach(c => {
            console.log(`- ${c.name} (UID: ${c.uid})`);
        });

        if (collections.length > 0) {
            const first = collections[0];
            console.log(`Dry-run downloading collection: ${first.name}`);
            const detail = await fetchCollectionDetail(apiKey, first.uid);
            console.log(`Downloaded detail for collection: ${detail.info.name}`);
        }
    } catch (err) {
        console.error("Execution failed:", err.message);
        process.exit(1);
    }
}

main();
