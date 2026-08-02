import { useEffect, useState } from 'react';
import App from './App.tsx';
import AppV2 from './AppV2.tsx';
import { loadRuntimeConfig, type ClientRuntimeConfig } from './runtime';

const enableV2 = import.meta.env.VITE_EDITOR_V2 === 'true';

export default function RuntimeGate() {
  const [runtimeConfig, setRuntimeConfig] = useState<ClientRuntimeConfig | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadRuntimeConfig()
      .then((config) => {
        if (active) setRuntimeConfig(config);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <section className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-lg font-semibold">光砚暂时无法启动</h1>
          <p className="mt-2 text-sm text-white/70">运行模式未确认，请刷新页面后重试。</p>
        </section>
      </main>
    );
  }

  if (!runtimeConfig) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <p className="text-sm text-white/70">正在准备编辑会话…</p>
      </main>
    );
  }

  return enableV2
    ? <AppV2 runtimeConfig={runtimeConfig} />
    : <App runtimeConfig={runtimeConfig} />;
}
