/* Display preferences: font and page width.
 * A choice made on this device (Settings › Display) wins; otherwise the app-wide default set by
 * an admin is used (remembered from the last sign-in so it applies before the page is drawn).
 * Loaded in <head> so there is no flash of the wrong font or width. */
(function () {
  var FONT_KEY = 'drp.font', WIDTH_KEY = 'drp.width';
  var FONTS = { 'default': '', courier: 'font-courier' };
  var WIDTHS = { comfortable: '', full: 'page-full' };
  var defaults = { font: 'default', width: 'comfortable' };

  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  // App-wide defaults remembered from the last session (written by app.js).
  try {
    var cfg = JSON.parse(read('drp.cfg') || 'null');
    var s = cfg && cfg.cfg && cfg.cfg.settings;
    if (s && FONTS.hasOwnProperty(s.defaultFont)) defaults.font = s.defaultFont;
    if (s && WIDTHS.hasOwnProperty(s.defaultWidth)) defaults.width = s.defaultWidth;
  } catch (e) {}

  function own(k, map) { var v = read(k); return v && map.hasOwnProperty(v) ? v : null; }
  function getFont() { return own(FONT_KEY, FONTS) || defaults.font; }
  function getWidth() { return own(WIDTH_KEY, WIDTHS) || defaults.width; }
  function swap(map, v) {
    var el = document.documentElement;
    Object.keys(map).forEach(function (k) { if (map[k]) el.classList.remove(map[k]); });
    if (map[v]) el.classList.add(map[v]);
  }
  function apply() { swap(FONTS, getFont()); swap(WIDTHS, getWidth()); }

  window.DrpPrefs = {
    getFont: getFont, getWidth: getWidth,
    /** v = a font key, or 'app' to follow the app-wide default. */
    setFont: function (v) { store(FONT_KEY, v === 'app' || !FONTS.hasOwnProperty(v) ? null : v); apply(); },
    setWidth: function (v) { store(WIDTH_KEY, v === 'app' || !WIDTHS.hasOwnProperty(v) ? null : v); apply(); },
    hasOwnFont: function () { return !!own(FONT_KEY, FONTS); },
    hasOwnWidth: function () { return !!own(WIDTH_KEY, WIDTHS); },
    /** Called after sign-in with the server's app-wide defaults. */
    setDefaults: function (font, width) {
      if (FONTS.hasOwnProperty(font)) defaults.font = font;
      if (WIDTHS.hasOwnProperty(width)) defaults.width = width;
      apply();
    },
    defaults: function () { return { font: defaults.font, width: defaults.width }; }
  };
  apply();
})();
