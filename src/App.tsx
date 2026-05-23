import { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { useAccounts } from './AccountContext';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import AuthPage from './AuthPage';
import DOMPurify from 'dompurify';
import { fetchEmails, sendEmail, fetchEmailBody, performEmailAction } from './gmailService';
import type { EmailDetail } from './gmailService';
import { EmailListSkeleton } from './Skeleton';

const getAccountColor = (email: string) => {
    if (!email) return 'bg-gray-100 text-gray-700 border-gray-200';
    
    const colors = [
        'bg-blue-50 text-blue-700 border-blue-200',
        'bg-purple-50 text-purple-700 border-purple-200',
        'bg-emerald-50 text-emerald-700 border-emerald-200',
        'bg-amber-50 text-amber-700 border-amber-200',
        'bg-rose-50 text-rose-700 border-rose-200',
        'bg-cyan-50 text-cyan-700 border-cyan-200',
        'bg-indigo-50 text-indigo-700 border-indigo-200'
    ];
    
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

function App() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const { accounts, addAccount, removeAccount } = useAccounts();
  const { showToast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<EmailDetail | null>(null);
  const [emailBody, setEmailBody] = useState('');
  const [isBodyLoading, setIsBodyLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [emails, setEmails] = useState<EmailDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [emailLimit, setEmailLimit] = useState(10);

  // Composer State
  const [composerData, setComposerData] = useState({
    from: '',
    to: '',
    subject: '',
    body: ''
  });

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://mail.google.com/',
    onSuccess: async (codeResponse) => {
      setIsLoading(true);
      try {
        const res = await axios.post('http://localhost:5000/api/accounts/connect', 
            { code: codeResponse.code },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        addAccount(res.data);
        if (!composerData.from) setComposerData(prev => ({ ...prev, from: res.data.email }));
        showToast('Account permanently connected!', 'success');
        refreshInbox();
      } catch (error) {
        console.error('Failed to connect account:', error);
        showToast('Failed to connect account.', 'error');
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => console.error('Login Failed:', error)
  });

  const refreshInbox = useCallback(async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
        const data = await fetchEmails(token, searchQuery, emailLimit);
        setEmails(data);
    } catch (error) {
        console.error('Error fetching emails:', error);
    } finally {
        setIsRefreshing(false);
    }
  }, [token, searchQuery, emailLimit]);

  useEffect(() => {
    if (user && token) {
        refreshInbox();
        const interval = setInterval(refreshInbox, 120000);
        return () => clearInterval(interval);
    }
  }, [refreshInbox, user, token]);

  const handleEmailClick = async (email: EmailDetail) => {
      setViewingEmail(email);
      setEmailBody('');
      setIsBodyLoading(true);
      try {
          const body = await fetchEmailBody(token!, email.account, email.id);
          setEmailBody(body);
      } catch (error) {
          setEmailBody('Failed to load email content.');
      } finally {
          setIsBodyLoading(false);
      }
  };

  const handleEmailAction = async (email: EmailDetail, action: 'archive' | 'trash') => {
      // Optimistically remove the email from the UI for a snappy feel
      setEmails(prev => prev.filter(e => e.id !== email.id));
      setViewingEmail(null); // Close the reading pane
      setIsActionLoading(true);
      
      try {
          await performEmailAction(token!, email.account, email.id, action);
      } catch (error) {
          console.error(`Failed to ${action} email:`, error);
          showToast(`Failed to ${action} email. Refreshing inbox.`, 'error');
          refreshInbox(); // Put it back on the screen if it failed on the backend
      } finally {
          setIsActionLoading(false);
      }
  };

  const handleSend = async () => {
    if (!token) return;
    const fromAcc = accounts.find(a => a.email === composerData.from);
    if (!fromAcc) {
      showToast('Please select a valid sender account', 'error');
      return;
    }

    try {
      setIsLoading(true);
      await sendEmail(
        token,
        fromAcc.email,
        composerData.to,
        composerData.subject,
        composerData.body
      );
      setIsComposerOpen(false);
      setComposerData({ from: accounts[0]?.email || '', to: '', subject: '', body: '' });
      showToast('Email sent successfully!', 'success');
      refreshInbox();
    } catch (error) {
      console.error('Failed to send email:', error);
      showToast('Failed to send email.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
    <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 bg-blue-100 rounded-xl mb-4"></div>
        <div className="h-4 w-24 bg-gray-100 rounded"></div>
    </div>
  </div>;

  if (!user) return <AuthPage />;

  return (
    <div className="flex h-screen bg-[#f8fafc] text-[#1e293b] relative">
      {/* Sidebar Overlay (Mobile only) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 border-r border-[#e2e8f0] bg-white flex flex-col z-50 transition-transform duration-300 transform lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6">
            <button 
                onClick={() => { setIsComposerOpen(true); setIsSidebarOpen(false); }}
                className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 font-medium"
            >
                <span className="text-xl">+</span> Compose
            </button>
        </div>

        <nav className="px-3 space-y-1 flex-1">
            <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 text-[#3b82f6] rounded-lg font-medium cursor-pointer">
                <span>📥</span> Inbox
            </div>
            <div 
                onClick={() => { refreshInbox(); setIsSidebarOpen(false); }}
                className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
            >
                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span> 
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </div>
        </nav>

        <div className="p-4 border-t border-[#e2e8f0]">
            <h4 className="text-11 font-bold text-[#64748b] uppercase tracking-wider mb-4 px-2">Connected Accounts</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {accounts.length === 0 ? (
                    <p className="px-2 text-12 text-[#94a3b8] italic">No emails connected</p>
                ) : (
                    accounts.map(acc => (
                        <div key={acc.email} className="group flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getAccountColor(acc.email).split(' ')[0].replace('-50', '-400')}`}></div>
                            <span className="text-13 truncate flex-1">{acc.email}</span>
                            <button 
                                onClick={() => removeAccount(acc.email)}
                                className="opacity-0 group-hover:opacity-100 text-[#64748b] hover:text-red-500 transition-all text-10"
                            >✕</button>
                        </div>
                    ))
                )}
            </div>
            <button 
                onClick={() => googleLogin()}
                disabled={isLoading}
                className="w-full mt-4 py-2 border border-dashed border-[#e2e8f0] text-[#64748b] hover:border-[#3b82f6] hover:text-[#3b82f6] rounded-lg text-13 transition-all disabled:opacity-50"
            >
                {isLoading ? 'Connecting...' : '+ Connect Account'}
            </button>
        </div>

        <div className="p-4 border-t border-[#e2e8f0] flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-12 font-bold text-[#3b82f6]">
                {user.email[0].toUpperCase()}
            </div>
            <div className="flex-1 truncate">
                <p className="text-13 font-medium truncate">{user.email}</p>
                <button onClick={logout} className="text-11 text-red-500 hover:underline">Sign out</button>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#e2e8f0] bg-white flex items-center px-4 lg:px-8 gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-50 rounded-lg text-[#64748b]"
            >
              ☰
            </button>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-20 font-bold text-[#1e293b] hidden sm:inline">Unified Inbox</span>
            </div>
            <div className="flex items-center gap-4 text-[#64748b]">
                <span className="cursor-pointer hover:text-[#1e293b]">⚙️</span>
                <span className="cursor-pointer hover:text-[#1e293b]">❓</span>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-6 pb-0">
                <form 
                    onSubmit={(e) => { e.preventDefault(); refreshInbox(); }}
                    className="relative max-w-2xl"
                >
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748b]">
                        🔍
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search all accounts (e.g. from:google, is:unread)..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-24 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-14"
                    />
                    <button 
                        type="submit"
                        className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-[#3b82f6] text-white text-13 font-medium rounded-lg hover:bg-[#2563eb] transition-colors"
                    >
                        Search
                    </button>
                </form>
            </div>

            {isRefreshing && emails.length === 0 ? (
                <EmailListSkeleton count={emailLimit} />
            ) : emails.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-4xl mb-6">✉️</div>
                    <h3 className="text-20 font-semibold mb-2">
                        {searchQuery ? 'No results found' : 'Your unified inbox is empty'}
                    </h3>
                    <p className="text-[#64748b] max-w-sm">
                        {searchQuery ? `We couldn't find any emails matching "${searchQuery}" across your connected accounts.` : 'Connect your Gmail accounts once and manage them permanently in this professional dashboard.'}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-[#f1f5f9]">
                    {emails.map(email => (
                        <div 
                            key={email.id} 
                            onClick={() => handleEmailClick(email)}
                            className="flex items-center px-4 lg:px-8 py-3 hover:bg-[#f8fafc] transition-colors cursor-pointer group"
                        >
                            <input type="checkbox" className="hidden sm:block w-4 h-4 rounded border-[#e2e8f0] text-[#3b82f6] focus:ring-blue-500/20" onClick={e => e.stopPropagation()} />
                            <span className="hidden sm:block ml-4 text-amber-400 group-hover:scale-110 transition-transform">☆</span>
                            <div className="flex-1 min-w-0 sm:ml-4">
                                <div className="flex items-center justify-between mb-0.5">
                                    <div className="text-14 font-semibold truncate text-[#1e293b]">{email.sender}</div>
                                    <div className="text-12 text-[#94a3b8] font-medium ml-4">{email.date}</div>
                                </div>
                                <div className="flex items-center gap-2 truncate">
                                    <span className={`px-1.5 py-0.5 text-9 font-bold rounded uppercase tracking-wider border flex-shrink-0 ${getAccountColor(email.account)}`}>
                                        {email.account.split('@')[0]}
                                    </span>
                                    <span className="text-13 font-medium truncate text-[#475569]">{email.subject}</span>
                                    <span className="text-13 text-[#94a3b8] truncate hidden md:inline">— {email.snippet}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {emails.length > 0 && (
                        <div className="p-8 flex justify-center">
                            <button 
                                onClick={() => setEmailLimit(prev => prev + 10)}
                                disabled={isRefreshing}
                                className="px-6 py-2 bg-white border border-[#e2e8f0] hover:border-[#3b82f6] text-[#64748b] hover:text-[#3b82f6] text-13 font-medium rounded-full shadow-sm transition-all disabled:opacity-50"
                            >
                                {isRefreshing ? 'Loading...' : 'Load More Emails'}
                            </button>
                        </div>
                    )}
                </div>
            )}
            {(isRefreshing || isBodyLoading || isActionLoading) && (
                <div className="fixed top-20 right-8 bg-white border border-[#e2e8f0] shadow-lg rounded-full px-4 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-right-4 z-50">
                    <span className="animate-spin text-[#3b82f6]">🔄</span>
                    <span className="text-13 font-medium text-[#1e293b]">
                        {isActionLoading ? 'Updating inbox...' : (isBodyLoading ? 'Opening email...' : 'Refreshing inbox...')}
                    </span>
                </div>
            )}
        </div>
      </main>

      {/* Email Reader Modal */}
      {viewingEmail && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-8 z-50" onClick={() => { if(!isActionLoading) { setViewingEmail(null); setEmailBody(''); } }}>
              <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <div className="p-8 border-b border-[#f1f5f9] flex justify-between items-start">
                      <div className="flex-1 min-w-0 mr-8">
                          <h2 className="text-24 font-bold text-[#1e293b] mb-4 leading-tight">{viewingEmail.subject}</h2>
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-14 text-[#64748b]">
                              <span className="font-semibold text-[#1e293b]">{viewingEmail.sender}</span>
                              <span className="opacity-40">•</span>
                              <span>{viewingEmail.date}</span>
                              <span className={`px-2 py-0.5 text-10 font-bold rounded uppercase tracking-wider border ${getAccountColor(viewingEmail.account)}`}>
                                  {viewingEmail.account}
                              </span>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <button 
                            disabled={isActionLoading}
                            onClick={() => handleEmailAction(viewingEmail, 'archive')}
                            className="px-3 py-1.5 text-13 font-medium text-[#3b82f6] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                              📥 Archive
                          </button>
                          <button 
                            disabled={isActionLoading}
                            onClick={() => handleEmailAction(viewingEmail, 'trash')}
                            className="px-3 py-1.5 text-13 font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                              🗑️ Delete
                          </button>
                          <button 
                            disabled={isActionLoading}
                            onClick={() => { setViewingEmail(null); setEmailBody(''); }} 
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-[#64748b] transition-colors ml-2"
                          >
                              ✕
                          </button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-white">
                      {isBodyLoading ? (
                          <div className="h-64 flex flex-col items-center justify-center gap-4">
                              <div className="w-8 h-8 border-3 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                              <div className="text-14 font-medium text-[#64748b] animate-pulse">Loading secure content...</div>
                          </div>
                      ) : (
                          <div 
                            className="text-15 lg:text-16 text-[#334155] leading-relaxed prose prose-slate max-w-none"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(emailBody) }}
                          />
                      )}
                  </div>
                  <div className="p-6 bg-[#f8fafc] border-t border-[#e2e8f0] flex gap-3">
                      <button className="px-8 py-2.5 bg-[#3b82f6] text-white font-semibold rounded-xl shadow-sm hover:bg-[#2563eb] transition-all">Reply</button>
                      <button className="px-8 py-2.5 border border-[#e2e8f0] bg-white text-[#64748b] font-semibold rounded-xl hover:bg-gray-50 transition-all">Forward</button>
                  </div>
              </div>
          </div>
      )}

      {/* Composer Modal */}
      {isComposerOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end justify-end p-8 z-50" onClick={() => setIsComposerOpen(false)}>
            <div className="w-[500px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1e293b] text-white p-4 flex justify-between items-center">
                    <span className="font-semibold text-14 text-white">New Message</span>
                    <button onClick={() => setIsComposerOpen(false)} className="hover:bg-white/10 p-1 rounded transition-colors text-12 text-white">✕</button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3 border-b border-[#f1f5f9] pb-2">
                        <span className="text-13 text-[#64748b] w-12">From:</span>
                        <select 
                            className="flex-1 bg-transparent text-13 outline-none cursor-pointer"
                            value={composerData.from} 
                            onChange={e => setComposerData({ ...composerData, from: e.target.value })}
                        >
                            {accounts.map(acc => (
                                <option key={acc.email} value={acc.email}>{acc.email}</option>
                            ))}
                            {accounts.length === 0 && <option>No accounts connected</option>}
                        </select>
                    </div>
                    <div className="flex items-center gap-3 border-b border-[#f1f5f9] pb-2">
                        <span className="text-13 text-[#64748b] w-12">To:</span>
                        <input 
                            type="text" 
                            className="flex-1 bg-transparent text-13 outline-none"
                            placeholder="recipients@example.com"
                            value={composerData.to}
                            onChange={e => setComposerData({ ...composerData, to: e.target.value })}
                        />
                    </div>
                    <div className="border-b border-[#f1f5f9] pb-2">
                        <input 
                            type="text" 
                            className="w-full bg-transparent text-14 font-medium outline-none"
                            placeholder="Subject"
                            value={composerData.subject}
                            onChange={e => setComposerData({ ...composerData, subject: e.target.value })}
                        />
                    </div>
                    <textarea 
                        className="w-full h-64 bg-transparent text-14 outline-none resize-none placeholder-[#94a3b8]"
                        placeholder="Write your message..."
                        value={composerData.body}
                        onChange={e => setComposerData({ ...composerData, body: e.target.value })}
                    ></textarea>
                </div>
                <div className="p-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between">
                    <button 
                        onClick={handleSend}
                        disabled={isLoading || !composerData.to}
                        className="px-6 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
                    >
                        {isLoading ? 'Sending...' : 'Send Now'}
                    </button>
                    <div className="flex gap-4 text-[#64748b]">
                        <span className="cursor-pointer hover:text-[#1e293b]">📎</span>
                        <span className="cursor-pointer hover:text-[#1e293b]">🖼️</span>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;
