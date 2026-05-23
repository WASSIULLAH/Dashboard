import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

export interface Account {
  email: string;
  name: string;
  avatar: string;
}

interface AccountContextType {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  addAccount: (account: Account) => void;
  removeAccount: (email: string) => void;
  isLoading: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { token, user } = useAuth();

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!token || !user) {
          setAccounts([]);
          return;
      }
      setIsLoading(true);
      try {
        const res = await axios.get('http://localhost:5000/api/accounts', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAccounts(res.data);
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [token, user]);

  const addAccount = (account: Account) => {
    setAccounts(prev => {
      const filtered = prev.filter(a => a.email !== account.email);
      return [...filtered, account];
    });
  };

  const removeAccount = async (email: string) => {
    // We should also call a backend route to delete the connection
    setAccounts(prev => prev.filter(a => a.email !== email));
  };

  return (
    <AccountContext.Provider value={{ accounts, setAccounts, addAccount, removeAccount, isLoading }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccounts = () => {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccounts must be used within AccountProvider');
  return context;
};
