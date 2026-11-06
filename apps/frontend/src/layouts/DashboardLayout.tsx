import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Mail, Send, PenSquare, Settings, LogOut, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function DashboardLayout() {
  const { user, signOut } = useAuth();

  const navItems = [
    { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
    { to: '/scheduled', label: 'Scheduled',  icon: Mail },
    { to: '/sent',      label: 'Sent',       icon: Send },
    { to: '/compose',   label: 'Compose',    icon: PenSquare },
    { to: '/settings',  label: 'Settings',   icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-surface-2 border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">ReachInbox</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-300 font-medium'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-border px-4 py-4">
          <div className="flex items-center gap-3">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-white/40 truncate">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="text-white/40 hover:text-white/80 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
