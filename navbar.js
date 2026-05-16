// navbar.js - Unified navigation bar functionality for all pages
(function() {
  const translations = {
    en: {
      "nav.home": "Home",
      "nav.products": "Products",
      "nav.courses": "Courses",
      "nav.about": "About",
      "nav.login": "Login",
      "nav.profile": "My Profile",
      "nav.purchases": "My Purchases",
      "nav.dashboard": "Dashboard",
      "nav.orders": "Orders",
      "nav.users": "Users",
      "nav.settings": "Settings",
      "nav.analytics": "Analytics",
      "nav.seller": "Seller",
      "nav.trackOrder": "Track Order",
      "nav.logout": "Logout",
      "settings.appearance": "Appearance",
      "settings.light": "Light",
      "settings.dark": "Dark",
      "settings.language": "Language",
      "hero.title": "Discover Handmade Treasures",
      "hero.subtitle": "Authentic handcrafted products and courses from skilled artisans",
      "hero.shop": "Shop Now",
      "hero.courses": "Explore Courses",
      "why.title": "Why Choose Us",
      "why.card1.title": "Handcrafted with Love",
      "why.card1.text": "Every item is crafted with passion and care.",
      "why.card2.title": "Quality Guaranteed",
      "why.card2.text": "Premium materials and expert craftsmanship.",
      "why.card3.title": "Learn from Masters",
      "why.card3.text": "Courses from skilled artisans.",
      "products.title": "Best Selling Products",
      "products.loading": "Loading best selling products...",
      "products.viewAll": "View All Products",
      "products.unavailable": "Unable to load products. Please try again later.",
      "products.empty": "No products available yet. Check back soon!",
      "products.server": "Unable to load products. Please make sure the server is running.",
      "products.badge": "Best Seller",
      "chat.title": "Artivio Assistant",
      "chat.typing": "Artivio Assistant is typing...",
      "chat.placeholder": "Type your question...",
      "footer.title": "Start Your Crafting Journey Today",
      "footer.text": "Join our community of artisans and discover handmade treasures",
      "footer.signup": "Sign Up Now"
    },
    ar: {
      "nav.home": "الرئيسية",
      "nav.products": "المنتجات",
      "nav.courses": "الكورسات",
      "nav.about": "من نحن",
      "nav.login": "تسجيل الدخول",
      "nav.profile": "ملفي الشخصي",
      "nav.purchases": "مشترياتي",
      "nav.dashboard": "لوحة التحكم",
      "nav.orders": "الطلبات",
      "nav.users": "المستخدمون",
      "nav.settings": "الإعدادات",
      "nav.analytics": "التحليلات",
      "nav.seller": "البائع",
      "nav.trackOrder": "تتبع الطلب",
      "nav.logout": "تسجيل الخروج",
      "settings.appearance": "المظهر",
      "settings.light": "فاتح",
      "settings.dark": "داكن",
      "settings.language": "اللغة",
      "hero.title": "اكتشف كنوزا يدوية الصنع",
      "hero.subtitle": "منتجات وكورسات حرفية أصلية من صناع مهرة",
      "hero.shop": "تسوق الآن",
      "hero.courses": "استكشف الكورسات",
      "why.title": "لماذا تختارنا",
      "why.card1.title": "مصنوع بحب",
      "why.card1.text": "كل قطعة مصنوعة بشغف واهتمام.",
      "why.card2.title": "جودة مضمونة",
      "why.card2.text": "خامات ممتازة وحرفية عالية.",
      "why.card3.title": "تعلم من المحترفين",
      "why.card3.text": "كورسات مقدمة من حرفيين مهرة.",
      "products.title": "المنتجات الأكثر مبيعا",
      "products.loading": "جاري تحميل المنتجات الأكثر مبيعا...",
      "products.viewAll": "عرض كل المنتجات",
      "products.unavailable": "تعذر تحميل المنتجات. حاول مرة أخرى لاحقا.",
      "products.empty": "لا توجد منتجات متاحة حاليا. عد قريبا!",
      "products.server": "تعذر تحميل المنتجات. تأكد من تشغيل السيرفر.",
      "products.badge": "الأكثر مبيعا",
      "chat.title": "مساعد Artivio",
      "chat.typing": "مساعد Artivio يكتب...",
      "chat.placeholder": "اكتب سؤالك...",
      "footer.title": "ابدأ رحلتك الحرفية اليوم",
      "footer.text": "انضم إلى مجتمع الحرفيين واكتشف الكنوز اليدوية",
      "footer.signup": "سجل الآن"
    }
  };

  const navKeyByHref = {
    "index.html": "nav.home",
    "product.html": "nav.products",
    "customercourses.html": "nav.courses",
    "course.html": "nav.courses",
    "about.html": "nav.about",
    "login.html": "nav.login",
    "profile.html": "nav.profile",
    "my-purchases.html": "nav.purchases",
    "admindashboard.html": "nav.dashboard",
    "admin-products.html": "nav.products",
    "admin-courses.html": "nav.courses",
    "admin-orders.html": "nav.orders",
    "admin-users.html": "nav.users",
    "admin-settings.html": "nav.settings",
    "admin-analytics.html": "nav.analytics",
    "seller.html": "nav.seller",
    "track-order.html": "nav.trackOrder"
  };

  function safeLocalStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn("Local storage access blocked:", err);
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn("Local storage write blocked:", err);
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
    return safeLocalStorageGet("token");
  }

  function getLanguage() {
    return safeLocalStorageGet("artivioLanguage") || "en";
  }

  function getTheme() {
    return safeLocalStorageGet("artivioTheme") || "light";
  }

  function t(key) {
    const lang = getLanguage();
    return translations[lang]?.[key] || translations.en[key] || key;
  }

  function getHrefFileName(anchor) {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref || rawHref === "#") return "";
    return rawHref.split("?")[0].split("#")[0].split("/").pop();
  }

  function setAnchorLabel(anchor, key) {
    if (!key) return;
    const text = t(key);
    const labelledSpan = anchor.querySelector("[data-i18n], [data-auto-i18n]");

    if (labelledSpan) {
      labelledSpan.dataset.autoI18n = key;
      labelledSpan.textContent = text;
      return;
    }

    const hasIcon = anchor.querySelector("i, svg, img");
    if (!hasIcon) {
      anchor.dataset.autoI18n = key;
      anchor.textContent = text;
      return;
    }

    Array.from(anchor.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.remove();
      }
    });

    const span = document.createElement("span");
    span.dataset.autoI18n = key;
    span.textContent = text;
    anchor.appendChild(span);
  }

  function translateKnownNavigationLinks() {
    document.querySelectorAll(".nav-links a[href]").forEach((anchor) => {
      if (anchor.id === "loginLink") return;
      setAnchorLabel(anchor, navKeyByHref[getHrefFileName(anchor)]);
    });
  }

  function applyLanguage(lang) {
    const currentLang = translations[lang] ? lang : "en";
    safeLocalStorageSet("artivioLanguage", currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    if (document.body) document.body.dir = currentLang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });

    translateKnownNavigationLinks();
    updateSettingsControls();
    window.dispatchEvent(new CustomEvent("artivio:languagechange", { detail: { language: currentLang } }));
  }

  function applyTheme(theme) {
    const currentTheme = theme === "dark" ? "dark" : "light";
    safeLocalStorageSet("artivioTheme", currentTheme);
    document.documentElement.dataset.theme = currentTheme;
    if (document.body) document.body.classList.toggle("dark-mode", currentTheme === "dark");
    updateSettingsControls();
    window.dispatchEvent(new CustomEvent("artivio:themechange", { detail: { theme: currentTheme } }));
  }

  function updateSettingsControls() {
    const lang = getLanguage();
    const theme = getTheme();

    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeOption === theme);
    });

    document.querySelectorAll("[data-language-option]").forEach((button) => {
      button.classList.toggle("active", button.dataset.languageOption === lang);
    });

    document.querySelectorAll("[data-settings-label]").forEach((element) => {
      element.textContent = t(element.dataset.settingsLabel);
    });
  }

  function bindPreferenceControls(root = document) {
    root.querySelectorAll("[data-theme-option]").forEach((button) => {
      if (button.dataset.boundPreference === "true") return;
      button.dataset.boundPreference = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        applyTheme(button.dataset.themeOption);
      });
    });

    root.querySelectorAll("[data-language-option]").forEach((button) => {
      if (button.dataset.boundPreference === "true") return;
      button.dataset.boundPreference = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        applyLanguage(button.dataset.languageOption);
        updateLoginLink();
      });
    });
  }

  function buildSettingsDropdown(id) {
    const dropdown = document.createElement("div");
    dropdown.id = id;
    dropdown.className = "profile-dropdown brand-settings-dropdown";
    dropdown.innerHTML = `
      <div class="nav-settings">
        <span class="nav-settings-title" data-settings-label="settings.appearance">${t("settings.appearance")}</span>
        <div class="nav-toggle-group">
          <button type="button" data-theme-option="light" data-i18n="settings.light">${t("settings.light")}</button>
          <button type="button" data-theme-option="dark" data-i18n="settings.dark">${t("settings.dark")}</button>
        </div>
        <span class="nav-settings-title" data-settings-label="settings.language">${t("settings.language")}</span>
        <div class="nav-toggle-group">
          <button type="button" data-language-option="en">EN</button>
          <button type="button" data-language-option="ar">AR</button>
        </div>
      </div>
    `;
    return dropdown;
  }

  window.ArtivioI18n = { t, applyLanguage, applyTheme };

  function updateLoginLink() {
    const loginLink = document.getElementById("loginLink");
    if (!loginLink) return;

    const user = getStoredUser();
    const token = getStoredToken();

    if (user && user.name && token) {
      loginLink.innerHTML = `<i data-lucide="user" class="icon-sm"></i> ${user.name} <i data-lucide="chevron-down" class="icon-xs"></i>`;
      loginLink.href = "#";
      loginLink.style.cursor = "pointer";
      loginLink.classList.add("profile-dropdown-trigger");

      const existingDropdown = document.getElementById("profileDropdown");
      if (existingDropdown) existingDropdown.remove();

      const dropdown = document.createElement("div");
      dropdown.id = "profileDropdown";
      dropdown.className = "profile-dropdown";
      dropdown.innerHTML = `
        <a href="profile.html"><i data-lucide="user" class="icon-xs"></i> <span data-i18n="nav.profile">${t("nav.profile")}</span></a>
        <a href="my-purchases.html"><i data-lucide="shopping-bag" class="icon-xs"></i> <span data-i18n="nav.purchases">${t("nav.purchases")}</span></a>
        <hr>
        ${buildSettingsDropdown("profileSettingsDropdown").innerHTML}
        <hr>
        <a href="#" id="logoutBtnNav"><i data-lucide="log-out" class="icon-xs"></i> <span data-i18n="nav.logout">${t("nav.logout")}</span></a>
      `;

      const loginLi = loginLink.parentElement;
      if (loginLi && !document.getElementById("profileDropdown")) {
        loginLi.style.position = "relative";
        loginLi.appendChild(dropdown);
        bindPreferenceControls(dropdown);
        updateSettingsControls();

        loginLink.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.toggle("show");
        });

        document.addEventListener("click", function(e) {
          if (!loginLi.contains(e.target)) {
            dropdown.classList.remove("show");
          }
        });

        document.getElementById("logoutBtnNav")?.addEventListener("click", (e) => {
          e.preventDefault();
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("cart");
          localStorage.removeItem("justPurchased");
          localStorage.removeItem("chatSessionId");
          window.location.href = "index.html";
        });
      }
    } else {
      loginLink.innerHTML = `<i data-lucide="user" class="icon-sm"></i> <span data-i18n="nav.login">${t("nav.login")}</span>`;
      loginLink.href = "login.html";
      loginLink.style.cursor = "pointer";
      loginLink.classList.remove("profile-dropdown-trigger");

      const dropdown = document.getElementById("profileDropdown");
      if (dropdown) dropdown.remove();
    }

    initLucideIcons();
  }

  function initMobileMenu() {
    const menuIcon = document.getElementById("menuIcon");
    const navLinks = document.getElementById("navLinks");
    if (menuIcon && navLinks) {
      const newMenuIcon = menuIcon.cloneNode(true);
      menuIcon.parentNode.replaceChild(newMenuIcon, menuIcon);

      newMenuIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        const links = document.getElementById("navLinks");
        if (links) links.classList.toggle("active");
      });

      document.addEventListener("click", (event) => {
        const links = document.getElementById("navLinks");
        const menu = document.getElementById("menuIcon");
        if (links && links.classList.contains("active") &&
            !links.contains(event.target) &&
            !menu?.contains(event.target)) {
          links.classList.remove("active");
        }
      });
    }
  }

  function initBrandSettingsMenu() {
    const logo = document.querySelector(".nav-logo");
    let trigger = document.getElementById("brandSettingsToggle");
    let dropdown = document.getElementById("brandSettingsDropdown");

    if (!trigger && logo) {
      const brandText = logo.querySelector(".artivio");
      trigger = document.createElement("button");
      trigger.id = "brandSettingsToggle";
      trigger.type = "button";
      trigger.className = "artivio brand-settings-toggle";
      trigger.setAttribute("aria-expanded", "false");
      trigger.textContent = brandText?.textContent?.trim() || "Artivio";

      if (brandText) {
        brandText.replaceWith(trigger);
      } else {
        logo.appendChild(trigger);
      }
    }

    if (!dropdown && logo) {
      dropdown = buildSettingsDropdown("brandSettingsDropdown");
      logo.appendChild(dropdown);
    }

    if (!trigger || !dropdown || trigger.dataset.boundSettings === "true") return;
    trigger.dataset.boundSettings = "true";
    bindPreferenceControls(dropdown);

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.classList.toggle("show");
      trigger.setAttribute("aria-expanded", dropdown.classList.contains("show") ? "true" : "false");
    });

    document.addEventListener("click", (event) => {
      if (!dropdown.contains(event.target) && !trigger.contains(event.target)) {
        dropdown.classList.remove("show");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initLucideIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", function() {
    applyTheme(getTheme());
    applyLanguage(getLanguage());
    initLucideIcons();
    initMobileMenu();
    initBrandSettingsMenu();
    updateLoginLink();
    bindPreferenceControls();
    translateKnownNavigationLinks();
  });

  window.addEventListener("storage", function(event) {
    if (event.key === "token" || event.key === "user") {
      updateLoginLink();
    }
    if (event.key === "artivioTheme") {
      applyTheme(getTheme());
    }
    if (event.key === "artivioLanguage") {
      applyLanguage(getLanguage());
    }
  });
})();
