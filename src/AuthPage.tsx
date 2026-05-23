import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

const AuthPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
        try {
            const res = await axios.post(`http://localhost:5000${endpoint}`, { email, password });
            login(res.data.email, res.data.token);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
            <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-[#e2e8f0]">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-50 rounded-xl mb-4">
                        <span className="text-2xl">📬</span>
                    </div>
                    <h1 className="text-24 font-semibold text-[#1e293b]">
                        {isLogin ? 'Welcome back' : 'Create an account'}
                    </h1>
                    <p className="text-14 text-[#64748b] mt-2">
                        {isLogin ? 'Enter your details to access your dashboard' : 'Start managing your 30+ emails in one place'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-13 font-medium text-[#1e293b] mb-1">Email</label>
                        <input 
                            type="email" 
                            required
                            className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-13 font-medium text-[#1e293b] mb-1">Password</label>
                        <input 
                            type="password" 
                            required
                            className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-13 text-red-500 text-center">{error}</p>}

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
                    >
                        {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : 'Get Started')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError(''); // <--- This fixes the visual bug!
                        }}
                        className="text-13 text-[#64748b] hover:text-[#3b82f6] transition-colors"
                    >
                        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
