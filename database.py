import sqlite3
import os
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "conversions.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = None
    try:
        conn = get_db_connection()
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    from_currency TEXT NOT NULL,
                    from_amount REAL NOT NULL,
                    to_currency TEXT NOT NULL,
                    to_amount REAL NOT NULL,
                    rate REAL NOT NULL,
                    date TEXT NOT NULL
                )
            """)
        print("SQLite Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing SQLite database: {e}")
    finally:
        if conn:
            conn.close()

def get_history(limit=50):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT timestamp, from_currency, from_amount, to_currency, to_amount, rate, date
            FROM conversions
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        
        history = []
        for r in rows:
            history.append({
                "time": r["timestamp"],
                "from": r["from_currency"],
                "fromAmt": r["from_amount"],
                "to": r["to_currency"],
                "toAmt": r["to_amount"],
                "rate": r["rate"],
                "date": r["date"]
            })
        return history
    except Exception as e:
        print(f"Error querying history from database: {e}")
        return []
    finally:
        if conn:
            conn.close()

def add_history_record(from_curr, from_amt, to_curr, to_amt, rate):
    conn = None
    try:
        conn = get_db_connection()
        with conn:
            cursor = conn.cursor()
            now = datetime.now()
            timestamp = now.strftime("%H:%M")
            date_str = now.strftime("%Y-%m-%d")
            
            cursor.execute("""
                INSERT INTO conversions (timestamp, from_currency, from_amount, to_currency, to_amount, rate, date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (timestamp, from_curr, from_amt, to_curr, to_amt, rate, date_str))
        return True
    except Exception as e:
        print(f"Error saving history record: {e}")
        return False
    finally:
        if conn:
            conn.close()

def clear_history():
    conn = None
    try:
        conn = get_db_connection()
        with conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM conversions")
        return True
    except Exception as e:
        print(f"Error clearing database history: {e}")
        return False
    finally:
        if conn:
            conn.close()

