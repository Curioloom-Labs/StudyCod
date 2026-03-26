interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_JUDGE_DISABLED_LANGUAGES?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_ENABLE_AUTH_TURNSTILE?: string;
  readonly VITE_ENABLE_CONTEST_WS?: string;
  readonly VITE_ENABLE_CONTEST_SUBMIT_TURNSTILE?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}