const request = require('supertest');
const app = require('./app');
const { initDb } = require('./db');
const path = require('path');
const fs = require('fs');
const { expect } = require('chai');

const TEST_DB = path.join(__dirname, 'test.sqlite');

describe('Auth API', () => {
    let db;

    before(async () => {
        if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
        db = await initDb(TEST_DB);
        app.setDb(db);
    });

    after(async () => {
        if (db) await db.close();
        if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });

    it('should sign up a new user', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });
        
        expect(res.statusCode).to.equal(201);
        expect(res.body).to.have.property('token');
        expect(res.body.email).to.equal('test@example.com');
    });

    it('should not sign up with existing email', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });
        
        expect(res.statusCode).to.equal(400);
        expect(res.body.error).to.equal('Email already exists');
    });

    it('should login with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });
        
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.have.property('token');
    });

    it('should not login with wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).to.equal(401);
        expect(res.body.error).to.equal('Invalid credentials');
    });
});
