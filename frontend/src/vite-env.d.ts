interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_JUDGE_DISABLED_LANGUAGES?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_ENABLE_AUTH_TURNSTILE?: string;
  readonly VITE_ENABLE_CONTEST_WS?: string;
  readonly VITE_ENABLE_CONTEST_SUBMIT_TURNSTILE?: string;
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  readonly VITE_PADDLE_PRO_PRICE_ID?: string;
  readonly VITE_PADDLE_CLASS_PRICE_ID?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const cssUrl: string;
  export default cssUrl;
}
