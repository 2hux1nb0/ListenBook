const fs = require('fs');
const html = fs.readFileSync('D:\\ShiZhe\\ListenBook\\index.html', 'utf-8');
console.log('has membershipView:', html.includes('id="membershipView"'));
console.log('has membershipCurrent:', html.includes('id="membershipCurrent"'));
console.log('has pricingGrid:', html.includes('id="pricingGrid"'));
console.log('has searchInput:', html.includes('id="searchInput"'));
console.log('has showLogin:', html.includes('id="showLogin"'));

// Check for .view.active CSS
console.log('has .view CSS:', html.includes('.view'));
console.log('has active class CSS:', html.includes('.active'));
