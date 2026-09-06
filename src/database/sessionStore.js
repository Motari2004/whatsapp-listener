const { Pool } = require('pg');

class SessionStore {
  constructor() {
    this.pool = null;
    this.sessionId = 'whatsapp-session';
    this.tableName = 'whatsapp_sessions';
  }

  async connect() {
    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Create table if it doesn't exist
      await this.createTable();
      console.log('✅ Connected to PostgreSQL');
      return this.pool;
    } catch (error) {
      console.error('❌ PostgreSQL connection error:', error);
      throw error;
    }
  }

  async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        session_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    try {
      await this.pool.query(query);
      console.log('✅ Session table created/verified');
    } catch (error) {
      console.error('❌ Error creating table:', error);
      throw error;
    }
  }

  async saveSession(sessionData) {
    try {
      const query = `
        INSERT INTO ${this.tableName} (session_id, session_data, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (session_id) 
        DO UPDATE SET 
          session_data = EXCLUDED.session_data,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      
      const values = [this.sessionId, JSON.stringify(sessionData)];
      const result = await this.pool.query(query, values);
      
      console.log('✅ Session saved to database');
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error saving session:', error);
      throw error;
    }
  }

  async loadSession() {
    try {
      const query = `
        SELECT session_data 
        FROM ${this.tableName} 
        WHERE session_id = $1
      `;
      
      const result = await this.pool.query(query, [this.sessionId]);
      
      if (result.rows.length > 0) {
        console.log('✅ Session loaded from database');
        return result.rows[0].session_data;
      }
      
      console.log('ℹ️ No existing session found');
      return null;
    } catch (error) {
      console.error('❌ Error loading session:', error);
      return null;
    }
  }

  async deleteSession() {
    try {
      const query = `
        DELETE FROM ${this.tableName} 
        WHERE session_id = $1
      `;
      
      await this.pool.query(query, [this.sessionId]);
      console.log('✅ Session deleted from database');
    } catch (error) {
      console.error('❌ Error deleting session:', error);
    }
  }

  async getAllSessions() {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        ORDER BY updated_at DESC
      `;
      
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching sessions:', error);
      return [];
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 Disconnected from PostgreSQL');
    }
  }
}

module.exports = SessionStore;