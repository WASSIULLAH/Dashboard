require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { initDb } = require('./db');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

let db;

// Auth Middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// We'll expose a function to set the db, or use a getter
app.setDb = (database) => {
    db = database;
};

// --- AUTH ROUTES ---

app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );
        const token = jwt.sign({ id: result.lastID }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, email });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, email });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- ACCOUNT ROUTES ---

app.get('/api/accounts', authenticate, async (req, res) => {
    try {
        const accounts = await db.all('SELECT email, name, avatar FROM connected_accounts WHERE user_id = ?', [req.userId]);
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

app.get('/api/accounts/tokens', authenticate, async (req, res) => {
    try {
        const accounts = await db.all(
            'SELECT email, refresh_token FROM connected_accounts WHERE user_id = ?',
            [req.userId]
        );

        const tokenPromises = accounts.map(async (acc) => {
            const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
            oauth2Client.setCredentials({ refresh_token: acc.refresh_token });
            const { token } = await oauth2Client.getAccessToken();
            return { email: acc.email, accessToken: token };
        });

        const results = await Promise.all(tokenPromises);
        const tokenMap = results.reduce((acc, curr) => {
            acc[curr.email] = curr.accessToken;
            return acc;
        }, {});

        res.json(tokenMap);
    } catch (err) {
        console.error('Batch Refresh Error:', err);
        res.status(500).json({ error: 'Failed to refresh tokens' });
    }
});

app.get('/api/accounts/token/:email', authenticate, async (req, res) => {
    const { email } = req.params;
    try {
        const account = await db.get(
            'SELECT refresh_token FROM connected_accounts WHERE user_id = ? AND email = ?',
            [req.userId, email]
        );

        if (!account) return res.status(404).json({ error: 'Account not found' });

        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
        oauth2Client.setCredentials({ refresh_token: account.refresh_token });
        const { token } = await oauth2Client.getAccessToken();
        
        res.json({ accessToken: token });
    } catch (err) {
        console.error('Refresh Token Error:', err);
        res.status(500).json({ error: 'Failed to refresh access token' });
    }
});

app.get('/api/emails', authenticate, async (req, res) => {
    const { q, limit } = req.query; 
    const maxResults = parseInt(limit) || 10;

    try {
        const accounts = await db.all('SELECT email, refresh_token FROM connected_accounts WHERE user_id = ?', [req.userId]);
        if (accounts.length === 0) return res.json([]);

        const allEmailsPromises = accounts.map(async (acc) => {
            try {
                const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
                oauth2Client.setCredentials({ refresh_token: acc.refresh_token });
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                const response = await gmail.users.messages.list({ 
                    userId: 'me', 
                    maxResults: maxResults,
                    q: q || undefined 
                });
                
                const messages = response.data.messages || [];

                const detailedMessages = await Promise.all(messages.map(async (msg) => {
                    const msgData = await gmail.users.messages.get({ 
                        userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] 
                    });
                    const headers = msgData.data.payload.headers;
                    const internalDate = parseInt(msgData.data.internalDate);
                    
                    return {
                        id: msg.id,
                        account: acc.email,
                        sender: headers.find(h => h.name === 'From')?.value?.split('<')[0].trim() || 'Unknown',
                        subject: headers.find(h => h.name === 'Subject')?.value || '(No Subject)',
                        snippet: msgData.data.snippet,
                        date: new Date(internalDate).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                        timestamp: internalDate
                    };
                }));
                return detailedMessages;
            } catch (accountErr) {
                console.error(`Failed to fetch for ${acc.email}:`, accountErr.message);
                return [];
            }
        });

        const results = await Promise.all(allEmailsPromises);
        const merged = results.flat().sort((a, b) => b.timestamp - a.timestamp);
        res.json(merged);
    } catch (err) {
        console.error('Unified Inbox Error:', err);
        res.status(500).json({ error: 'Failed to fetch unified inbox' });
    }
});

const extractEmailBody = (payload) => {
    if (payload.body && payload.body.size > 0 && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
    if (payload.parts && payload.parts.length > 0) {
        let htmlPart = '';
        let textPart = '';
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html') {
                htmlPart = extractEmailBody(part);
            } else if (part.mimeType === 'text/plain') {
                textPart = extractEmailBody(part);
            } else if (part.parts) {
                const nested = extractEmailBody(part);
                if (nested) return nested;
            }
        }
        return htmlPart || textPart || 'No content available.';
    }
    return 'No content available.';
};

app.get('/api/emails/:accountId/:messageId', authenticate, async (req, res) => {
    try {
        const { accountId, messageId } = req.params;
        const account = await db.get('SELECT refresh_token FROM connected_accounts WHERE user_id = ? AND email = ?', [req.userId, accountId]);
        
        if (!account) return res.status(404).json({ error: 'Account not found' });

        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
        oauth2Client.setCredentials({ refresh_token: account.refresh_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const msgData = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        const htmlBody = extractEmailBody(msgData.data.payload);
        
        res.json({ body: htmlBody });
    } catch (err) {
        console.error('Failed to fetch single email:', err);
        res.status(500).json({ error: 'Failed to fetch email body' });
    }
});

const makeEmailBase64 = (from, to, subject, body) => {
    const str = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
    ].join('\n');
    
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

app.post('/api/emails/send', authenticate, async (req, res) => {
    const { accountId, to, subject, body } = req.body;
    
    try {
        const account = await db.get('SELECT refresh_token FROM connected_accounts WHERE user_id = ? AND email = ?', [req.userId, accountId]);
        if (!account) return res.status(404).json({ error: 'Account not found' });

        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
        oauth2Client.setCredentials({ refresh_token: account.refresh_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const rawMessage = makeEmailBase64(accountId, to, subject, body);
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawMessage }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to send email:', err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.post('/api/emails/:accountId/:messageId/action', authenticate, async (req, res) => {
    const { accountId, messageId } = req.params;
    const { action } = req.body;

    try {
        const account = await db.get('SELECT refresh_token FROM connected_accounts WHERE user_id = ? AND email = ?', [req.userId, accountId]);
        if (!account) return res.status(404).json({ error: 'Account not found' });

        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
        oauth2Client.setCredentials({ refresh_token: account.refresh_token });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        if (action === 'archive') {
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: { removeLabelIds: ['INBOX'] }
            });
        } else if (action === 'trash') {
            await gmail.users.messages.trash({
                userId: 'me',
                id: messageId
            });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(`Failed to ${action} email:`, err);
        res.status(500).json({ error: `Failed to ${action} email` });
    }
});

app.post('/api/accounts/connect', authenticate, async (req, res) => {
    const { code } = req.body;
    try {
        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfoRes = await oauth2.userinfo.get();
        const userInfo = userInfoRes.data;

        await db.run(
            `INSERT INTO connected_accounts (user_id, email, name, avatar, refresh_token) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id, email) DO UPDATE SET 
             refresh_token = excluded.refresh_token,
             name = excluded.name,
             avatar = excluded.avatar`,
            [req.userId, userInfo.email, userInfo.name, userInfo.picture, tokens.refresh_token]
        );

        res.json({ 
            email: userInfo.email, 
            name: userInfo.name, 
            avatar: userInfo.picture 
        });
    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).json({ error: 'Failed to connect account' });
    }
});

module.exports = app;
