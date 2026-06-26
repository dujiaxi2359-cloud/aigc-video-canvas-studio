interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_DIRECTOR_3D?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
