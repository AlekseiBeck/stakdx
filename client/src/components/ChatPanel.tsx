import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TradeRecommendation, NewsItem, Position } from '../types';
import {
  chatStream,
  NewsAPIResult,
  ChatSession,
  listChatSessions,
  createChatSession,
  deleteChatSession,
  loadSessionMessages,
  saveSessionMessages,
  renameChatSession,
} from '../api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  positions: Position[];
  scanResults: TradeRecommendation[];
  news: NewsItem[];
  prices: Record<string, number>;
  candleSummaries: Record<string, string>;
  tickerNews: Record<string, string[]>;
  newsAPIArticles: NewsAPIResult[];
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your Stakdx AI. Ask me about scan results, your positions, or any setup you're watching.",
};

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatPanel({ positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pending messages to save once streaming completes (user + assistant pair)
  const pendingSave = useRef<{ sessionId: string; msgs: Array<{ role: 'user' | 'assistant'; content: string }> } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    listChatSessions().then(setSessions);
  }, []);

  const switchSession = useCallback(async (session: ChatSession) => {
    if (loadingSession || session.id === activeSessionId) {
      setSidebarOpen(false);
      return;
    }
    setLoadingSession(true);
    setActiveSessionId(session.id);
    setSidebarOpen(false);
    const stored = await loadSessionMessages(session.id);
    if (stored.length === 0) {
      setMessages([WELCOME]);
    } else {
      setMessages(stored.map(m => ({ id: m.id, role: m.role, content: m.content })));
    }
    setLoadingSession(false);
  }, [activeSessionId, loadingSession]);

  const startNewChat = useCallback(async () => {
    setSidebarOpen(false);
    setActiveSessionId(null);
    setMessages([WELCOME]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChatSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([WELCOME]);
    }
  }, [activeSessionId]);

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (inputRef.current) inputRef.current.style.height = 'auto';
    setInput('');

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const asstId = `a-${Date.now()}`;

    setMessages(prev => [...prev, userMsg, { id: asstId, role: 'assistant', content: '' }]);
    setIsStreaming(true);

    // Ensure a session exists before we stream (so we can save messages after)
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const session = await createChatSession(truncate(text, 60));
        sessionId = session.id;
        setActiveSessionId(session.id);
        setSessions(prev => [session, ...prev]);
      } catch {
        // No DB — chat still works, just no persistence
      }
    }

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      let finalContent = '';
      await chatStream(history, { positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }, (chunk) => {
        finalContent += chunk;
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: m.content + chunk } : m));
      });

      // Save to DB after streaming completes
      if (sessionId) {
        pendingSave.current = {
          sessionId,
          msgs: [
            { role: 'user', content: text },
            { role: 'assistant', content: finalContent },
          ],
        };
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: "Couldn't reach the server. Check your connection." } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  // Save messages after streaming ends (isStreaming → false)
  useEffect(() => {
    if (!isStreaming && pendingSave.current) {
      const { sessionId, msgs } = pendingSave.current;
      pendingSave.current = null;
      saveSessionMessages(sessionId, msgs);
      // Update session updated_at in local list
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === sessionId);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], updated_at: new Date().toISOString() };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    }
  }, [isStreaming]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex h-full bg-[#0c0c0d] overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 bg-black/60 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session sidebar */}
      <div className={`
        absolute lg:relative z-20 flex flex-col bg-[#0e0e0f] border-r border-[#1e1e20]
        w-64 h-full transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-[#1e1e20]">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
          <button
            onClick={startNewChat}
            title="New chat"
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-[#222225] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-3">No saved chats yet.</p>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                onClick={() => switchSession(session)}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-[#1a1a1c] text-white'
                    : 'text-gray-400 hover:bg-[#141415] hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate leading-tight">{session.title}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{formatDate(session.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar with sidebar toggle */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[#1a1a1c]">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-[#1e1e20] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 truncate">
            {activeSessionId ? (sessions.find(s => s.id === activeSessionId)?.title ?? 'Chat') : 'New Chat'}
          </span>
          {activeSessionId && (
            <button
              onClick={startNewChat}
              className="ml-auto text-[10px] text-gray-600 hover:text-amber-400 transition-colors"
            >
              + New
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-[11px] font-bold text-black flex-shrink-0 mt-0.5 shadow-lg shadow-amber-900/40">
                    S
                  </div>
                )}
                <div className={`max-w-[82%] text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#222225] text-white px-4 py-2.5 rounded-2xl rounded-br-sm shadow-lg'
                    : 'text-gray-200'
                }`}>
                  {msg.content === '' && isStreaming ? (
                    <span className="flex gap-1.5 items-center h-5">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{renderContent(msg.content)}</span>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-[#1e1e20] border border-[#2a2a2c] flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                    U
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-t border-[#222225]" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2 bg-[#141415] border border-[#222225] rounded-xl px-3.5 py-2.5 focus-within:border-amber-500/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder="Ask about setups, positions, or market conditions..."
              rows={1}
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none focus:outline-none leading-relaxed py-0"
              style={{ maxHeight: '120px', scrollbarWidth: 'none' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 rounded-lg bg-amber-500 text-black flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="hidden sm:block text-[10px] text-gray-700 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  );
}
