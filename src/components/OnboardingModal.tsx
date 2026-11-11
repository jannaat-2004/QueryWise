import React, { useState, useEffect } from 'react';
import { UserProfile, DatabaseInstance } from '../types';
import { DEMO_TEMPLATES_METADATA } from '../lib/demo-databases';
import { SQLiteEngine } from '../lib/sqlite-engine';
import { Database, Sparkles, Upload, FileSpreadsheet, ArrowRight, Check, HelpCircle, Bot, Code2, Zap, BookOpen } from 'lucide-react';

interface OnboardingModalProps {
  user: UserProfile;
  isFirstLogin: boolean;
  onComplete: (selectedDb: DatabaseInstance, firstQuestion?: string) => void;
  onSkipToDashboard?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  isFirstLogin,
  onComplete,
  onSkipToDashboard
}) => {
  // Step 1: Welcome (only if isFirstLogin and !user.onboardingCompleted)
  // Step 2: Choose Database
  // Step 3: Start First Chat
  const initialStep = (isFirstLogin && !user.onboardingCompleted) ? 1 : 2;
  const [step, setStep] = useState<number>(initialStep);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('retail-sales');
  const [activeCreatedDb, setActiveCreatedDb] = useState<DatabaseInstance | null>(null);
  const [isCreatingDb, setIsCreatingDb] = useState<boolean>(false);
  const [customQuestion, setCustomQuestion] = useState<string>('');

  // Handle template selection and instant database creation
  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsCreatingDb(true);
    try {
      const template = DEMO_TEMPLATES_METADATA.find(t => t.id === templateId)!;
      const dbId = `db_${templateId}_${Date.now()}`;
      const { instance } = await SQLiteEngine.createDemoDatabase(dbId, template.name, templateId);
      setActiveCreatedDb(instance);
    } catch (err) {
      console.error('Failed to create demo database:', err);
    } finally {
      setIsCreatingDb(false);
    }
  };

  // Pre-seed default template on mount
  useEffect(() => {
    if (!activeCreatedDb) {
      handleSelectTemplate(selectedTemplateId);
    }
  }, []);

  const handleNextFromWelcome = async () => {
    setStep(2);
    if (!activeCreatedDb) {
      await handleSelectTemplate(selectedTemplateId);
    }
  };

  const handleNextFromChooseDb = async () => {
    if (!activeCreatedDb) {
      setIsCreatingDb(true);
      try {
        const template = DEMO_TEMPLATES_METADATA.find(t => t.id === selectedTemplateId)!;
        const dbId = `db_${selectedTemplateId}_${Date.now()}`;
        const { instance } = await SQLiteEngine.createDemoDatabase(dbId, template.name, selectedTemplateId);
        setActiveCreatedDb(instance);
      } catch (err) {
        console.error('Failed to create demo database on next:', err);
      } finally {
        setIsCreatingDb(false);
      }
    }
    setStep(3);
  };

  const handleFinishOnboarding = async (question?: string) => {
    let finalDb = activeCreatedDb;
    if (!finalDb) {
      setIsCreatingDb(true);
      try {
        const template = DEMO_TEMPLATES_METADATA.find(t => t.id === selectedTemplateId) || DEMO_TEMPLATES_METADATA[0];
        const dbId = `db_${template.id}_${Date.now()}`;
        const { instance } = await SQLiteEngine.createDemoDatabase(dbId, template.name, template.id);
        finalDb = instance;
        setActiveCreatedDb(finalDb);
      } catch (err) {
        console.error('Failed creating fallback DB:', err);
      } finally {
        setIsCreatingDb(false);
      }
    }
    if (finalDb) {
      onComplete(finalDb, question || customQuestion);
    }
  };

  const currentTemplate = DEMO_TEMPLATES_METADATA.find(t => t.id === selectedTemplateId) || DEMO_TEMPLATES_METADATA[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-100 transition-colors">
        {/* Progress Bar Header */}
        <div className="px-8 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-600 shadow-md">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide uppercase">
                Welcome to QueryWise
              </h2>
              <p className="text-xs text-slate-400">
                Step {step} of 3 • {step === 1 ? 'Getting Started' : step === 2 ? 'Connect Dataset' : 'First Query'}
              </p>
            </div>
          </div>

          {/* Stepper dots */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s === step ? 'w-8 bg-cyan-400' : s < step ? 'w-3 bg-cyan-600' : 'w-3 bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-8 overflow-y-auto space-y-6">
          {/* STEP 1: WELCOME SCREEN */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center max-w-xl mx-auto space-y-3">
                <h3 className="text-2xl font-extrabold text-white">
                  Welcome, {user.fullName || 'Data Leader'}!
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  QueryWise bridges the gap between questions and answers. Instead of writing complex SQL queries by hand, simply ask questions in plain English.
                </p>
              </div>

              {/* 3 Core Pillars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Ask in Plain English</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ask questions naturally. The AI intelligently inspects your database schema and tables.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 w-fit">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Smart Clarification</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    If your request is ambiguous, QueryWise proactively asks clarification questions before running.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Live Execution & Charts</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Queries execute against your real database, generating interactive charts and actionable insights.
                  </p>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleNextFromWelcome}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm shadow-xl shadow-cyan-500/25 transition-all flex items-center gap-2"
                >
                  <span>Continue to Database Selection</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {onSkipToDashboard && (
                  <button
                    onClick={onSkipToDashboard}
                    className="px-5 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-medium text-xs transition-colors"
                  >
                    Go to Dashboard
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE DATABASE */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-xl font-bold text-white">Select a Ready-to-Query Database</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect the built-in Retail & Sales Analytics demo dataset, or upload your own SQLite, CSV, or Excel files from the Database Manager.
                </p>
              </div>

              {/* Built-in Demo Template */}
              <div className="grid grid-cols-1 gap-3">
                {DEMO_TEMPLATES_METADATA.map(t => {
                  const isSelected = selectedTemplateId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTemplate(t.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-cyan-950/30 border-cyan-500 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-950/80'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                            {t.category}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-0.5">{t.name}</h4>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        {t.description}
                      </p>
                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                        <span className="font-mono text-cyan-300">Tables: {t.tables.join(', ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">
                  {isCreatingDb ? 'Provisioning database tables...' : 'Selected database is ready.'}
                </span>
                <button
                  onClick={handleNextFromChooseDb}
                  disabled={isCreatingDb}
                  className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <span>Proceed to First Query</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: START YOUR FIRST CHAT */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-xl font-bold text-white">Start Your First Chat</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Active database: <span className="text-cyan-300 font-semibold">{currentTemplate.name}</span>. Ask any question in natural language to query your dataset.
                </p>
              </div>

              {/* Explaining Core Tools: Generate, Optimize, Explain */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 flex-shrink-0">
                    <Code2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">Generate SQL</h5>
                    <p className="text-[11px] text-slate-400">Transforms plain English questions into safe, optimized queries.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 flex-shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">Optimize SQL</h5>
                    <p className="text-[11px] text-slate-400">Identifies slow bottlenecks and advises on index creation.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 flex-shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">Explain SQL</h5>
                    <p className="text-[11px] text-slate-400">Breaks down clauses so non-technical stakeholders understand.</p>
                  </div>
                </div>
              </div>

              {/* Connected Schema Overview */}
              {activeCreatedDb && activeCreatedDb.tables.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Connected Tables in {activeCreatedDb.name}
                  </h4>
                  <div className="space-y-1.5">
                    {activeCreatedDb.tables.map(tbl => (
                      <div key={tbl.name} className="text-xs font-mono text-slate-300 flex items-center justify-between bg-slate-900/70 px-3 py-2 rounded-xl border border-slate-800/80">
                        <span className="text-cyan-300 font-bold">{tbl.name} <span className="text-slate-500 font-normal">({tbl.rowCount} rows)</span></span>
                        <span className="text-[11px] text-slate-400 truncate max-w-md">
                          {tbl.columns.map(c => c.name).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom input */}
              <div className="pt-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Ask a question about your database:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={e => setCustomQuestion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customQuestion.trim()) {
                        handleFinishOnboarding(customQuestion.trim());
                      }
                    }}
                    placeholder="Ask a question in plain English (or click Open Workspace to start)..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => handleFinishOnboarding(customQuestion.trim())}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs shadow-md shadow-cyan-500/25 transition-all"
                  >
                    {customQuestion.trim() ? 'Ask Question' : 'Open Workspace'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
