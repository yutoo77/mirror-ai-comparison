import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Mirror render error', error, info);
  }

  private reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error" role="alert">
        <section className="fatal-error__card">
          <span className="eyebrow">APPLICATION ERROR</span>
          <h1>画面を読み込めませんでした。</h1>
          <p>
            保存データは削除していません。再読み込みを試してください。
            解決しない場合は、下の技術情報を確認してください。
          </p>
          <button className="button button--primary" type="button" onClick={this.reload}>
            再読み込み
          </button>
          <details>
            <summary>技術情報</summary>
            <code>{this.state.error.message}</code>
          </details>
        </section>
      </main>
    );
  }
}
