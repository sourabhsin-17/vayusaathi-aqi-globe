import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="mx-auto my-8 max-w-xl rounded-2xl border border-rose-400/35 bg-[#0F0D22] p-6 text-[#E6EDF7]"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-[#E6EDF7]">
                Something went wrong rendering this view
              </h2>
              <p className="text-sm text-[#A7A3C7]">{this.state.message}</p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#67E8F9] px-4 py-2 text-sm font-bold text-[#0B0A16] hover:bg-[#A5F3FC]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
