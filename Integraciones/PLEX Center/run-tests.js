const fs = require('fs');
const path = require('path');
const axios = require('axios');
const newman = require('newman');

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
        return { collectionsFilter: [], environmentFile: null, globals: null };
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error("Error reading runner-config.json, using defaults:", e.message);
        return { collectionsFilter: [], environmentFile: null, globals: null };
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

function runCollection(collectionJson, envFilePath, globalsObj) {
    return new Promise((resolve, reject) => {
        const options = {
            collection: collectionJson,
            reporters: ['cli'],
            insecure: true, // Skip SSL certificate verification
        };
        
        if (envFilePath && fs.existsSync(envFilePath)) {
            options.environment = envFilePath;
        }
        
        if (globalsObj && typeof globalsObj === 'object') {
            options.globals = {
                values: Object.keys(globalsObj).map(key => ({
                    key: key,
                    value: globalsObj[key],
                    enabled: true
                }))
            };
        }

        newman.run(options, (err, summary) => {
            if (err) {
                return reject(err);
            }
            resolve(summary);
        });
    });
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
        console.log(`Found ${collections.length} collections.`);

        let filtered = collections;
        if (config.collectionsFilter && config.collectionsFilter.length > 0) {
            filtered = collections.filter(c => 
                config.collectionsFilter.includes(c.name) || config.collectionsFilter.includes(c.id) || config.collectionsFilter.includes(c.uid)
            );
            console.log(`Filtered to ${filtered.length} collections based on config filter.`);
        }

        const results = [];
        for (const col of filtered) {
            console.log(`\n=========================================`);
            console.log(`Running collection: ${col.name} (${col.uid})`);
            console.log(`=========================================`);
            
            const detail = await fetchCollectionDetail(apiKey, col.uid);
            
            try {
                const summary = await runCollection(detail, config.environmentFile, config.globals);
                const stats = summary.run.stats;
                results.push({
                    name: col.name,
                    uid: col.uid,
                    status: 'success',
                    assertions: {
                        total: stats.assertions.total,
                        failed: stats.assertions.failed
                    },
                    requests: {
                        total: stats.requests.total,
                        failed: stats.requests.failed
                    }
                });
            } catch (runErr) {
                console.error(`Failed to run collection ${col.name}:`, runErr.message);
                results.push({
                    name: col.name,
                    uid: col.uid,
                    status: 'error',
                    error: runErr.message
                });
            }
        }

        console.log(`\n=========================================`);
        console.log(`All Runs Completed. Summary:`);
        console.log(`=========================================`);
        let totalFailedAssertions = 0;
        let totalFailedRequests = 0;
        
        results.forEach(res => {
            if (res.status === 'success') {
                const marker = (res.requests.failed > 0 || res.assertions.failed > 0) ? '[FAIL]' : '[PASS]';
                console.log(`${marker} ${res.name}: ${res.requests.total} reqs (${res.requests.failed} failed), ${res.assertions.total} asserts (${res.assertions.failed} failed)`);
                totalFailedAssertions += res.assertions.failed;
                totalFailedRequests += res.requests.failed;
            } else {
                console.log(`- [FAIL] ${res.name}: Execution Error - ${res.error}`);
                totalFailedRequests++;
            }
        });

        if (totalFailedAssertions > 0 || totalFailedRequests > 0) {
            console.error("\nSome tests or requests failed.");
            process.exit(1);
        } else {
            console.log("\nAll collections executed successfully and all assertions passed.");
            process.exit(0);
        }

    } catch (err) {
        console.error("Execution failed:", err.message);
        process.exit(1);
    }
}

main();
