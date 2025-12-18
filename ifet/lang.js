// Language detection and translation system
const SUPPORTED_LOCALES = ['ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'pt', 'ru', 'zh'];
const DEFAULT_LOCALE = 'en';

// Get language from URL parameter or default to English
function detectLanguage() {
  try {
    // Primary: URLSearchParams (works for http(s) and most file:// URLs)
    const urlParams = new URLSearchParams(window.location.search || '');
    const raw = (urlParams.get('lang') || '').trim();
    const normalized = raw.toLowerCase().split('-')[0]; // handles "ru-RU"
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;

    // Fallback: parse from full href (helps in edge cases where location.search is empty)
    const href = String(window.location.href || '');
    const m = href.match(/[?&]lang=([^&#]+)/i);
    if (m && m[1]) {
      const fromHref = decodeURIComponent(m[1]).trim().toLowerCase().split('-')[0];
      if (SUPPORTED_LOCALES.includes(fromHref)) return fromHref;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_LOCALE;
}

// Current language
const currentLang = detectLanguage();

// Translations object - will be populated per page
let translations = {};

// Initialize translations for the page
function initTranslations(pageTranslations) {
  translations = pageTranslations;
  translatePage();
}

// Translate all elements with data-i18n attribute
function translatePage() {
  const lang = currentLang;
  
  // For languages without translations (not en or ru), show empty page
  if (!translations[lang] && lang !== 'en' && lang !== 'ru') {
    document.body.innerHTML = `
      <div class="container">
        <div class="panel">
          <h1 class="page-title">Coming Soon</h1>
          <p class="page-subtitle">This page is not yet available in your language.</p>
        </div>
      </div>
    `;
    return;
  }
  
  // Translate all elements
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const text = translations[lang]?.[key] || translations['en']?.[key] || key;
    
    // Handle different element types
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      if (element.hasAttribute('placeholder')) {
        element.placeholder = text;
      } else {
        element.value = text;
      }
    } else if (element.hasAttribute('data-i18n-link')) {
      // For links inside text, just update the link text
      const linkKey = element.getAttribute('data-i18n-link');
      const linkText = translations[lang]?.[linkKey] || translations['en']?.[linkKey] || linkKey;
      element.textContent = linkText;
    } else {
      // For regular elements, preserve HTML structure if it exists
      // But if it's just text, use textContent
      if (element.children.length === 0) {
        element.textContent = text;
      } else {
        // If element has children, only update if it's a simple text node
        const firstChild = element.firstChild;
        if (firstChild && firstChild.nodeType === Node.TEXT_NODE && element.children.length === 0) {
          element.textContent = text;
        }
        // Otherwise, don't overwrite HTML content (like links in footer)
      }
    }
  });
  
  // Set HTML lang attribute
  document.documentElement.lang = lang;
}

// Export for use in pages
window.IFET = {
  currentLang,
  initTranslations,
  translatePage,
  isLanguageSupported: currentLang === 'en' || currentLang === 'ru'
};

