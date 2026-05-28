import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error; stack?: string }> {
  state: { error?: Error; stack?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, info: React.ErrorInfo) {
    this.setState({ stack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
          <div className="font-semibold">前端渲染错误</div>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{this.state.error.message}</pre>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{this.state.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
