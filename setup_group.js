const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

/**
 * Interactive script to help set up a new group for monitoring
 * Usage: node setup_group.js
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function updateEnvFile(groupId) {
    const envPath = path.join(__dirname, '.env');

    try {
        // Read existing .env file
        let envContent = await fs.readFile(envPath, 'utf8');

        // Check if MONITORED_GROUPS exists
        const monitoredGroupsRegex = /MONITORED_GROUPS=(.+)/;
        const match = envContent.match(monitoredGroupsRegex);

        if (match) {
            // Get existing groups
            const existingGroups = match[1].split(',').map(g => g.trim()).filter(g => g);

            // Check if group already exists
            if (existingGroups.includes(groupId)) {
                console.log(`\n⚠️  Group ID ${groupId} is already in MONITORED_GROUPS`);
                return false;
            }

            // Add new group
            existingGroups.push(groupId);
            const newValue = existingGroups.join(',');
            envContent = envContent.replace(monitoredGroupsRegex, `MONITORED_GROUPS=${newValue}`);
        } else {
            // MONITORED_GROUPS doesn't exist, add it
            envContent += `\nMONITORED_GROUPS=${groupId}\n`;
        }

        // Write back to file
        await fs.writeFile(envPath, envContent, 'utf8');
        console.log(`\n✓ Successfully added group ID to .env file`);
        return true;

    } catch (error) {
        console.error(`\n✗ Error updating .env file:`, error.message);
        return false;
    }
}

async function main() {
    console.log('\n========================================');
    console.log('WhatsApp Group Setup Helper');
    console.log('========================================\n');

    console.log('This script will help you set up a new WhatsApp group for monitoring.\n');

    console.log('Step 1: Get the Group ID');
    console.log('----------------------------------------');
    console.log('Make sure your WhatsApp client is running (pnpm start)');
    console.log('Then open this URL in your browser or use curl:\n');
    console.log('  http://localhost:3000/api/chats\n');
    console.log('Find your group (e.g., "Wealth Builders") and copy its ID');
    console.log('The ID will look like: 1234567890-1234567890@g.us\n');

    const groupId = await question('Enter the Group ID: ');

    if (!groupId || !groupId.includes('@g.us')) {
        console.log('\n✗ Invalid group ID. It should end with @g.us');
        rl.close();
        return;
    }

    console.log(`\nGroup ID: ${groupId}`);

    const confirm = await question('\nDo you want to add this to MONITORED_GROUPS in .env? (y/n): ');

    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        const success = await updateEnvFile(groupId);

        if (success) {
            console.log('\n========================================');
            console.log('Setup Complete!');
            console.log('========================================\n');
            console.log('⚠️  IMPORTANT: You need to restart your application for changes to take effect:');
            console.log('   1. Stop the current process (Ctrl+C)');
            console.log('   2. Run: pnpm start\n');
            console.log('The group will now be scraped automatically based on your cron schedule.');
            console.log('\nYou can also manually trigger a scrape:');
            console.log(`   curl -X POST http://localhost:3000/api/scrape/${groupId}\n`);
        }
    } else {
        console.log('\n✗ Setup cancelled');
    }

    rl.close();
}

main().catch(error => {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
});
