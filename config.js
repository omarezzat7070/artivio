// config.js - API Configuration
(function() {
  // YOUR BACKEND URL - CHANGE THIS to your deployed backend URL
  // If using Railway: https://artivo.up.railway.app
  // If using Cyclic: https://artivo.cyclic.app
  // If using Render: https://artivo.onrender.com
  const BACKEND_URL = 'https://YOUR_BACKEND_URL_HERE'; // Replace with your actual backend URL
  
  // Local development URL
  const LOCAL_URL = 'http://localhost:7070';
  
  // Detect if running locally
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1';
  
  // Set the global API base URL
  window.API_BASE = isLocal ? LOCAL_URL : BACKEND_URL;

  if (!isLocal && BACKEND_URL.includes('YOUR_BACKEND_URL_HERE')) {
    console.warn('config.js WARNING: BACKEND_URL is still the placeholder. Replace it with your deployed backend URL.');
  }
  
  console.log('🌐 Environment:', isLocal ? 'Local' : 'Production');
  console.log('🔗 API Base URL:', window.API_BASE);
})();