// .gemini/skills/resource-discovery-tools/scripts/expose-tools.cjs

// Load environment variables if not in a production environment
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '../../../../.env' });
}

const pg = require('pg');
const { Pool } = pg;

// Create a database connection pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Ensure database connection is closed when the process exits
process.on('beforeExit', async () => {
    console.log('Closing database connection pool...');
    await db.end();
    console.log('Database connection pool closed.');
});

// Import tool declarations from the project's lib folder
const {
    fetchPageTool,
    checkExistingTool,
    addResourceTool,
    checkSocialTool,
    checkReferencesTool,
    queueItemsTool,
    getQueueTool
} = require('../../../../dist/lib/tool-declarations.js');

// Import tool implementations from the project's lib folder
const {
    checkExisting,
    addResource,
    queueItems,
    getQueue
} = require('../../../../dist/lib/agent-tools.js');

const { fetchPage } = require('../../../../dist/lib/fetch-page.js');

// Placeholder implementations for checkSocial and checkReferences.
// These are declared in tool-declarations.ts but not directly implemented in agent-tools.ts.
// They might require external services or different implementation paths.
const checkSocial = async (args) => {
    console.log(`Placeholder: checkSocial called with args: ${JSON.stringify(args)}`);
    return { sentiment: 'neutral', recency: 'unknown', trend: 'unknown', note: 'Placeholder implementation' };
};

const checkReferences = async (args) => {
    console.log(`Placeholder: checkReferences called with args: ${JSON.stringify(args)}`);
    return { references: [], note: 'Placeholder implementation' };
};

// This array exports the tools, combining their declarations with their executable functions.
// Note on database context: The functions checkExisting, addResource, queueItems, and getQueue
// expect a 'db' (pg.Pool | pg.Client) as their first argument. It is assumed that the
// Gemini CLI skill system will provide this context or wrap these functions accordingly.
// If not, these functions will fail at runtime.
module.exports = [
    {
        ...fetchPageTool,
        function: async (...args) => fetchPage(db, ...args),
    },
    {
        ...checkExistingTool,
        function: async (...args) => checkExisting(db, ...args),
    },
    {
        ...addResourceTool,
        function: async (...args) => addResource(db, ...args),
    },
    {
        ...checkSocialTool, // No db context needed for placeholder
        function: checkSocial,
    },
    {
        ...checkReferencesTool, // No db context needed for placeholder
        function: checkReferences,
    },
    {
        ...queueItemsTool,
        function: async (...args) => queueItems(db, ...args),
    },
    {
        ...getQueueTool,
        function: async (...args) => getQueue(db, ...args),
    },
];