import 'react';
import { Lock } from 'lucide-react';

const DemoStatusBadge = ({ user }) => {
  // ONLY rely on the isDemo flag set by the backend (authMiddleware.js)
  // Backend checks exact email against DEMO_EMAILS set: demo.xxx@testpos.local
  // Never check email string here — that caused false positives for real users
  const isDemo = user?.isDemo === true;

  if (!isDemo) return null;

  return (
    <div
      className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full text-[11px] font-black bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 shadow-sm transition-all"
      title="Read-Only Demo Mode: Actions & updates are disabled for demo accounts. Log in with a real account to make changes."
    >
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
      <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
      <span>🔒 READ-ONLY DEMO MODE (Actions Disabled)</span>
    </div>
  );
};

export default DemoStatusBadge;
