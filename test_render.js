// Test renderMembershipPage behavior with jsdom
const fs = require('fs');
const { JSDOM } = require('jsdom');

// Load HTML
const html = fs.readFileSync('/mnt/d/ShiZhe/ListenBook/index.html', 'utf-8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://listenbook.local:8000/'
});

const { window } = dom;
const { document } = window;

// Check if membershipView exists
const membershipView = document.getElementById('membershipView');
console.log('membershipView exists:', !!membershipView);

const membershipCurrent = document.getElementById('membershipCurrent');
console.log('membershipCurrent exists:', !!membershipCurrent);

const pricingGrid = document.getElementById('pricingGrid');
console.log('pricingGrid exists:', !!pricingGrid);

// Check if views object would have membershipView
if (membershipView) {
  console.log('Before activation, display:', window.getComputedStyle ? 'n/a' : 'n/a');
  membershipView.classList.add('active');
  console.log('After activation, classList:', membershipView.className);
}
