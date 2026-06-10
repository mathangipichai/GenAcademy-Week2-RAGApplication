import os
import json
from collections import Counter

LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "logs", "query_history.jsonl")

def analyze():
    if not os.path.exists(LOG_FILE):
        print(f"No log file found at {LOG_FILE}. Submit queries through the chatbot first!")
        return

    print("Analyzing RAG query logs for continuous improvement...")
    
    total_queries = 0
    statuses = []
    cities = []
    fallback_cities = []
    topics = []
    
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                total_queries += 1
                status = data.get("status", "error")
                city = data.get("city", "")
                topic = data.get("topic", "general")
                
                statuses.append(status)
                if city:
                    cities.append(city)
                topics.append(topic)
                
                if status == "answered_fallback_state" and city:
                    fallback_cities.append(city)
            except Exception as e:
                print(f"Skipping malformed line: {e}")
                
    if total_queries == 0:
        print("No queries logged yet.")
        return

    status_counts = Counter(statuses)
    city_counts = Counter(cities)
    fallback_city_counts = Counter(fallback_cities)
    topic_counts = Counter(topics)
    
    print("\n" + "=" * 50)
    print(f"📊 RAG USAGE SUMMARY ({total_queries} TOTAL QUERIES)")
    print("=" * 50)
    
    print("\n🟢 RESPONSE STATUS BREAKDOWN:")
    for status, count in status_counts.items():
        pct = (count / total_queries) * 100
        print(f"  - {status:<24}: {count:<4} ({pct:.1f}%)")
        
    print("\n🔍 MOST SEARCHED CITIES:")
    for city, count in city_counts.most_common(5):
        print(f"  - {city:<24}: {count:<4}")
        
    print("\n📝 TOP SEARCHED LEGAL TOPICS:")
    for topic, count in topic_counts.most_common(5):
        print(f"  - {topic:<24}: {count:<4}")
        
    print("\n" + "!" * 50)
    print("⚠️ KNOWLEDGE BASE GAPS DETECTED (FALLBACKS TO STATE LAW)")
    print("!" * 50)
    if fallback_city_counts:
        print("The following cities were queried but lack city-specific ordinances in the database:")
        for city, count in fallback_city_counts.most_common():
            print(f"  - {city:<24}: {count} queries resolved via State Property Code")
        print("\n👉 ACTION ITEM: Author data files in 'data/knowledge_base/<city>.md' to resolve these gaps.")
    else:
        print("No knowledge base gaps detected. All city-specific queries were successfully resolved with local ordinances!")
        
    print("\n" + "=" * 50)

if __name__ == "__main__":
    analyze()
