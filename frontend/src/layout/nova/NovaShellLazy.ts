import React from "react";

// Nova is opt-in; loading it lazily keeps gsap + the Nova shell out of the
// boot bundle for Classic/Momentum users. Render sites must provide Suspense.
export const NovaShellLazy = React.lazy(() =>
  import("./NovaShell").then(m => ({ default: m.NovaShell }))
);
