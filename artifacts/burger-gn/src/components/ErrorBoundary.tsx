import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/** Prevents a single render crash from leaving the app on a permanent black screen. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Erro inesperado' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BurgerGN] UI crash:', error, info.componentStack);
  }

  private handleReload = () => {
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    this.setState({ hasError: false, message: '' });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-white font-black text-xl mb-2">Algo deu errado</p>
          <p className="text-zinc-500 text-sm mb-6 max-w-xs">
            A tela foi recuperada. Toque abaixo para continuar o pedido.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="h-12 px-6 rounded-xl bg-amber-500 text-zinc-950 font-bold uppercase tracking-wider"
          >
            Voltar ao início
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
