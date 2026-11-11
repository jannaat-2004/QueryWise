import React, { useState } from 'react';
import { UserProfile } from '../types';
import { useTheme, ThemeMode, WallpaperStyle, WallpaperIntensity } from '../context/ThemeContext';
import {
  Settings,
  X,
  User,
  LogOut,
  Check,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Sun,
  Moon,
  Monitor,
  Waves,
  Activity,
  RotateCcw,
  Eye,
  Shield,
  Palette
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'profile'>('appearance');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Theme context controls
  const {
    theme,
    resolvedTheme,
    setTheme,
    wallpaperEnabled,
    setWallpaperEnabled,
    wallpaperStyle,
    setWallpaperStyle,
    wallpaperIntensity,
    setWallpaperIntensity,
    wallpaperOpacity,
    setWallpaperOpacity,
    resetAppearanceDefaults
  } = useTheme();

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...user,
      fullName: fullName.trim() || user.fullName
    };
    onUpdateUser(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-slate-800 dark:text-slate-100 transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">System Settings</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure appearance, live wallpaper, and user profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-100/50 dark:bg-slate-950/30 gap-6 text-xs font-semibold overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'appearance'
                ? 'border-cyan-500 dark:border-cyan-400 text-cyan-600 dark:text-cyan-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance & Theme</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-cyan-500 dark:border-cyan-400 text-cyan-600 dark:text-cyan-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile & Account</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-slate-300">
          {/* TAB 1: APPEARANCE (FEATURED) */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* 1. Theme Mode Selection */}
              <div>
                <div className="mb-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Interface Theme</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select your preferred color scheme. Changes apply instantly and persist across sessions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Dark Theme Option */}
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`relative p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      theme === 'dark'
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 flex items-center justify-center">
                        <Moon className="w-4 h-4" />
                      </div>
                      {theme === 'dark' && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">Dark Theme</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Deep navy & obsidian glass with electric cyan accents
                      </p>
                    </div>
                    {/* Visual miniature preview bar */}
                    <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="w-3 h-3 rounded-full bg-[#060814] border border-slate-700" />
                      <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-700" />
                      <div className="w-3 h-3 rounded-full bg-cyan-400" />
                      <div className="w-3 h-3 rounded-full bg-violet-500" />
                    </div>
                  </button>

                  {/* Light Theme Option */}
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`relative p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      theme === 'light'
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-300 text-amber-500 flex items-center justify-center shadow-xs">
                        <Sun className="w-4 h-4" />
                      </div>
                      {theme === 'light' && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">Light Theme</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Clean porcelain white surfaces with soft slate & vivid cyan
                      </p>
                    </div>
                    {/* Visual miniature preview bar */}
                    <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="w-3 h-3 rounded-full bg-slate-50 border border-slate-300" />
                      <div className="w-3 h-3 rounded-full bg-white border border-slate-300" />
                      <div className="w-3 h-3 rounded-full bg-cyan-600" />
                      <div className="w-3 h-3 rounded-full bg-indigo-500" />
                    </div>
                  </button>

                  {/* System Default Option */}
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`relative p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      theme === 'system'
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                        <Monitor className="w-4 h-4" />
                      </div>
                      {theme === 'system' && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">System Default</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Synchronizes automatically with your OS light/dark mode
                      </p>
                    </div>
                    {/* Visual miniature preview bar */}
                    <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-400" />
                      <div className="w-3 h-3 rounded-full bg-slate-800 border border-slate-600" />
                      <span className="text-[10px] text-slate-400 ml-1">Auto-sync</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Live 3D Wallpaper Controls */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
                {/* Toggle Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <Waves className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Live 3D Wallpaper</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        GPU-accelerated ambient backdrop with subtle mouse parallax
                      </p>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setWallpaperEnabled(!wallpaperEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      wallpaperEnabled ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    role="switch"
                    aria-checked={wallpaperEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        wallpaperEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {wallpaperEnabled && (
                  <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 animate-in fade-in duration-200">
                    {/* Style selector */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                        Wallpaper Visual Style
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'gradient' as WallpaperStyle, label: 'Animated Gradient', desc: 'Cosmic mesh' },
                          { id: 'aurora' as WallpaperStyle, label: 'Aurora Waves', desc: 'Luminous ribbons' },
                          { id: 'particles' as WallpaperStyle, label: 'Subtle Particles', desc: 'Data nodes' },
                          { id: 'static' as WallpaperStyle, label: 'Minimal Static', desc: 'Zero motion' }
                        ].map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setWallpaperStyle(st.id)}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              wallpaperStyle === st.id
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 font-bold'
                                : 'border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="text-xs truncate">{st.label}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{st.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Speed / Intensity selector */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                        Motion Intensity & Speed
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'low' as WallpaperIntensity, label: 'Low (Gentle)' },
                          { id: 'medium' as WallpaperIntensity, label: 'Medium (Balanced)' },
                          { id: 'high' as WallpaperIntensity, label: 'High (Dynamic)' }
                        ].map(int => (
                          <button
                            key={int.id}
                            type="button"
                            onClick={() => setWallpaperIntensity(int.id)}
                            className={`py-2 px-3 rounded-xl border text-center text-xs transition-all ${
                              wallpaperIntensity === int.id
                                ? 'border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200 font-bold'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {int.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Background Opacity
                        </label>
                        <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 font-bold">
                          {Math.round(wallpaperOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={wallpaperOpacity}
                        onChange={e => setWallpaperOpacity(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>10% (Ultra Subtle)</span>
                        <span>50% (Subdued)</span>
                        <span>100% (Full Glow)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset to Default Button */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={resetAppearanceDefaults}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Appearance Defaults</span>
                </button>
                <span className="text-[11px] text-slate-400">Settings saved automatically</span>
              </div>
            </div>
          )}

          {/* TAB 2: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1.5">
                  Display Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1.5">
                  Registered Email
                </label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 text-slate-500 text-sm cursor-not-allowed"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>

                {saveSuccess && (
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Profile Updated
                  </span>
                )}

                <button
                  type="button"
                  onClick={onLogout}
                  className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
