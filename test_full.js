const fs = require('fs');
const { JSDOM } = require('jsdom');

// Load HTML
const html = fs.readFileSync('D:\\ShiZhe\\ListenBook\\index.html', 'utf-8');
const appJs = fs.readFileSync('D:\\ShiZhe\\ListenBook\\js\\app.js', 'utf-8');
const apiJs = fs.readFileSync('D:\\ShiZhe\\ListenBook\\js\\api.js', 'utf-8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://listenbook.local:8000/'
});

const { window } = dom;
const { document } = window;

// Mock fetch
window.fetch = async (url, options) => {
  console.log('FETCH:', url);
  if (url.includes('/api/tiers/')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        count: 3,
        results: [
          { id: 1, slug: 'free', name: '免费版', price_monthly: '0.00', price_yearly: '0.00', features: ['basic_player'], badge_color: '#95a5a6' },
          { id: 2, slug: 'pro', name: 'Pro', price_monthly: '39.00', price_yearly: '390.00', features: ['ai_explain', 'shadowing'], badge_color: '#5858f5' },
        ]
      })
    };
  }
  if (url.includes('/api/membership/status/')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        is_active: true,
        tier_detail: { name: 'Pro', slug: 'pro', badge_color: '#5858f5', features: ['ai_explain', 'shadowing'] },
        expires_at: '2026-12-31T00:00:00Z'
      })
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({})
  };
};

// Inject scripts
const apiScript = document.createElement('script');
apiScript.textContent = apiJs;
document.body.appendChild(apiScript);

const appScript = document.createElement('script');
appScript.textContent = appJs;
document.body.appendChild(appScript);

// Wait for async operations
setTimeout(() => {
  console.log('\n=== TEST RESULTS ===');
  
  // Check membershipView
  const mv = document.getElementById('membershipView');
  console.log('membershipView exists:', !!mv);
  
  // Simulate clicking membership
  const membershipItem = document.querySelector('.sidebar-item[data-page="membership"]');
  console.log('membership sidebar item exists:', !!membershipItem);
  
  if (membershipItem) {
    membershipItem.click();
    
    setTimeout(() => {
      console.log('\n=== AFTER CLICK ===');
      console.log('membershipView active:', mv.classList.contains('active'));
      console.log('membershipCurrent innerHTML length:', document.getElementById('membershipCurrent').innerHTML.length);
      console.log('pricingGrid innerHTML length:', document.getElementById('pricingGrid').innerHTML.length);
      console.log('membershipCurrent content:', document.getElementById('membershipCurrent').innerHTML.substring(0, 200));
    }, 1000);
  }
}, 1000);
