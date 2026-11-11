import React, { useState } from 'react';
import { Conversation } from '../types';
import {
  LayoutDashboard,
  MessageSquare,
  Database,
  Search,
  HardDrive,
  BarChart2,
  BookOpen,
  Settings,
  Plus,
  Trash2,
  Check,
  X,
  Sparkles
} from 'lucide-react';

export type ActiveView =
  | 'dashboard'
  | 'chat'
  | 'db-manager'
  | 'db-explorer'
  | 'managed-dbs'
  | 'insights'
  | 'guide'
  | 'settings';

interface SidebarProps {
  currentView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isOpenMobile,
  onCloseMobile
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const mainNavItems = [
    { id: 'dashboard' as ActiveView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'chat' as ActiveView, label: 'Chat Workspace', icon: MessageSquare },
    { id: 'db-manager' as ActiveView, label: 'Choose Database', icon: Database },
    { id: 'db-explorer' as ActiveView, label: 'Database Explorer', icon: Search },
    { id: 'managed-dbs' as ActiveView, label: 'Managed Databases', icon: HardDrive },
    { id: 'insights' as ActiveView, label: 'Data Insights', icon: BarChart2 },
    { id: 'guide' as ActiveView, label: 'User Guide', icon: BookOpen },
    { id: 'settings' as ActiveView, label: 'Settings', icon: Settings }
  ];

  const handleConfirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteConversation(id);
    setDeleteConfirmId(null);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white/90 dark:bg-slate-950/85 backdrop-blur-2xl border-r border-slate-200 dark:border-slate-800/80 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center shadow-md">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">QueryWise</span>
              <p className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-medium">v2.4 Pro</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Conversation Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewConversation();
              if (isOpenMobile) onCloseMobile();
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Navigation Section */}
        <div className="px-3 py-1 space-y-0.5">
          {mainNavItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Saved Conversations Section */}
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-4 border-t border-slate-200 dark:border-slate-800/80 mt-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saved Chats
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              {conversations.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-xs">
                No conversations yet.
              </div>
            ) : (
              conversations.map(conv => {
                const isSelected = activeConversationId === conv.id;
                const isConfirming = deleteConfirmId === conv.id;

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation(conv.id);
                      if (isOpenMobile) onCloseMobile();
                    }}
                    className={`group relative flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-100 dark:bg-slate-800/80 text-cyan-700 dark:text-cyan-300 border border-slate-300/80 dark:border-slate-700/80 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400" />
                      <span className="truncate">{conv.title || 'Untitled Conversation'}</span>
                    </div>

                    {/* Delete Icon & Confirmation */}
                    <div className="flex items-center ml-2">
                      {isConfirming ? (
                        <div className="flex items-center gap-1 bg-red-100 dark:bg-red-950/80 p-0.5 rounded-md border border-red-300 dark:border-red-800 animate-in fade-in">
                          <button
                            onClick={e => handleConfirmDelete(conv.id, e)}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200"
                            title="Confirm delete"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteConfirmId(null);
                            }}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Cancel"
                          >
                            <X className="w-3 h-3 stroke-[3]" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteConfirmId(conv.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-all"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info badge */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Gemini 3.8 Flash</span>
          </div>
          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">● Ready</span>
        </div>
      </aside>
    </>
  );
};
