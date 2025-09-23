//6
"use strict";
(() => {
  // main.ts
  function test() {
    return "Hello OKLCH";
  }
  if (typeof window !== "undefined") {
    window.OKLCH = {
      test
    };
  }
})();
