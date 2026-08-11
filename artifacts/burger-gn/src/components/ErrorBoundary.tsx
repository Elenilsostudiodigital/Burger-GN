import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  isAdminPath: boolean;
}

function isAdminPathname(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** Prevents a single render crash from leaving the app on a permanent black screen. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '', isAdminPath: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    const path = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
    return {
      hasError: true,
      message: error?.message || 'Erro inesperado',
      isAdminPath: isAdminPathname(path),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BurgerGN] UI crash:', error?.message, error, info.componentStack);
    try {
      sessionStorage.setItem('lastUiCrash', JSON.stringify({
        message: error?.message || 'unknown',
        stack: error?.stack || '',
        componentStack: info.componentStack || '',
        path: window.location.pathname || '',
        at: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
  }

  private handleReload = () => {
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    const admin = this.state.isAdminPath || isAdminPathname(window.location.pathname || '/');
    const current = window.location.pathname || '/';
    this.setState({ hasError: false, message: '', isAdminPath: false });
    // Never send an admin session to the customer cardápio/home.
    if (admin) {
      window.location.href = current.startsWith('/admin') ? current : '/admin';
      return;
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const admin = this.state.isAdminPath;
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-white font-black text-xl mb-2">Algo deu errado</p>
          <p className="text-zinc-500 text-sm mb-3 max-w-xs">
            {admin
              ? 'Ocorreu um erro nesta tela. Toque abaixo para permanecer no painel administrativo.'
              : 'A tela foi recuperada. Toque abaixo para continuar o pedido.'}
          </p>
          {this.state.message ? (
            <pre className="text-red-400 text-[11px] text-left max-w-md w-full mb-6 whitespace-pre-wrap break-words bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 font-mono">
              {this.state.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="h-12 px-6 rounded-xl bg-amber-500 text-zinc-950 font-bold uppercase tracking-wider"
          >
            {admin ? 'Voltar ao painel' : 'Voltar ao início'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
