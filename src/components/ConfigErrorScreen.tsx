import { AlertTriangle } from 'lucide-react';

export function ConfigErrorScreen({ message }: { message: string }) {
  const requiredVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-800">Configuration required</h1>
            <p className="mt-1 text-sm text-slate-500">
              This project was imported from GitHub, which does not include <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">.env</code> files.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">{message}</p>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required environment variables</p>
          <ul className="mt-2 space-y-1.5">
            {requiredVars.map((v) => (
              <li key={v} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-mono text-sm text-slate-700">{v}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How to fix</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Create a <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">.env</code> file in the project root.</li>
            <li>Add the variables listed above with your Supabase project credentials.</li>
            <li>Restart the dev server.</li>
          </ol>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          A <code className="font-mono">.env.example</code> file has been created in the project root as a template.
        </p>
      </div>
    </div>
  );
}
