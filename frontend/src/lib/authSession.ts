import { api } from "./api/client";
import { clearGetMeCache } from "./api/profile";
import { clearControlExamSession } from "./controlExamSession";
import { setActiveEduStudentId } from "./eduContext";

let logoutInFlight: Promise<void> | null = null;

/** End the cookie session, discard local identity state, then start a clean app load. */
export function logoutAndReload(destination = "/"): Promise<void> {
  if (logoutInFlight) return logoutInFlight;
  logoutInFlight = finishLogoutAndReload(destination);
  return logoutInFlight;
}

async function finishLogoutAndReload(destination: string): Promise<void> {
  clearControlExamSession();
  setActiveEduStudentId(null);
  clearGetMeCache({ clearSnapshot: true });

  try {
    await api.post("/auth/logout", undefined, {
      headers: { "X-Skip-Auth-Redirect": "1" },
    });
  } catch {
    // The server logout is best effort; local identity state is still cleared.
  } finally {
    // A profile request started before logout may have finished while the
    // server request was in flight. Invalidate it before the fresh app load.
    clearGetMeCache({ clearSnapshot: true });
    if (typeof window !== "undefined") window.location.replace(destination);
  }
}
