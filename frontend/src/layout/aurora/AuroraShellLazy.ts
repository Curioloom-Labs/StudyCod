import React from "react";

// Aurora is opt-in; loading it lazily keeps its shell out of the boot bundle
// for Classic/Momentum users. Render sites must provide Suspense.
export const AuroraShellLazy = React.lazy(() =>
  import("./AuroraShell").then(m => ({ default: m.AuroraShell }))
);
