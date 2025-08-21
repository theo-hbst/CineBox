import sys
import os

# Ajouter le chemin du module PyMovieDb
sys.path.append(os.path.join(os.path.dirname(__file__), 'PyMovieDb'))

from PyMovieDb import IMDB
import json
from http.server import SimpleHTTPRequestHandler, HTTPServer
import threading

# Fonction pour démarrer le serveur web
def start_server():
    handler = SimpleHTTPRequestHandler
    httpd = HTTPServer(('localhost', 8000), handler)
    print("Serving on http://localhost:8000")
    httpd.serve_forever()

# Démarrer le serveur web dans un thread séparé
server_thread = threading.Thread(target=start_server)
server_thread.daemon = True
server_thread.start()

imdb = IMDB()
res = imdb.popular_movies(genre=None, start_id=1, sort_by=None)
# returns top 50 popular movies starting from start id

# Remplacer les séquences \n par des retours à la ligne réels
res_str = json.dumps(res, indent=4)
res_str = res_str.replace('\\n', '\n')
res_str = res_str.replace('\\', '')

# Retirer les guillemets doubles au début et à la fin
if res_str.startswith('"') and res_str.endswith('"'):
    res_str = res_str[1:-1]

# Limiter le contenu jusqu'à la ligne 178
lines = res_str.split('\n')
limited_content = '\n'.join(lines[:171])

# Retirer la virgule après le dernier élément
if limited_content.endswith(','):
    limited_content = limited_content[:-1]

# Fermer correctement le JSON
limited_content += '\n  ]\n}'

with open('popular_movies.json', 'w') as f:
    f.write(limited_content)

# Garder le script en cours d'exécution
server_thread.join()