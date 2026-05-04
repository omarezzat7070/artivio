// navbar.js - Unified navigation bar functionality for all pages
(function() {
  // Helper to safely get from localStorage
  function safeLocalStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn("Local storage access blocked:", err);
      return null;
    }
  }

  function getStoredUser() {
    const userString = safeLocalStorageGet("user");
    if (!userString) return null;
    try {
      return JSON.parse(userString);
    } catch (err) {
      return null;
    }
  }

  function getStoredToken() {
    return safeLocalStorageGet('token');
  }

  function updateLoginLink() {
    const loginLink = document.getElementById('loginLink');
    if (!loginLink) return;

    const user = getStoredUser();
    const token = getStoredToken();
    
    if (user && user.name && token) {
      loginLink.innerHTML = `<i data-lucide="user" class="icon-sm"></i> ${user.name} <i data-lucide="chevron-down" class="icon-xs"></i>`;
      loginLink.href = '#';
      loginLink.style.cursor = 'pointer';
      loginLink.classList.add('profile-dropdown-trigger');
      
      const existingDropdown = document.getElementById('profileDropdown');
      if (existingDropdown) existingDropdown.remove();
      
      const dropdown = document.createElement('div');
      dropdown.id = 'profileDropdown';
      dropdown.className = 'profile-dropdown';
      dropdown.innerHTML = `
        <a href="profile.html"><i data-lucide="user" class="icon-xs"></i> My Profile</a>
        <a href="my-purchases.html"><i data-lucide="shopping-bag" class="icon-xs"></i> My Purchases</a>
        <hr>
        <a href="#" id="logoutBtnNav"><i data-lucide="log-out" class="icon-xs"></i> Logout</a>
      `;
      
      const navLinks = document.getElementById('navLinks');
      const loginLi = loginLink.parentElement;
      if (loginLi && !document.getElementById('profileDropdown')) {
        loginLi.style.position = 'relative';
        loginLi.appendChild(dropdown);
        
        loginLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', function(e) {
          if (!loginLi.contains(e.target)) {
            dropdown.classList.remove('show');
          }
        });
        
        document.getElementById('logoutBtnNav')?.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('cart');
          localStorage.removeItem('justPurchased');
          localStorage.removeItem('chatSessionId');
          // Redirect to home page (index.html or home.html)
          window.location.href = 'index.html';
        });
      }
    } else {
      loginLink.innerHTML = `<i data-lucide="user" class="icon-sm"></i> Login`;
      loginLink.href = 'login.html';
      loginLink.style.cursor = 'pointer';
      loginLink.classList.remove('profile-dropdown-trigger');
      
      const dropdown = document.getElementById('profileDropdown');
      if (dropdown) dropdown.remove();
    }
  }

  function initMobileMenu() {
    const menuIcon = document.getElementById('menuIcon');
    const navLinks = document.getElementById('navLinks');
    if (menuIcon && navLinks) {
      const newMenuIcon = menuIcon.cloneNode(true);
      menuIcon.parentNode.replaceChild(newMenuIcon, menuIcon);
      
      newMenuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const links = document.getElementById('navLinks');
        if (links) links.classList.toggle('active');
      });
      
      document.addEventListener('click', (event) => {
        const links = document.getElementById('navLinks');
        const menu = document.getElementById('menuIcon');
        if (links && links.classList.contains('active') &&
            !links.contains(event.target) &&
            !menu?.contains(event.target)) {
          links.classList.remove('active');
        }
      });
    }
  }

  function initLucideIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    initLucideIcons();
    initMobileMenu();
    updateLoginLink();
  });

  // Listen for storage changes
  window.addEventListener('storage', function(event) {
    if (event.key === 'token' || event.key === 'user') {
      updateLoginLink();
    }
  });
})();