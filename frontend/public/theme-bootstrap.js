(function () {
  try {
    var saved = localStorage.getItem("studycod_theme");
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (_) {
    // Theme bootstrapping must never prevent the application from loading.
  }
})();
