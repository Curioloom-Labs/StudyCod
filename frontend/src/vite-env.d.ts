interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_JUDGE_DISABLED_LANGUAGES?: string;
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}