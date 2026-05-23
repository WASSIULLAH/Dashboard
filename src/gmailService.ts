import axios from 'axios';

export interface EmailDetail {
  id: string;
  account: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  timestamp: number;
}

const API_BASE = 'http://localhost:5000/api';

export const fetchEmails = async (token: string, searchQuery: string = '', limit: number = 10): Promise<EmailDetail[]> => {
  const res = await axios.get(`${API_BASE}/emails`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: searchQuery, limit } // Pass both the search query and the limit
  });
  return res.data;
};

export const fetchEmailBody = async (token: string, accountId: string, messageId: string): Promise<string> => {
  const res = await axios.get(`${API_BASE}/emails/${accountId}/${messageId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.body;
};

export const sendEmail = async (masterToken: string, accountId: string, to: string, subject: string, body: string) => {
  await axios.post(
    `${API_BASE}/emails/send`,
    { accountId, to, subject, body },
    {
      headers: { Authorization: `Bearer ${masterToken}` }
    }
  );
};

export const performEmailAction = async (token: string, accountId: string, messageId: string, action: 'archive' | 'trash'): Promise<void> => {
  await axios.post(`${API_BASE}/emails/${accountId}/${messageId}/action`, { action }, {
    headers: { Authorization: `Bearer ${token}` }
  });
};
