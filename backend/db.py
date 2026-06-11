# db.py — SQLite storage for conversations and messages
import sqlite3
from datetime import datetime

DB_PATH = "chat.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # lets us access columns by name
    return conn

def init_db():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            role TEXT,
            text TEXT,
            sources TEXT,
            versions TEXT,
            created_at TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        )
    """)
    conn.commit()
    conn.close()
    print("Database ready.")
    
def init_feedback():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            message_text TEXT,
            rating TEXT,
            reason TEXT,
            comment TEXT,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()

def add_feedback(conversation_id, message_text, rating, reason=None, comment=None):
    conn = get_conn()
    conn.execute(
        "INSERT INTO feedback (conversation_id, message_text, rating, reason, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (conversation_id, message_text, rating, reason, comment, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()

def create_conversation(title="New conversation"):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO conversations (title, created_at) VALUES (?, ?)",
        (title, datetime.now().isoformat()),
    )
    conn.commit()
    conv_id = cur.lastrowid
    conn.close()
    return conv_id

def add_message(conversation_id, role, text, sources=None, versions=None):
    import json
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO messages (conversation_id, role, text, sources, versions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (conversation_id, role, text,
         json.dumps(sources) if sources else None,
         json.dumps(versions) if versions else None,
         datetime.now().isoformat()),
    )
    conn.commit()
    msg_id = cur.lastrowid
    conn.close()
    return msg_id

def get_conversations():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM conversations ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_messages(conversation_id):
    import json
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
        (conversation_id,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["sources"] = json.loads(d["sources"]) if d.get("sources") else []
        d["versions"] = json.loads(d["versions"]) if d.get("versions") else None
        result.append(d)
    return result

def update_title(conversation_id, title):
    conn = get_conn()
    conn.execute("UPDATE conversations SET title = ? WHERE id = ?", (title, conversation_id))
    conn.commit()
    conn.close()

def update_message(message_id, text, sources, versions):
    import json
    conn = get_conn()
    conn.execute(
        "UPDATE messages SET text = ?, sources = ?, versions = ? WHERE id = ?",
        (text, json.dumps(sources) if sources else None,
         json.dumps(versions) if versions else None, message_id),
    )
    conn.commit()
    conn.close()

def delete_conversation(conversation_id):
    conn = get_conn()
    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
    conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()