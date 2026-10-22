import React from 'react';
import './AppErrorBoundary.css';

class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const redactOtp = (value) => String(value || '').replace(/\b\d{6}\b/g, '[redacted]');
    console.error('Application render error:', {
      message: redactOtp(error?.message || error),
      stack: redactOtp(error?.stack),
      componentStack: redactOtp(errorInfo?.componentStack),
    });
  }

  recoverWithoutPendingLogin = () => {
    try { window.sessionStorage.removeItem('zovik_pending_login'); } catch { /* Storage can be unavailable. */ }
    try { window.localStorage.removeItem('zovik_pending_login'); } catch { /* Storage can be unavailable. */ }
    // Replacing the current URL with its pathname removes OTP/email query params and reloads the app.
    window.location.replace(window.location.pathname);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error-fallback" role="alert">
        <div className="app-error-fallback__content">
          <img className="app-error-fallback__mark" src="/assets/zovikpos-mark.svg" alt="" aria-hidden="true" />
          <strong className="app-error-fallback__brand">ZOVIKPOS</strong>
          <h1>Something went wrong</h1>
          <p>The app hit an unexpected problem. Reload to continue.</p>
          <button type="button" onClick={this.recoverWithoutPendingLogin}>
            Reload
          </button>
          <button type="button" className="app-error-fallback__link" onClick={this.recoverWithoutPendingLogin}>
            Start fresh
          </button>
        </div>
      </main>
    );
  }
}

export default AppErrorBoundary;
