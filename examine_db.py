import sqlite3
import os

DB_FILE = "conversions.db"

def examine_database():
    if not os.path.exists(DB_FILE):
        print(f"Database file {DB_FILE} does not exist.")
        return
    
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Get table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables in database:")
        for table in tables:
            print(f"  - {table[0]}")
        
        # Examine conversions table if it exists
        if ('conversions',) in tables:
            print("\nSchema of conversions table:")
            cursor.execute("PRAGMA table_info(conversions);")
            columns = cursor.fetchall()
            for col in columns:
                print(f"  {col[1]} ({col[2]})")
            
            print("\nSample data from conversions table (limit 5):")
            cursor.execute("SELECT * FROM conversions LIMIT 5;")
            rows = cursor.fetchall()
            if rows:
                for row in rows:
                    print(f"  {row}")
            else:
                print("  No data found")
                
            # Count total records
            cursor.execute("SELECT COUNT(*) FROM conversions;")
            count = cursor.fetchone()[0]
            print(f"\nTotal records in conversions table: {count}")
        else:
            print("Conversions table not found")
            
        conn.close()
    except Exception as e:
        print(f"Error examining database: {e}")

if __name__ == "__main__":
    examine_database()