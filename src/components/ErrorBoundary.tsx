import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Errore imprevisto nell’applicazione.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary:', error, info);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0B0E14] p-6 text-slate-100">
          <div className="w-full max-w-lg rounded-lg border border-rose-500/40 bg-[#121721] p-6 shadow-2xl">
            <h1 className="text-base font-bold text-rose-400">
              Errore di Sistema / Database
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Si è verificato un problema durante l’operazione richiesta. I tuoi dati locali non sono stati eliminati.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded border border-[#1E2634] bg-[#0B0E14] p-3 font-mono text-[11px] text-slate-400">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Ricarica Applicazione
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
