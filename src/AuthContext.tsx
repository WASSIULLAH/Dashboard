import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
    user: { email: string } | null;
    token: string | null;
    login: (email: string, token: string) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<{ email: string } | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedEmail = localStorage.getItem('email');
        if (storedToken && storedEmail) {
            setToken(storedToken);
            setUser({ email: storedEmail });
        }
        setIsLoading(false);
    }, []);

    const login = (email: string, token: string) => {
        localStorage.setItem('token', token);
        localStorage.setItem('email', email);
        setToken(token);
        setUser({ email });
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
