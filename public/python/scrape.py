import sys
import os
import json
import threading
from PyMovieDb import IMDB

version = "1.1"
logmessage = f"""


-------------------- START OF EXECUTION LOG --------------------
ver.{version}
"""

imdb = IMDB()
res = imdb.popular_movies(genre=None, start_id=1, sort_by=None)
# returns top 24 popular movies starting from start id

print(logmessage)
print("Scraping data sources from IMDb...")

# Remplacer les séquences \n par des retours à la ligne réels
res_str = json.dumps(res, indent=4, ensure_ascii=False)
res_str = res_str.replace('\\n', '\n')
res_str = res_str.replace('\\', '')

print("Data sources getting post-processed...")

# Retirer les guillemets doubles au début et à la fin
if res_str.startswith('"') and res_str.endswith('"'):
    res_str = res_str[1:-1]

# Limiter le contenu jusqu'à la ligne 171
lines = res_str.split('\n')
limited_content = '\n'.join(lines[:171])

# Retirer la virgule après le dernier élément
if limited_content.endswith(','):
    limited_content = limited_content[:-1]

print("Post-processing completed.")

# Fermer correctement le JSON
limited_content += '\n  ]\n}'

print("JSON parsing completed.")

# Vérifier si le fichier existe déjà
if os.path.exists('public/json/popular_movies.json'):
    print("Scrapping file already exists.")
    os.remove('public/json/popular_movies.json')
    print("File removed.")
    print("Creating new file...")
else:
    print("No scrapping file found.")
    print("Creating new file...")
    

with open('public/json/popular_movies.json', 'w', encoding='utf-8') as f:
    f.write(limited_content)

print("File created successfully.")
print("Done!")