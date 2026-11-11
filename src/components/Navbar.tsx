import React from 'react';
import { UserProfile, DatabaseInstance } from '../types';
import { useTheme } from '../context/ThemeContext';
import {
  Database,
  RefreshCw,
  HelpCircle,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';

interface NavbarProps {
  user: UserProfile;
  activeDatabase: DatabaseInstance | null;
  onOpenDatabaseManager: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
  isRefreshing: boolean;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeDatabase,
  onOpenDatabaseManager,
  onOpenSettings,
  onOpenHelp,
  onRefresh,
  onLogout,
  isRefreshing,
  onToggleSidebar
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = React.useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const handleToggleThemeQuick = () => {
    if (resolvedTheme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/60 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between transition-colors duration-200">
      {/* Left: Mobile Toggle & Brand */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            aria-label="Toggle Navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              QueryWise
            </span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">AI Natural Language to SQL</p>
          </div>
        </div>
      </div>

      {/* Middle: Active Database Selector Badge */}
      <div className="flex items-center">
        <button
          onClick={onOpenDatabaseManager}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/80 hover:bg-slate-200/90 dark:hover:bg-slate-800/90 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 text-xs text-slate-800 dark:text-slate-200 transition-all shadow-xs group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Active DB:</span>
          <span className="font-semibold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 truncate max-w-[140px] sm:max-w-[200px]">
            {activeDatabase ? activeDatabase.name : 'No Database Selected'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-transform" />
        </button>
      </div>

      {/* Right Controls: Theme Quick-Toggle, Refresh, Help, Settings, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Quick Theme Toggle Button */}
        <button
          onClick={handleToggleThemeQuick}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all"
          title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Theme`}
          aria-label="Toggle Theme"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all"
          title="Refresh State (Preserves Active Chat)"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
        </button>

        {/* User Guide / Help */}
        <button
          onClick={onOpenHelp}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all"
          title="User Guide & Tutorials"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all"
          title="Settings, Appearance & Integrations"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 hidden md:inline truncate max-w-[120px]">
              {user.fullName || user.email}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:inline" />
          </button>

          {profileDropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 text-xs animate-in fade-in transition-colors"
              onMouseLeave={() => setProfileDropdownOpen(false)}
            >
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Account & Profile</span>
                </button>
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Appearance & Theme</span>
                </button>
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Documentation</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
