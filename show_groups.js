const fs = require('fs');

// Read the chats file
const chatsData = JSON.parse(fs.readFileSync('all_chats.json', 'utf8'));

// Filter only groups
const groups = chatsData.chats.filter(chat => chat.isGroup);

console.log(`\n========================================`);
console.log(`Found ${groups.length} WhatsApp Groups`);
console.log(`========================================\n`);

// Display groups with numbers
groups.forEach((group, index) => {
  console.log(`${index + 1}. ${group.name}`);
  console.log(`   ID: ${group.id}`);
  console.log(`   Unread: ${group.unreadCount}`);
  console.log('');
});

console.log(`\n========================================`);
console.log(`To monitor a group, copy its ID`);
console.log(`========================================\n`);
