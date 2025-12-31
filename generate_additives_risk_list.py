import requests
import json

def generate_risk_lists():
    # If you are running this locally with the file you uploaded:
    # with open("additives_clean.json", "r") as f:
    #     data = json.load(f)
    
    # Or fetching fresh data:
    url = "https://static.openfoodfacts.org/data/taxonomies/additives.json"
    print(f"Downloading data from {url}...")
    response = requests.get(url)
    data = response.json()

    high_risk = []
    medium_risk = []
    
    # Debug sets to see all variations found
    efsa_values_found = set()
    anses_values_found = set()

    for tag, info in data.items():
        # 1. Extract values
        efsa_raw = info.get("efsa_evaluation_overexposure_risk", {}).get("en", "").lower()
        anses_raw = info.get("anses_additives_of_interest", {}).get("en", "").lower()
        
        # Store for debugging
        if efsa_raw: efsa_values_found.add(efsa_raw)
        if anses_raw: anses_values_found.add(anses_raw)

        # 2. Normalize (Remove 'en:' prefix if present)
        efsa_clean = efsa_raw.replace("en:", "")
        anses_clean = anses_raw.replace("en:", "")

        # 3. Categorize
        # HIGH RISK: EFSA says high OR ANSES says yes
        if efsa_clean == "high" or anses_clean == "yes":
            high_risk.append(tag)
        
        # MEDIUM RISK: EFSA says moderate (and not already flagged as high by ANSES)
        elif efsa_clean == "moderate":
            medium_risk.append(tag)

    high_risk.sort()
    medium_risk.sort()

    # 4. Output
    print(f"DEBUG: EFSA values found: {efsa_values_found}")
    print(f"DEBUG: ANSES values found: {anses_values_found}")
    print("-" * 30)
    print(f"High Risk Count: {len(high_risk)}")
    print(f"Medium Risk Count: {len(medium_risk)}")

    # Write files
    with open("high_risk_additives.txt", "w") as f:
        f.write(json.dumps(high_risk))
    
    with open("medium_risk_additives.txt", "w") as f:
        f.write(json.dumps(medium_risk))

if __name__ == "__main__":
    generate_risk_lists()
