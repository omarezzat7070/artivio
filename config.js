// config.js - API Configuration
(function() {
  // Your Railway backend URL
  const BACKEND_URL = 'https://artivio-production.up.railway.app';
  
  // Local development URL
  const LOCAL_URL = 'http://localhost:7070';
  
  // Detect if running on GitHub Pages
  const isGitHubPages = window.location.hostname.includes('github.io');
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1';
  
  // Set API base URL based on environment
  if (isGitHubPages) {
    window.API_BASE = BACKEND_URL;
  } else if (isLocal) {
    window.API_BASE = LOCAL_URL;
  } else {
    window.API_BASE = BACKEND_URL;
  }
  
  console.log('🌐 Hostname:', window.location.hostname);
  console.log('🌐 Environment:', isGitHubPages ? 'GitHub Pages' : (isLocal ? 'Local' : 'Production'));
  console.log('🔗 API Base URL:', window.API_BASE);
})();